import { useStore } from '../store'
import { setCharts, type Charts } from '../rules16'
import { AUTH_ENABLED, supabase } from './supabase'
import { deviceId, deviceName } from './device'
import type { AuthSnapshot, AuthUser, BlockReason } from './types'

/** Keep working this long past the last successful check when the server is
 *  unreachable — a site visit without signal must not lock the practitioner out. */
const GRACE_MS = 3 * 24 * 60 * 60 * 1000
const HEARTBEAT_MS = 5 * 60 * 1000
const LAST_OK_KEY = 'vastu-studio.auth-lastok.v1'
const CHARTS_KEY = 'vastu-studio.charts.v1'
const BROADCAST_SEEN_KEY = 'vastu-studio.broadcast-seen.v1'

const setAuth = (a: AuthSnapshot) => useStore.getState().setAuth(a)

/** The auth user behind a phone number: no SMS provider needed, the phone stays the identity. */
export const phoneToEmail = (p: string) => `${p.replace(/^\+/, '')}@phone.vastustudio.app`

/** Indian numbers typed the local way become E.164; anything already international passes. */
export function normalizePhone(raw: string): string {
  const s = raw.replace(/[\s\-().]/g, '')
  if (s.startsWith('+')) return s
  if (s.startsWith('00')) return '+' + s.slice(2)
  const d = s.replace(/\D/g, '')
  if (d.length === 10) return '+91' + d
  if (d.length === 11 && d.startsWith('0')) return '+91' + d.slice(1)
  if (d.length === 12 && d.startsWith('91')) return '+' + d
  return '+' + d
}

interface StateRes {
  state: 'ok' | BlockReason
  id?: string; name?: string; phone?: string; role?: 'user' | 'admin'
  expires_at?: string | null; active_device_name?: string | null
}

