import { useRef } from 'react'
import { useStore } from '../store'
import './northdial.css'

const CARDINALS = [
  { key: 'N', deg: 0 },
  { key: 'E', deg: 90 },
  { key: 'S', deg: 180 },
  { key: 'W', deg: 270 },
]

/** Snap to the nearest 45° detent when close enough — skipped for fine control (shift-drag). */
function snapToDetent(deg: number, fine: boolean): number {
  if (fine) return deg
  const snapped = Math.round(deg / 45) * 45
  let diff = (deg - snapped) % 360
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return Math.abs(diff) < 3 ? snapped : deg
}

export function NorthDial({ size = 64 }: { size?: number }) {
  const northDeg = useStore((s) => s.northDeg)
  const setNorth = useStore((s) => s.setNorth)
  const ref = useRef<HTMLDivElement>(null)

  const fromEvent = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    const rounded = Math.round(deg * 2) / 2
    setNorth(snapToDetent(rounded, e.shiftKey))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 5 : 0.5
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setNorth(useStore.getState().northDeg - step); e.preventDefault() }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setNorth(useStore.getState().northDeg + step); e.preventDefault() }
    else if (e.key === 'Home') { setNorth(0); e.preventDefault() }
  }

  // a stable, always-positive readout — the store itself can carry any signed/overflowed degree
  const readout = ((northDeg % 360) + 360) % 360

  return (
    <div
      ref={ref}
      className="north-dial"
      style={{ width: size, height: size }}
      role="slider"
      aria-label="Plan north, degrees clockwise"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(readout)}
      aria-valuetext={`${readout.toFixed(1)}°`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch { /* synthetic pointer */ }
        fromEvent(e)
      }}
      onPointerMove={(e) => { if (e.buttons & 1) fromEvent(e) }}
    >
      <svg viewBox="0 0 64 64">
        {/* the fixed bezel: a tick every 15°, longer every 45° */}
        <circle cx="32" cy="32" r="30.5" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i * 15 * Math.PI) / 180
          const long = i % 3 === 0
          return <line key={i} x1={32 + Math.sin(a) * (long ? 25.5 : 27.5)} y1={32 - Math.cos(a) * (long ? 25.5 : 27.5)}
            x2={32 + Math.sin(a) * 29.5} y2={32 - Math.cos(a) * 29.5}
            stroke="currentColor" strokeOpacity={long ? 0.55 : 0.28} strokeWidth="1" />
        })}
        {/* the card turns, as on a real compass: the pointer always reads as north */}
        <g transform={`rotate(${northDeg} 32 32)`}>
          {CARDINALS.slice(1).map(({ key, deg }) => {
            const a = (deg * Math.PI) / 180
            return (
              <text key={key} x={32 + Math.sin(a) * 18.5} y={32 - Math.cos(a) * 18.5} fontSize="7" fontWeight={650} textAnchor="middle"
                dominantBaseline="central" fill="currentColor" fillOpacity="0.62">
                {key}
              </text>
            )
          })}
          <path d="M32 7.5 l5.5 15.5 h-11 Z" fill="#E0543F" />
          <text x="32" y="18.2" fontSize="6.5" fontWeight={800} textAnchor="middle"
            dominantBaseline="central" fill="#FFFFFF">N</text>
        </g>
        <circle cx="32" cy="32" r="2.6" fill="currentColor" />
      </svg>
    </div>
  )
}
