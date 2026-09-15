const KEY = 'vastu-studio.device.v1'

/** A stable id for this install — the unit the one-seat rule counts. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    // private mode: a throwaway id — the seat moves here for this session only
    return `ephemeral-${Math.random().toString(36).slice(2)}`
  }
}

export function deviceName(): string {
  const ua = navigator.userAgent
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Mac/i.test(ua) ? 'Mac' : /Win/i.test(ua) ? 'Windows PC' : 'Device'
  const app = (window as unknown as { __TAURI__?: unknown }).__TAURI__ ? 'Vastu Studio app' : 'Vastu Studio in the browser'
  return `${app} · ${os}`
}