function userOf(r: StateRes): AuthUser | undefined {
  if (!r.id) return undefined
  return { id: r.id, name: r.name ?? '', phone: r.phone ?? '', role: r.role ?? 'user', expiresAt: r.expires_at ?? null }
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

function rememberOk(user: AuthUser) {
  try { localStorage.setItem(LAST_OK_KEY, JSON.stringify({ t: Date.now(), user })) } catch { /* private mode */ }
}
function lastOk(): { t: number; user: AuthUser } | null {
  try { const raw = localStorage.getItem(LAST_OK_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}
function forgetOk() {
  try { localStorage.removeItem(LAST_OK_KEY); localStorage.removeItem(CHARTS_KEY) } catch { /* private mode */ }
}

/** Apply a server verdict to the app state. */
function apply(r: StateRes) {
  const user = userOf(r)
  if (r.state === 'ok' && user) {
    setAuth({ status: 'ok', user })
    rememberOk(user)
  } else {
    setAuth({ status: 'blocked', reason: r.state === 'ok' ? 'no_profile' : r.state, user, deviceName: r.active_device_name ?? undefined })
  }
}

/* ------------------------------------------------------------------ charts -- */
let chartsLoadedAt = 0

function cacheCharts(c: Charts) {
  // an offline day must still analyse — keep a copy, lightly wrapped, tied to the grace window
  try { localStorage.setItem(CHARTS_KEY, btoa(unescape(encodeURIComponent(JSON.stringify({ t: Date.now(), c }))))) } catch { /* private mode */ }
}
function cachedCharts(): Charts | null {
  try {
    const raw = localStorage.getItem(CHARTS_KEY)
    if (!raw) return null
    const p = JSON.parse(decodeURIComponent(escape(atob(raw))))
    return Date.now() - p.t < GRACE_MS ? p.c : null
  } catch { return null }
}

async function loadCharts(force = false) {
  if (!force && chartsLoadedAt && Date.now() - chartsLoadedAt < 24 * 60 * 60 * 1000) return
  const c = await rpc<Charts>('get_charts', { p_device: deviceId() })
  setCharts(c)
  cacheCharts(c)
  chartsLoadedAt = Date.now()
  useStore.getState().setChartsReady(true)
}

/* -------------------------------------------------------------- broadcasts -- */
async function fetchBroadcast() {
  const { data } = await supabase().from('broadcasts').select('id,message').eq('active', true).order('id', { ascending: false }).limit(1)
  const b = data?.[0]
  if (!b) { useStore.getState().setBroadcast(null); return }
  let seen = 0
  try { seen = Number(localStorage.getItem(BROADCAST_SEEN_KEY) ?? 0) } catch { /* private mode */ }
  useStore.getState().setBroadcast(b.id > seen ? { id: b.id, message: b.message } : null)
}
export function dismissBroadcast(id: number) {
  try { localStorage.setItem(BROADCAST_SEEN_KEY, String(id)) } catch { /* private mode */ }
  useStore.getState().setBroadcast(null)
}

/* ------------------------------------------------------------------ events -- */
export function logEvent(kind: string, meta?: Record<string, unknown>) {
  const a = useStore.getState().auth
  if (a.status !== 'ok' || a.offline) return
  void supabase().from('usage_events').insert({ user_id: a.user.id, kind, meta: meta ?? null }).then(() => { /* fire and forget */ })
}

/* ------------------------------------------------------------------ checks -- */
let lastCheckAt = 0
let checking = false

/** Ask the server whether this device still holds a valid seat. Offline falls back
 *  to the grace window; a real "no" from the server always wins. */
export async function check(): Promise<void> {
  if (!AUTH_ENABLED || checking) return
  checking = true
  try {
    const { data: { session } } = await supabase().auth.getSession()
    if (!session) { setAuth({ status: 'signed-out' }); return }
    let res: StateRes
    try {
      res = await rpc<StateRes>('heartbeat', { p_device: deviceId() })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/not signed in|JWT|jwt/i.test(msg)) { setAuth({ status: 'signed-out' }); return }
      // unreachable: honour the grace window with the cached identity and charts
      const ok = lastOk()
      if (ok && Date.now() - ok.t < GRACE_MS) {
        const cached = cachedCharts()
        if (cached) { setCharts(cached); useStore.getState().setChartsReady(true) }
        setAuth({ status: 'ok', user: ok.user, offline: true })
      } else {
        setAuth({ status: 'blocked', reason: 'offline', user: ok?.user })
      }
      return
    }
    apply(res)
    lastCheckAt = Date.now()
    if (res.state === 'ok') {
      try { await loadCharts() } catch { /* keep the previous charts */ }
      void fetchBroadcast()
    }
  } finally {
    checking = false
  }
}

export async function signIn(phone: string, password: string): Promise<string | null> {
  const p = normalizePhone(phone)
  if (!/^\+[1-9]\d{7,14}$/.test(p)) return 'Enter the phone number your account was created with'
  if (!password) return 'Enter your password'
  const { error } = await supabase().auth.signInWithPassword({ email: phoneToEmail(p), password })
  if (error) {
    if (/invalid login|invalid credentials/i.test(error.message)) return 'That phone number and password don’t match'
    if (/fetch|network/i.test(error.message)) return 'Can’t reach the server — check your connection and try again'
    return error.message
  }
  return takeSeat()
}

/** Claim the seat for this device (a fresh sign-in, or "use it here instead"). */
export async function takeSeat(): Promise<string | null> {
  try {
    const res = await rpc<StateRes>('claim_device', { p_device: deviceId(), p_name: deviceName() })
    apply(res)
    lastCheckAt = Date.now()
    if (res.state === 'ok') {
      try { await loadCharts(true) } catch { /* the next heartbeat retries */ }
      logEvent('login')
      void fetchBroadcast()
    }
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Sign-in failed — try again in a moment'
  }
}

export async function signOut(): Promise<void> {
  try { await rpc('release_device', { p_device: deviceId() }) } catch { /* released locally regardless */ }
  try { await supabase().auth.signOut() } catch { /* already gone */ }
  forgetOk()
  chartsLoadedAt = 0
  useStore.getState().setChartsReady(false)
  setAuth({ status: 'signed-out' })
}

/** No project configured (offline development only): seed the charts from the gitignored
 *  rules/charts.json, fetched from the dev server — never imported, so no build can inline
 *  it. Production builds always have a project and skip this entirely. */
function loadDevCharts() {
  if (!import.meta.env.DEV) return
  void fetch(`${import.meta.env.BASE_URL}rules/charts.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((c: Charts | null) => { if (c) { setCharts(c); useStore.getState().setChartsReady(true) } })
    .catch(() => { /* no local charts — analysis stays empty in this dev session */ })
}

/** Wire accounts into the app at boot: restore the session, verify the seat, keep verifying. */
export function initAuth(): void {
  if (!AUTH_ENABLED) { setAuth({ status: 'off' }); loadDevCharts(); return }
  setAuth({ status: 'loading' })
  void check().then(() => { if (useStore.getState().auth.status === 'ok') logEvent('open') })
  supabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') setAuth({ status: 'signed-out' })
  })
  window.setInterval(() => { if (document.visibilityState === 'visible') void check() }, HEARTBEAT_MS)
  const onWake = () => { if (Date.now() - lastCheckAt > 30_000) void check() }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onWake() })
  window.addEventListener('focus', onWake)
  window.addEventListener('online', () => void check())
}
