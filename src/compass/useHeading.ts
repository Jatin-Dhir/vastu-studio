import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeDeg, smoothHeading, tiltFromGravity } from './math'

/* The phone's heading, from the platform's fused orientation sensor, smoothed and
 * optionally corrected from magnetic to true north with a declination model. Nothing
 * here is Vastu-specific: it is the instrument, the screens read it. */

export type HeadingSupport = 'unknown' | 'needs-permission' | 'listening' | 'unsupported'

export interface Declination {
  deg: number
  model: string
  uncertaintyDeg: number | null
  lat: number
  lon: number
  at: number
}

export interface HeadingState {
  /** raw sensor heading, magnetic north, smoothed */
  magneticDeg: number | null
  /** tilt from flat in degrees (null until the motion sensor reports) */
  tiltDeg: number | null
  support: HeadingSupport
  declination: Declination | null
  /** null = not asked yet; 'denied' | 'unavailable' | 'ok' */
  location: 'idle' | 'asking' | 'ok' | 'denied' | 'unavailable'
}

const DECL_KEY = 'vastu-studio.declination.v1'
const DECL_TTL = 30 * 24 * 60 * 60 * 1000
/** The Jyotisha service's WMM endpoint (no auth): declination for a position. */
const DECL_URL = 'https://68-233-116-158.sslip.io/api/v1/vastu/declination'

function cachedDeclination(lat: number, lon: number): Declination | null {
  try {
    const raw = localStorage.getItem(DECL_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Declination
    // declination barely moves over city-scale distances — reuse within ~20 km, for a month
    const near = Math.abs(d.lat - lat) < 0.2 && Math.abs(d.lon - lon) < 0.2
    return near && Date.now() - d.at < DECL_TTL ? d : null
  } catch { return null }
}

async function fetchDeclination(lat: number, lon: number): Promise<Declination | null> {
  const hit = cachedDeclination(lat, lon)
  if (hit) return hit
  try {
    const res = await fetch(`${DECL_URL}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const j = await res.json() as { declination_deg: number; model?: string; uncertainty_deg?: number }
    const d: Declination = { deg: j.declination_deg, model: j.model ?? 'WMM', uncertaintyDeg: j.uncertainty_deg ?? null, lat, lon, at: Date.now() }
    try { localStorage.setItem(DECL_KEY, JSON.stringify(d)) } catch { /* private mode */ }
    return d
  } catch { return null }
}

type OrientationEventLike = DeviceOrientationEvent & { webkitCompassHeading?: number; absolute?: boolean }
type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

/** Magnetic heading from an orientation event: iOS reports it directly; Android's
 *  absolute alpha counts anticlockwise from north, so the heading is its complement. */
function headingFrom(e: OrientationEventLike): number | null {
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) return normalizeDeg(e.webkitCompassHeading)
  if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) return normalizeDeg(360 - e.alpha)
  return null
}

export function useHeading(active: boolean): HeadingState & { enable: () => Promise<void> } {
  const [state, setState] = useState<HeadingState>({ magneticDeg: null, tiltDeg: null, support: 'unknown', declination: null, location: 'idle' })
  const smoothed = useRef<number | null>(null)
  const lastTilt = useRef(0)
  const started = useRef(false)

  const listen = useCallback(() => {
    if (started.current) return
    started.current = true
    // absolute orientation (Android) first; plain orientation carries the iOS compass heading
    const onOrient = (ev: Event) => {
      const e = ev as OrientationEventLike
      const h = headingFrom(e)
      if (h == null) return
      smoothed.current = smoothHeading(smoothed.current, h)
      setState((s) => ({ ...s, magneticDeg: smoothed.current, support: 'listening' }))
    }
    const onMotion = (ev: DeviceMotionEvent) => {
      const g = ev.accelerationIncludingGravity
      if (!g || g.x == null || g.y == null || g.z == null) return
      const t = tiltFromGravity(g.x, g.y, g.z)
      // throttle: the tilt pill only needs to know when it crosses its threshold
      if (Math.abs(t - lastTilt.current) < 1.5) return
      lastTilt.current = t
      setState((s) => ({ ...s, tiltDeg: t }))
    }
    const hasAbsolute = 'ondeviceorientationabsolute' in window
    window.addEventListener(hasAbsolute ? 'deviceorientationabsolute' : 'deviceorientation', onOrient as EventListener)
    window.addEventListener('devicemotion', onMotion)
    // no sensor event within a few seconds = this device cannot tell us where it points
    const timer = window.setTimeout(() => {
      setState((s) => (s.magneticDeg == null && s.support !== 'listening' ? { ...s, support: 'unsupported' } : s))
    }, 4000)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('deviceorientationabsolute', onOrient as EventListener)
      window.removeEventListener('deviceorientation', onOrient as EventListener)
      window.removeEventListener('devicemotion', onMotion)
      started.current = false
    }
  }, [])

  /** iOS asks for orientation access from a user gesture; everywhere else we just listen. */
  const enable = useCallback(async () => {
    const Ctor = (window as unknown as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent
    if (Ctor?.requestPermission) {
      try {
        const r = await Ctor.requestPermission()
        if (r !== 'granted') { setState((s) => ({ ...s, support: 'needs-permission' })); return }
      } catch { setState((s) => ({ ...s, support: 'needs-permission' })); return }
    }
    listen()
  }, [listen])

  // the developer's hook, independent of the sensors: `window.dispatchEvent(new CustomEvent('vastu:heading', { detail: 123 }))`
  useEffect(() => {
    if (!active) return
    const onFake = (ev: Event) => {
      const deg = Number((ev as CustomEvent).detail)
      if (!Number.isFinite(deg)) return
      smoothed.current = normalizeDeg(deg)
      setState((s) => ({ ...s, magneticDeg: smoothed.current, support: 'listening' }))
    }
    window.addEventListener('vastu:heading', onFake)
    return () => window.removeEventListener('vastu:heading', onFake)
  }, [active])

  useEffect(() => {
    if (!active) return
    const Ctor = (window as unknown as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent
    if (!Ctor) { setState((s) => ({ ...s, support: 'unsupported' })); return }
    if (Ctor.requestPermission) { setState((s) => ({ ...s, support: 'needs-permission' })); return }
    const stop = listen()
    return () => { stop?.() }
  }, [active, listen])

  // position → declination, once per mount; low accuracy is plenty
  useEffect(() => {
    if (!active || state.location !== 'idle') return
    if (!('geolocation' in navigator)) { setState((s) => ({ ...s, location: 'unavailable' })); return }
    setState((s) => ({ ...s, location: 'asking' }))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void fetchDeclination(pos.coords.latitude, pos.coords.longitude).then((d) => {
          setState((s) => ({ ...s, location: 'ok', declination: d }))
        })
      },
      (err) => setState((s) => ({ ...s, location: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' })),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    )
  }, [active, state.location])

  return { ...state, enable }
}
