import { useRef } from 'react'
import { haptic } from '../native'

/** How close to the default a drag must come to snap onto it, in the input's own units (it runs
 *  -1000…1000, so this is about 6 px on the desktop panel's track). */
const SNAP = 45

/**
 * A dial for a size that has a natural default: the default sits exactly in the middle, with the
 * range the same ratio either way (ratio 2 runs ½×…2×), a tick marks it, a drag snaps onto it and
 * a double-click or Reset returns to it. Keyboard steps stay plain, so the snap can't trap them.
 */
export function CentredDial(props: {
  label: string; value: number; onChange: (v: number) => void
  /** the top of the range as a multiple of the default; the bottom is its inverse */
  ratio: number; def?: number
  fmt?: (v: number) => string; className?: string
}) {
  const { label, value, onChange, ratio, def = 100, fmt, className = '' } = props
  const min = Math.ceil(def / ratio), max = Math.floor(def * ratio)
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const pos = Math.round((Math.log(clamp(value) / def) / Math.log(ratio)) * 1000)
  const dragging = useRef(false)
  const wasAtDefault = useRef(value === def)
  const text = fmt ? fmt(value) : `${Math.round(value)}%`
  const moved = value !== def
  // the fill runs from the centre tick to the thumb
  const at = 50 + pos / 20
  const fill = { '--a': `${Math.min(50, at)}%`, '--b': `${Math.max(50, at)}%` } as React.CSSProperties

  const onSlide = (raw: number) => {
    const snapped = dragging.current && Math.abs(raw) <= SNAP ? 0 : raw
    const next = clamp(Math.round(def * Math.pow(ratio, snapped / 1000)))
    // one soft tick on the phone as it lands on the default
    if (next === def && !wasAtDefault.current) haptic('light')
    wasAtDefault.current = next === def
    onChange(next)
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (!d) return
    e.preventDefault()
    onChange(clamp(value + d * (e.shiftKey ? 10 : 1)))
  }

  return (
    <div className={`slider dial ${className}`}>
      <span className="slider-head">
        <span>{label}</span>
        <span className="dial-read">
          {moved && <button type="button" className="dial-reset" onClick={() => onChange(def)}>Reset</button>}
          <b>{text}</b>
        </span>
      </span>
      <span className="dial-track">
        <input type="range" min={-1000} max={1000} step={1} value={pos} style={fill}
          aria-label={label} aria-valuetext={text}
          onChange={(e) => onSlide(Number(e.target.value))}
          onPointerDown={() => { dragging.current = true }}
          onPointerUp={() => { dragging.current = false }}
          onPointerCancel={() => { dragging.current = false }}
          onKeyDown={onKeyDown}
          onDoubleClick={() => onChange(def)} />
        <i className="dial-tick" aria-hidden="true" />
      </span>
    </div>
  )
}
