import { useRef } from 'react'
import { useStore } from '../store'

export function NorthDial({ size = 64 }: { size?: number }) {
  const northDeg = useStore((s) => s.northDeg)
  const setNorth = useStore((s) => s.setNorth)
  const ref = useRef<HTMLDivElement>(null)

  const fromEvent = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    setNorth(Math.round(deg * 2) / 2)
  }

  return (
    <div
      ref={ref}
      className="north-dial"
      style={{ width: size, height: size }}
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
        <g transform={`rotate(${northDeg} 32 32)`}>
          <path d="M32 8 l5.5 13 h-11 Z" fill="#F26B57" />
          <path d="M32 56 l5.5 -13 h-11 Z" fill="rgba(255,255,255,0.28)" />
        </g>
        <circle cx="32" cy="32" r="3" fill="#D9B45B" />
      </svg>
    </div>
  )
}
