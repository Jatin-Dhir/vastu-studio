import { useStore } from './store'
import type { LicenseSnapshot } from './types'
import { API_BASE, LICENSING_ENABLED, OFFLINE_GRACE, REVALIDATE_EVERY } from './licenseConfig'

/** Full local record — key + Lemon Squeezy instance id live only here (localStorage),
 *  the app state only ever sees the display-safe LicenseSnapshot. */
interface StoredLicense {
  key: string
  instanceId: string
  plan: string
  renewsAt: string | null
  /** epoch ms of the last successful validate/activate against the store */
  lastCheck: number
  expired?: boolean
}

const STORE_KEY = 'vastu-studio.license.v1'
const GATE_SEEN_KEY = 'vastu-studio.gate-seen.v1'
const TRIAL_KEY = 'vastu-studio.trial.v1'
export const TRIAL_DAYS = 14
/** Dev-only key that activates without a store, so the whole flow is testable
 *  before Lemon Squeezy exists. Compiled out of production builds entirely. */
const DEV_KEY = 'TEST-TEST-TEST-TEST'

function loadStored(): StoredLicense | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p.key === 'string' && typeof p.instanceId === 'string') return p as StoredLicense
  } catch { /* corrupt or private mode */ }
  return null
}
function saveStored(rec: StoredLicense | null) {
  try {
    if (rec) localStorage.setItem(STORE_KEY, JSON.stringify(rec))
    else localStorage.removeItem(STORE_KEY)
  } catch { /* private mode */ }
}

/** Whole days of trial remaining. The clock starts the first time this runs on a
 *  device; in private browsing (nothing persists) stay generous rather than lock. */
function trialDaysLeft(): number {
  try {
    let raw = localStorage.getItem(TRIAL_KEY)
    if (!raw) { raw = String(Date.now()); localStorage.setItem(TRIAL_KEY, raw) }
    const started = Number(raw) || Date.now()
    return Math.max(0, Math.ceil((TRIAL_DAYS * 86400000 - (Date.now() - started)) / 86400000))
  } catch { return TRIAL_DAYS }
}

function toSnapshot(rec: StoredLicense | null): LicenseSnapshot {
  if (!LICENSING_ENABLED) return { status: 'unconfigured' }
  if (!rec) {
    const daysLeft = trialDaysLeft()
    return daysLeft > 0 ? { status: 'trial', daysLeft } : { status: 'trial-ended' }
  }
  const keyTail = rec.key.slice(-4)
  if (rec.expired) return { status: 'expired', keyTail }
  return { status: 'active', plan: rec.plan, renewsAt: rec.renewsAt, keyTail }
}

/** The compass, zones and findings are the paid insight. Free while the trial
 *  runs; locked once it ends or a subscription lapses. */
export function analysisAllowed(lic: LicenseSnapshot): boolean {
  return lic.status === 'unconfigured' || lic.status === 'active' || lic.status === 'trial'
}

/** Gate for analysis surfaces once the trial is over. True = proceed. */
export function requireAnalysis(): boolean {
  if (analysisAllowed(useStore.getState().license)) return true
  useStore.getState().setActivationOpen(true)
  return false
}

function publish(rec: StoredLicense | null) {
  useStore.getState().setLicense(toSnapshot(rec))
}

/** POST to our Pages Function, which forwards to Lemon Squeezy's License API and
 *  rejects keys that belong to any other store/product. */
async function api(action: 'activate' | 'validate' | 'deactivate', body: Record<string, string>): Promise<any> {
  const res = await fetch(`${API_BASE}/api/license`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'The licence service is unreachable right now — try again in a moment')
  return data
}

/** Activate a key on this device. Resolves with null on success, or a
 *  human-readable problem to show inline (never throws for expected failures). */
export async function activateKey(rawKey: string): Promise<string | null> {
  const key = rawKey.trim()
  if (!key) return 'Enter the licence key from your purchase email'
  if (import.meta.env.DEV && key.toUpperCase() === DEV_KEY) {
    const rec: StoredLicense = { key: DEV_KEY, instanceId: 'dev', plan: 'Studio (dev)', renewsAt: null, lastCheck: Date.now() }
    saveStored(rec); publish(rec)
    return null
  }
  try {
    const data = await api('activate', { key, instanceName: deviceName() })
    if (!data.activated) return data.error || 'That key could not be activated — check it against your purchase email'
    const rec: StoredLicense = {
      key,
      instanceId: data.instanceId ?? '',
      plan: data.plan ?? 'Vastu Studio',
      renewsAt: data.renewsAt ?? null,
      lastCheck: Date.now(),
    }
    saveStored(rec); publish(rec)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Activation failed — try again in a moment'
  }
}

/** Release this device so the key can be used on another. */
export async function deactivate(): Promise<void> {
  const rec = loadStored()
  saveStored(null); publish(null)
  if (rec && rec.instanceId && rec.instanceId !== 'dev') {
    try { await api('deactivate', { key: rec.key, instanceId: rec.instanceId }) } catch { /* released locally regardless */ }
  }
}

/** Boot + periodic check: confirm the subscription is still live, with an offline
 *  grace window so the app never locks someone out for lacking connectivity. */
export async function revalidateIfDue(): Promise<void> {
  const rec = loadStored()
  if (!rec || rec.instanceId === 'dev') return
  if (Date.now() - rec.lastCheck < REVALIDATE_EVERY) return
  try {
    const data = await api('validate', { key: rec.key, instanceId: rec.instanceId })
    if (data.valid) {
      const next: StoredLicense = { ...rec, expired: false, plan: data.plan ?? rec.plan, renewsAt: data.renewsAt ?? rec.renewsAt, lastCheck: Date.now() }
      saveStored(next); publish(next)
    } else {
      // the store answered and said no — subscription lapsed or key revoked
      const next: StoredLicense = { ...rec, expired: true, lastCheck: Date.now() }
      saveStored(next); publish(next)
      useStore.getState().toast('Your Vastu Studio subscription has ended — renew to keep exporting', 'warn')
    }
  } catch {
    // unreachable (offline, or service down): honor the grace window, then expire softly
    if (Date.now() - rec.lastCheck > OFFLINE_GRACE) {
      const next: StoredLicense = { ...rec, expired: true }
      saveStored(next); publish(next)
    }
  }
}

/** Gate for paid features. True = proceed. False = the activation page has been
 *  opened to explain; the caller simply returns. */
export function requireLicense(): boolean {
  const lic = useStore.getState().license
  if (lic.status === 'unconfigured' || lic.status === 'active') return true
  useStore.getState().setActivationOpen(true)
  return false
}

/** Wire licensing into the app at boot. */
export function initLicensing() {
  const rec = loadStored()
  publish(rec)
  if (!LICENSING_ENABLED) return
  void revalidateIfDue()
  // first launch ever: introduce the product once, then never ambush again —
  // afterwards the page only appears from the Activate pill, menu, or a locked action
  let seen = false
  try { seen = localStorage.getItem(GATE_SEEN_KEY) === '1' } catch { /* private mode */ }
  if (!rec && !seen) {
    useStore.getState().setActivationOpen(true)
    try { localStorage.setItem(GATE_SEEN_KEY, '1') } catch { /* private mode */ }
  }
}

function deviceName(): string {
  const ua = navigator.userAgent
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Mac/i.test(ua) ? 'Mac' : /Win/i.test(ua) ? 'Windows' : 'Device'
  return `Vastu Studio on ${os}`
}
