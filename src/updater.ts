// Updates for the installed apps. The browser studio updates itself through its service worker.
// The Windows app (Tauri) downloads a signed release, verifies it against the public key it
// ships with, installs it and restarts. The Android app is installed outside the Play Store and
// cannot replace itself silently, so it offers the new APK and opens its download.
import type { Update } from '@tauri-apps/plugin-updater'
import { useStore } from './store'
import { isNative } from './native'

declare const __APP_VERSION__: string
/** This build's version: src-tauri/tauri.conf.json, kept equal to Android's versionName. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

/** What the Android app asks; the Windows updater reads latest.json from the same release. */
const RELEASES_API = 'https://api.github.com/repos/Jatin-Dhir/vastu-studio/releases/latest'

export const isDesktopApp = (): boolean => !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
export const canUpdate = (): boolean => isDesktopApp() || isNative()

/** True when version a is newer than b: "1.3.10" is newer than "1.3.9". */
export function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

let running = false

/** Look for a newer release. Silent when there is nothing new, unless the person asked. */
export async function checkForUpdates(manual = false): Promise<void> {
  if (!canUpdate()) {
    if (manual) useStore.getState().toast('The browser studio updates itself. Reload the page for the newest version', 'info')
    return
  }
  if (running) return
  running = true
  try {
    if (isDesktopApp()) await checkDesktop(manual)
    else await checkAndroid(manual)
  } finally {
    running = false
  }
}

function offer(version: string, actionLabel: string, install: () => void) {
  const s = useStore.getState()
  s.setAppUpdate({ version, install })
  // longer than other action toasts, and the menu keeps the offer after it fades
  s.toast(`Version ${version} is available`, 'info', actionLabel, install, { durationMs: 30_000 })
}

const upToDate = (version: string) => useStore.getState().toast(`This is the newest version, ${version}`, 'ok')
const noConnection = () => useStore.getState().toast("Couldn't check for updates. Check the internet connection and try again", 'warn')

async function checkDesktop(manual: boolean) {
  const { check } = await import('@tauri-apps/plugin-updater')
  let update: Update | null = null
  try {
    update = await check({ timeout: 20_000 })
  } catch {
    if (manual) noConnection()
    return
  }
  if (!update) {
    if (manual) upToDate(APP_VERSION)
    return
  }
  const u = update
  offer(u.version, 'Install and restart', () => void installDesktop(u))
}

async function installDesktop(update: Update) {
  const s = useStore.getState()
  s.setBusy('Downloading the update…')
  try {
    let total = 0
    let got = 0
    await update.downloadAndInstall((ev) => {
      if (ev.event === 'Started') total = ev.data.contentLength ?? 0
      else if (ev.event === 'Progress') {
        got += ev.data.chunkLength
        if (total > 0) s.setBusy(`Downloading the update… ${Math.min(100, Math.round((got / total) * 100))}%`)
      } else if (ev.event === 'Finished') s.setBusy('Installing the update…')
    })
    // Windows closes the app while its installer runs and starts the new version after; other
    // systems restart into it here
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  } catch {
    s.setBusy(null)
    s.toast("The update didn't finish. This version still works; try again from the menu", 'warn')
  }
}

async function checkAndroid(manual: boolean) {
  let current = APP_VERSION
  try {
    const { App } = await import('@capacitor/app')
    current = (await App.getInfo()).version || current
  } catch { /* keep the build's own version */ }
  let release: { tag_name?: string; assets?: { name: string; browser_download_url: string }[] }
  try {
    const r = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    release = await r.json()
  } catch {
    if (manual) noConnection()
    return
  }
  const latest = (release.tag_name ?? '').replace(/^v/i, '')
  const apk = release.assets?.find((a) => /\.apk$/i.test(a.name))?.browser_download_url
  if (!latest || !apk || !isNewer(latest, current)) {
    if (manual) upToDate(current)
    return
  }
  // the browser saves the APK, and opening it installs over this version, plans kept
  offer(latest, 'Download', () => { window.location.assign(apk) })
}
