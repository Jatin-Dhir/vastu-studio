import { useSyncExternalStore } from 'react'
import { isNative } from '../native'

/* Which shell to render. The phone app is its own product surface (bottom tabs, one task
 * per screen); the desktop studio stays as it is. A touch device at phone size, or the
 * native Android/iOS shell, gets the phone app. `?m=1` forces it for testing in a browser. */

const FORCE_KEY = 'vastu-studio.force-phone'

export function rememberForcedPhone(): void {
  try {
    const q = new URLSearchParams(location.search)
    if (q.get('m') === '1') sessionStorage.setItem(FORCE_KEY, '1')
    if (q.get('m') === '0') sessionStorage.removeItem(FORCE_KEY)
  } catch { /* private mode */ }
}

export function isPhone(): boolean {
  if (typeof window === 'undefined') return false
  try { if (sessionStorage.getItem(FORCE_KEY) === '1') return true } catch { /* private mode */ }
  if (isNative()) return true
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return coarse && Math.min(window.innerWidth, window.innerHeight) <= 760
}

const listeners = new Set<() => void>()
let cached = isPhone()
function recompute() {
  const next = isPhone()
  if (next !== cached) { cached = next; listeners.forEach((l) => l()) }
}
if (typeof window !== 'undefined') {
  window.addEventListener('resize', recompute)
  window.matchMedia?.('(pointer: coarse)').addEventListener?.('change', recompute)
}

export function usePhone(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => cached,
    () => false,
  )
}
