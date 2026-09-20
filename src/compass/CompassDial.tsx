import { useEffect, useRef, useState } from 'react'
import { angleDifference, compassPointLabel, normalizeDeg, zone8IndexFor } from './math'
import { ZONES8 } from './data'
import { haptic } from '../native'

/* The instrument dial from the Jyotisha app, redrawn in SVG: everything on it is a real
 * marking or live information. A rotating rose (5° ticks, numerals every 30°, eight
 * direction letters) under a fixed needle and lubber line; a glow arc on the 45° zone
 * being faced; a fixed, always-upright readout in the centre. The rose settles on a
 * near-critically-damped spring over an UNBOUNDED angle retargeted by shortest delta,
 * so 359°→1° is a short turn, never a spin. */

const SPRING_K = 90
const SPRING_C = 16
const ZONE_FADE_S = 0.35

export function CompassDial({ headingDeg, size = 320, paper }: { headingDeg: number; size?: number; paper: boolean }) {
  const [, force] = useState(0)
  const display = useRef(normalizeDeg(headingDeg))
  const target = useRef(normalizeDeg(headingDeg))
  const velocity = useRef(0)
  const raf = useRef<number | null>(null)
  const lastT = useRef<number | null>(null)
  const activeZone = useRef(zone8IndexFor(headingDeg))
  const prevZone = useRef(activeZone.current)
  const zoneFade = useRef(1)
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    target.current += angleDifference(normalizeDeg(headingDeg), normalizeDeg(target.current))
    if (reduced) {
      display.current = target.current
      velocity.current = 0
      syncZone()
      force((n) => n + 1)
      return
    }
    if (raf.current == null) { lastT.current = null; raf.current = requestAnimationFrame(tick) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headingDeg])

  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current) }, [])

  function syncZone() {
    const zi = zone8IndexFor(display.current)
    if (zi === activeZone.current) return
    prevZone.current = activeZone.current
    activeZone.current = zi
    zoneFade.current = 0
    haptic('light')
  }

  function tick(t: number) {
    const dt = Math.min(1 / 30, Math.max(0.0001, lastT.current == null ? 1 / 60 : (t - lastT.current) / 1000))
    lastT.current = t
    const accel = -SPRING_K * (display.current - target.current) - SPRING_C * velocity.current
    velocity.current += accel * dt
    display.current += velocity.current * dt
    if (zoneFade.current < 1) zoneFade.current = Math.min(1, zoneFade.current + dt / ZONE_FADE_S)
    syncZone()
    const settled = Math.abs(display.current - target.current) < 0.05 && Math.abs(velocity.current) < 0.5
    force((n) => n + 1)
    if (settled && zoneFade.current >= 1) {
      display.current = target.current
      velocity.current = 0
      raf.current = null
      lastT.current = null
      return
    }
    raf.current = requestAnimationFrame(tick)
  }

  const r = 160 // viewBox radius; `size` scales it
  const c = 160
  const shown = normalizeDeg(display.current)
  const zone = ZONES8[activeZone.current]
  const ink = paper ? '#26251E' : '#E9EBF1'
  const muted = paper ? '#6E6C5D' : '#99A1B3'
  const dim = paper ? 'rgba(24,22,14,0.45)' : 'rgba(255,255,255,0.35)'
  const gold = paper ? '#A9782E' : '#D9B45B'
  const goldBright = paper ? '#C48F3A' : '#E8C56B'
  const face = paper ? '#FFFDF8' : '#14161d'
  const faceEdge = paper ? 'rgba(24,22,14,0.16)' : 'rgba(255,255,255,0.13)'
  const centre = paper ? '#F3F1EA' : '#1d2029'

  const polar = (deg: number, rad: number) => ({ x: c + rad * Math.sin((deg * Math.PI) / 180), y: c - rad * Math.cos((deg * Math.PI) / 180) })
  const arcPath = (deg: number, rad: number, halfSpan: number) => {
    const a = polar(deg - halfSpan, rad), b = polar(deg + halfSpan, rad)
    return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${rad} ${rad} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
  }
  const glow = (zi: number, alpha: number) => {
    if (alpha <= 0.02) return null
    const deg = ZONES8[zi].centerDeg
    const rad = r * 0.575
    return (
      <g key={zi} opacity={alpha}>
        <path d={arcPath(deg, rad, 20)} fill="none" stroke={gold} strokeWidth={14} strokeLinecap="round" opacity={0.32} filter="url(#dial-blur)" />
        <path d={arcPath(deg, rad, 20)} fill="none" stroke={gold} strokeWidth={7} strokeLinecap="round" opacity={0.55} />
        <path d={arcPath(deg, rad, 20)} fill="none" stroke={goldBright} strokeWidth={2.5} strokeLinecap="round" opacity={0.95} />
      </g>
    )
  }

  const ticks = []
  for (let deg = 0; deg < 360; deg += 5) {
    const cardinal = deg % 90 === 0, ordinal = deg % 45 === 0, major = deg % 30 === 0
    const len = cardinal ? 14 : ordinal ? 12 : major ? 10 : 6
    const stroke = cardinal ? gold : ordinal ? `${gold}8C` : major ? muted : dim
    const width = cardinal ? 2.5 : ordinal ? 2 : major ? 1.4 : 1
    const o = polar(deg, r * 0.95), i = polar(deg, r * 0.95 - len)
    ticks.push(<line key={deg} x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke={stroke} strokeWidth={width} />)
  }
  const numerals = []
  for (let deg = 30; deg < 360; deg += 30) {
    if (deg % 90 === 0) continue
    const p = polar(deg, r * 0.82)
    numerals.push(
      <text key={deg} x={p.x} y={p.y} fontSize={8.5} fontWeight={600} fill={muted} textAnchor="middle" dominantBaseline="central"
        transform={`rotate(${deg} ${p.x} ${p.y})`}>{deg}</text>,
    )
  }
  const letters = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']] as const

  return (
    <svg className="cdial" viewBox="0 0 320 320" width={size} height={size} aria-label={`Facing ${Math.round(shown)} degrees, ${compassPointLabel(shown)}, ${zone.sanskrit}`}>
      <defs>
        <filter id="dial-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" /></filter>
        <radialGradient id="dial-vignette"><stop offset="72%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity="0.06" /></radialGradient>
      </defs>
      <circle cx={c} cy={c} r={r - 1} fill={face} />
      <g className="cdial-rose" style={{ transform: `rotate(${-display.current}deg)`, transformOrigin: '160px 160px' }}>
        {prevZone.current !== activeZone.current && zoneFade.current < 1 && glow(prevZone.current, 1 - zoneFade.current)}
        {glow(activeZone.current, zoneFade.current)}
        <circle cx={c} cy={c} r={r - 1} fill="url(#dial-vignette)" />
        <circle cx={c} cy={c} r={r - 1} fill="none" stroke={faceEdge} strokeWidth={1.5} />
        {ticks}
        {numerals}
        {letters.map(([deg, label]) => {
          const cardinal = deg % 90 === 0
          const p = polar(deg, r * 0.71)
          return (
            <text key={deg} x={p.x} y={p.y} fontSize={cardinal ? 17 : 11} fontWeight={700} fill={cardinal ? gold : ink}
              textAnchor="middle" dominantBaseline="central" transform={`rotate(${deg} ${p.x} ${p.y})`}>{label}</text>
          )
        })}
        {/* north marker just outside the N letter — find north at a glance mid-rotation */}
        <path d={`M${c} ${c - (r * 0.82 + 8)} l4.5 7.5 h-9 z`} fill={goldBright} />
      </g>
      {/* fixed chrome: lubber line and needle mark the direction faced */}
      <line x1={c} y1={31} x2={c} y2={c - r * 0.34} stroke={gold} strokeOpacity={0.3} strokeWidth={1} />
      <path d={`M${c} 14 l8 17 l-8 -4.5 l-8 4.5 z`} fill={gold} />
      <circle cx={c} cy={c} r={r * 0.34} fill={centre} stroke={faceEdge} strokeWidth={1} />
      <text x={c} y={c - 4} fontSize={27} fontWeight={700} fill={ink} textAnchor="middle" dominantBaseline="central" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {String(Math.round(shown) % 360).padStart(3, '0')}°
      </text>
      <text x={c} y={c + 18} fontSize={10} fontWeight={700} fill={gold} textAnchor="middle" dominantBaseline="central" letterSpacing={1}>
        {compassPointLabel(shown)} · {zone.sanskrit}
      </text>
    </svg>
  )
}
