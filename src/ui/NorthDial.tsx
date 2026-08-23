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
        <circle cx="32" cy="32" r="29" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * 45 * Math.PI) / 180
          return <line key={i} x1={32 + Math.sin(a) * 24} y1={32 - Math.cos(a) * 24}
            x2={32 + Math.sin(a) * 28} y2={32 - Math.cos(a) * 28}
            stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
        })}
        {CARDINALS.map(({ key, deg }) => {
          const a = (deg * Math.PI) / 180
          const x = 32 + Math.sin(a) * 20.5, y = 32 - Math.cos(a) * 20.5
          return (
            <text key={key} x={x} y={y} fontSize="6.5" fontWeight={700} textAnchor="middle"
              dominantBaseline="central" fill={deg === 0 ? '#F26B57' : 'rgba(255,255,255,0.55)'}>
              {key}
            </text>
          )
        })}
        <g transform={`rotate(${northDeg} 32 32)`}>
          <path d="M32 8 l5.5 13 h-11 Z" fill="#F26B57" />
          <text x="32" y="19.5" fontSize="6" fontWeight={800} textAnchor="middle"
            dominantBaseline="central" fill="#FFFDF4">N</text>
          <path d="M32 56 l5.5 -13 h-11 Z" fill="rgba(255,255,255,0.28)" />
        </g>
        <circle cx="32" cy="32" r="9" fill="#14151A" stroke="#D9B45B" strokeWidth="1" />
        <text className="north-dial-readout" x="32" y="32.5" fontSize="7.5" fontWeight={700}
          textAnchor="middle" dominantBaseline="central" fill="#F3E5C0">
          {Math.round(readout)}°
        </text>
      </svg>
    </div>
  )
}
