import { cloneElement, Fragment, useMemo } from 'react'
import type { BgState, CompassState, Marker, Pt, RoomShape, Stroke, TextNote, Unit } from '../types'
import type { DxfImport } from '../importers/dxf'
import { edgeLength, edgePoint, outlinePathD, polar, polygonArea, sampledPolygon } from '../geometry'
import { brahmasthanRadius, placementOf } from '../analysis'
import { formatArea, formatLen } from '../format'
import { DIRS8, GATES32, GATE_QUALITY, GATE_START_DEG, MANDALA_INNER, ZONES16, mandalaCellName, markerKindMeta } from '../vastu'

export const FONT = "'Inter Variable', Inter, system-ui, sans-serif"
export const GOLD = '#D9B45B'
const INKHALO = 'rgba(9,10,14,0.78)'
/** Muted gold-brown — the design system's secondary-line ink (design language spec). */
const MUTED = '#8C7642'
/** Classical gate-quality verdict colours, reused from the app's own palette (ZONES16 E / SE). */
const GATE_GOOD = '#63B56F'
const GATE_CAUTION = '#E0684F'

/** Perceived luminance of a hex color (0 = black, 1 = white) — used to balance fill alpha
 *  across hues so light colours don't glow and dark ones don't sink at one flat opacity. */
function relLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export interface SceneProps {
  bg: BgState
  dxf: DxfImport | null
  pts: Pt[]
  bulges: number[]
  closed: boolean
  center: Pt | null
  centerOverridden?: boolean
  highlightZone?: number | null
  R: number
  northDeg: number
  compass: CompassState
  metersPerPx: number | null
  unit: Unit
  k: number
  /** current view rotation (deg) — used only to keep text upright on screen */
  viewRotDeg?: number
  showEdgeLabels: boolean
  markers?: Marker[]
  strokes?: Stroke[]
  roomShapes?: RoomShape[]
  selectedRoomShape?: string | null
  texts?: TextNote[]
  selectedText?: string | null
  /** light paper ground (PNG export) — swaps the few inks that assume the dark canvas */
  paper?: boolean
  idPrefix: string
}

export function strokePathD(pts: Pt[], kind: 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' = 'line'): string {
  if (pts.length === 0) return ''
  if (kind === 'rect' && pts.length >= 2) {
    const [a, b] = pts
    return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}L${b.x.toFixed(2)} ${a.y.toFixed(2)}L${b.x.toFixed(2)} ${b.y.toFixed(2)}L${a.x.toFixed(2)} ${b.y.toFixed(2)}Z`
  }
  if (kind === 'ellipse' && pts.length >= 2) {
    const [a, b] = pts
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
    const rx = Math.max(Math.abs(b.x - a.x) / 2, 0.01), ry = Math.max(Math.abs(b.y - a.y) / 2, 0.01)
    return `M${(cx - rx).toFixed(2)} ${cy.toFixed(2)}a${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(rx * 2).toFixed(2)} 0a${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(-rx * 2).toFixed(2)} 0Z`
  }
  let d = `M${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
  if (kind === 'pen' && pts.length > 2) {
    // quadratics through segment midpoints — the samples steer, the curve stays fluid
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      d += `Q${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`
    }
    d += `L${pts[pts.length - 1].x.toFixed(2)} ${pts[pts.length - 1].y.toFixed(2)}`
  } else {
    for (let i = 1; i < pts.length; i++) d += `L${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`
  }
  return d
}

/** Filled head for an arrow stroke — sized off the stroke width so it zooms with the plan. */
export function arrowHeadD(pts: Pt[], width: number): string {
  if (pts.length < 2) return ''
  const a = pts[pts.length - 2], b = pts[pts.length - 1]
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return ''
  const ux = dx / len, uy = dy / len
  const hl = Math.max(width * 4.2, 6)
  const hw = Math.max(width * 1.9, 2.6)
  const bx = b.x - ux * hl, by = b.y - uy * hl
  return `M${b.x.toFixed(2)} ${b.y.toFixed(2)}L${(bx - uy * hw).toFixed(2)} ${(by + ux * hw).toFixed(2)}L${(bx + uy * hw).toFixed(2)} ${(by - ux * hw).toFixed(2)}Z`
}

/** User ink — annotations drawn on the plan, independent of the outline. */
export function StrokesLayer({ strokes }: { strokes: Stroke[] }) {
  if (strokes.length === 0) return null
  return (
    <g>
      {strokes.map((s) => (
        <g key={s.id}>
          <path d={strokePathD(s.pts, s.kind)} fill="none" stroke={s.color}
            strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" opacity={0.92} />
          {s.kind === 'arrow' && (
            <path d={arrowHeadD(s.pts, s.width)} fill={s.color} opacity={0.92} />
          )}
        </g>
      ))}
    </g>
  )
}

/** Text notes pinned to the plan — world-sized, so they zoom with the drawing. */
function TextsLayer({ texts, selected, k, vr }: { texts: TextNote[]; selected?: string | null; k: number; vr: number }) {
  if (texts.length === 0) return null
  return (
    <g>
      {texts.map((t) => {
        const lines = (t.text || '…').split('\n')
        const on = t.id === selected
        const longest = Math.max(...lines.map((l) => l.length), 1)
        const boxW = longest * t.size * 0.6
        const boxH = lines.length * t.size * 1.25
        return (
          <g key={t.id} transform={`rotate(${-vr} ${t.p.x} ${t.p.y})`}>
            {on && (
              <rect x={t.p.x - t.size * 0.3} y={t.p.y - t.size * 0.95} width={boxW + t.size * 0.6} height={boxH + t.size * 0.55}
                fill="none" stroke={GOLD} strokeWidth={1.4 / k} strokeDasharray={`${6 / k} ${4 / k}`} rx={3 / k} opacity={0.95} />
            )}
            <text x={t.p.x} y={t.p.y} fontSize={t.size} fontFamily={FONT} fontWeight={650}
              fill={t.color} {...haloProps(t.size * 0.22)}>
              {lines.map((l, i) => (
                <tspan key={i} x={t.p.x} dy={i === 0 ? 0 : t.size * 1.25}>{l}</tspan>
              ))}
            </text>
          </g>
        )
      })}
    </g>
  )
}

const haloProps = (w: number) => ({
  stroke: INKHALO,
  strokeWidth: w,
  paintOrder: 'stroke' as const,
  strokeLinejoin: 'round' as const,
})

export function RingLabel(props: {
  c: Pt; deg: number; r: number; size: number; text: string
  fill?: string; weight?: number; opacity?: number; halo?: number; spacing?: number; vr?: number
  /** Compass-rose convention: keep the glyph screen-upright instead of tangent to the ring.
   *  Use for single-letter cardinals (N/E/S/W); leave multi-letter runs tangential. */
  upright?: boolean
}) {
  const { c, deg, r, size, text, fill = '#EDEFF4', weight = 600, opacity = 1, halo = 0, spacing, vr = 0, upright = false } = props
  const norm = (((deg + vr) % 360) + 360) % 360
  const flip = norm > 90 && norm < 270
  const p = polar(c, deg, r)
  const rot = upright ? -vr : (flip ? deg + 180 : deg)
  return (
    <text
      x={p.x} y={p.y}
      textAnchor="middle" dominantBaseline="central"
      fontSize={size} fontWeight={weight} fontFamily={FONT}
      fill={fill} opacity={opacity}
      letterSpacing={spacing}
      transform={`rotate(${rot} ${p.x} ${p.y})`}
      {...(halo > 0 ? haloProps(halo) : {})}
    >
      {text}
    </text>
  )
}

function wedgePath(c: Pt, R: number, a0: number, a1: number): string {
  const p0 = polar(c, a0, R)
  const p1 = polar(c, a1, R)
  return `M${c.x} ${c.y} L${p0.x} ${p0.y} A${R} ${R} 0 0 1 ${p1.x} ${p1.y} Z`
}

function ringSectorPath(c: Pt, r0: number, r1: number, a0: number, a1: number): string {
  const q0 = polar(c, a0, r1), q1 = polar(c, a1, r1)
  const p1 = polar(c, a1, r0), p0 = polar(c, a0, r0)
  return `M${q0.x} ${q0.y} A${r1} ${r1} 0 0 1 ${q1.x} ${q1.y} L${p1.x} ${p1.y} A${r0} ${r0} 0 0 0 ${p0.x} ${p0.y} Z`
}

/** A ring stroke cased in a dark halo, so gold structure survives satellite imagery and white plans,
 *  not just the dark default ground. Same two-pass technique the tick/label halos already use. */
function CasedCircle(props: {
  cx: number; cy: number; r: number; k: number; stroke?: string; width: number
  opacity?: number; dash?: string
}) {
  const { cx, cy, r, k, stroke = GOLD, width, opacity = 0.9, dash } = props
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={INKHALO}
        strokeWidth={width + 1.8 / k} opacity={Math.min(0.55, opacity)} strokeDasharray={dash} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke}
        strokeWidth={width} opacity={opacity} strokeDasharray={dash} />
    </>
  )
}

/** Same casing technique as CasedCircle, for straight axis/spoke lines. */
function CasedLine(props: {
  x1: number; y1: number; x2: number; y2: number; k: number; stroke?: string; width: number
  opacity?: number; dash?: string
}) {
  const { x1, y1, x2, y2, k, stroke = GOLD, width, opacity = 0.7, dash } = props
  return (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INKHALO}
        strokeWidth={width + 1.8 / k} opacity={Math.min(0.55, opacity + 0.05)} strokeDasharray={dash} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke}
        strokeWidth={width} opacity={opacity} strokeDasharray={dash} />
    </>
  )
}

/** A small cased flag at the ring's north bearing — orientation is readable without opening the degree popover. */
function NorthNeedle({ c, R, north, k }: { c: Pt; R: number; north: number; k: number }) {
  const tip = polar(c, north, R + 11 / k)
  const bL = polar(c, north + 6, R - 1 / k)
  const bR = polar(c, north - 6, R - 1 / k)
  const d = `M${tip.x} ${tip.y} L${bL.x} ${bL.y} L${bR.x} ${bR.y} Z`
  return (
    <>
      <path d={d} fill="#F26B57" stroke={INKHALO} strokeWidth={2.6 / k} strokeLinejoin="round" opacity={0.98} />
      <path d={d} fill="#F26B57" stroke="#FFFDF4" strokeWidth={0.9 / k} strokeLinejoin="round" />
    </>
  )
}


/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

function Background({ bg, dxf, k, paper }: { bg: BgState; dxf: DxfImport | null; k: number; paper?: boolean }) {
  if (bg.kind === 'none') return null
  const filters: string[] = []
  if (bg.grayscale) filters.push('grayscale(1)')
  if (bg.invert) filters.push('invert(0.92) hue-rotate(180deg)')
  const filter = filters.length ? filters.join(' ') : undefined

  if (bg.kind === 'raster' && bg.dataUrl) {
    return (
      <g opacity={bg.opacity}>
        <image href={bg.dataUrl} x={0} y={0} width={bg.w} height={bg.h}
          preserveAspectRatio="none" style={filter ? { filter } : undefined} />
      </g>
    )
  }
  if (bg.kind === 'dxf' && dxf) {
    return (
      <g opacity={bg.opacity} style={filter ? { filter } : undefined}>
        {dxf.paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={paper ? '#4A5160' : '#A9B4C9'} strokeWidth={1.3 / k}
            strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {dxf.texts.map((t, i) => (
          <text key={`t${i}`} x={t.x} y={t.y} fontSize={t.size} fill={paper ? '#5A6478' : '#7E8AA0'} fontFamily={FONT}
            transform={t.rotDeg ? `rotate(${t.rotDeg} ${t.x} ${t.y})` : undefined}>
            {t.str}
          </text>
        ))}
      </g>
    )
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Outline + measurements                                              */
/* ------------------------------------------------------------------ */

function Outline(props: {
  pts: Pt[]; bulges: number[]; closed: boolean; k: number; metersPerPx: number | null; unit: Unit
  showEdgeLabels: boolean; center: Pt | null; vr?: number
}) {
  const { pts, bulges, closed, k, metersPerPx, unit, showEdgeLabels, center, vr = 0 } = props
  if (pts.length === 0) return null
  const d = outlinePathD(pts, bulges, closed)
  const n = pts.length
  const edges: [Pt, Pt, number][] = []
  for (let i = 0; i < (closed ? n : n - 1); i++) edges.push([pts[i], pts[(i + 1) % n], bulges[i] ?? 0])

  // real wall thickness once scale is known (23cm / ~9in, the standard interior-wall
  // convention) — a solid architectural band, not a thin decorative line; before scaling,
  // a sensible screen-constant stands in so the outline still reads as a wall
  const wallW = metersPerPx ? 0.23 / metersPerPx : 15 / k

  return (
    <g>
      {closed && <path d={d} fill={GOLD} fillOpacity={0.03} stroke="none" />}
      {/* a real architectural wall: a neutral solid band framed by two crisp dark face
          lines — the convention every floor-plan drawing (and every reference chart the
          owner sent) actually uses. Gold is the VASTU overlay's colour, not the building's —
          keeping the wall itself neutral is what makes it read as a real structure. */}
      <path d={d} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={wallW + 3 / k} opacity={0.45}
        strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#17181C" strokeWidth={wallW}
        strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#C9C6BC" strokeWidth={Math.max(1.2 / k, wallW - 2.6 / k)}
        strokeLinejoin="round" strokeLinecap="round" />
      {showEdgeLabels && metersPerPx && edges.map(([a, b, bu], i) => {
        const L = edgeLength(a, b, bu)
        if (L * k < 46) return null
        const chordL = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const mid = edgePoint(a, b, bu, 0.5) // tangent at the arc midpoint is parallel to the chord
        let rot = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
        const screenRot = ((rot + vr) % 360 + 360) % 360
        if (screenRot > 90 && screenRot < 270) rot += 180
        let nx = (b.y - a.y) / chordL, ny = -(b.x - a.x) / chordL
        if (center) {
          const toC = { x: center.x - mid.x, y: center.y - mid.y }
          if (nx * toC.x + ny * toC.y > 0) { nx = -nx; ny = -ny }
        }
        const off = wallW / 2 + 9 / k
        const p = { x: mid.x + nx * off, y: mid.y + ny * off }
        return (
          <text key={i} x={p.x} y={p.y} fontSize={11.5 / k} fontWeight={600} fontFamily={FONT}
            fill="#F3E9CF" textAnchor="middle" dominantBaseline="central"
            transform={`rotate(${rot} ${p.x} ${p.y})`} {...haloProps(3 / k)}>
            {formatLen(L * metersPerPx, unit)}
          </text>
        )
      })}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Compasses                                                           */
/* ------------------------------------------------------------------ */

interface ChakraProps {
  c: Pt; R: number; north: number; compass: CompassState; k: number; vr: number
  pts: Pt[]; closed: boolean; idPrefix: string
  /** unscaled, drawing-derived radius — independent of the compass Size slider (scalePct) */
  baseR: number
  /** light paper ground (PNG export) — the white banding ink flips dark */
  paper?: boolean
}

function DegreeTicks({ c, R, north, numbers, k, vr = 0 }: { c: Pt; R: number; north: number; numbers: boolean; k: number; vr?: number }) {
  const px = R * k
  // the lattice follows Vastu's own sector geometry (45/22.5/11.25°) instead of a generic
  // 5/10/30 protractor, and coarsens at low zoom so minor ticks never alias into sub-pixel fuzz
  const step = px > 900 ? 2.8125 : px > 420 ? 11.25 : px > 200 ? 22.5 : 45
  const ticks = []
  for (let d = 0; d < 360; d += step) {
    const onCard = Math.abs(d % 45) < 0.01
    const onZone = !onCard && Math.abs(d % 22.5) < 0.01
    const onPada = !onCard && !onZone && Math.abs(d % 11.25) < 0.01
    const len = onCard ? R * 0.05 : onZone ? R * 0.04 : onPada ? R * 0.03 : R * 0.017
    const w = onCard ? 1.6 : onZone ? 1.3 : onPada ? 0.95 : 0.6
    const ink = onCard || onZone ? GOLD : onPada ? '#E8DDBE' : MUTED
    const op = onCard ? 0.95 : onZone ? 0.85 : onPada ? 0.6 : 0.42
    const a = north + d
    // small standoff so ticks sit just outside the ring stroke, never over a colored fill inside it
    const p0 = polar(c, a, R * 1.008)
    const p1 = polar(c, a, R * 1.008 + len)
    ticks.push(
      <line key={`u${d}`} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
        stroke={INKHALO} strokeWidth={(w + 1.6) / k} opacity={0.5} />,
      <line key={d} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
        stroke={ink} strokeWidth={w / k} opacity={op} />,
    )
  }
  return (
    <g>
      {ticks}
      {numbers && [45, 90, 135, 180, 225, 270, 315].map((d) => (
        <RingLabel key={d} c={c} deg={north + d} r={R * 0.905} size={R * 0.032}
          text={`${d}°`} fill="#CBD2DF" weight={500} opacity={0.9} halo={R * 0.008} vr={vr} />
      ))}
    </g>
  )
}

function Zones16({ c, R, north, compass, k, vr, pts, closed, idPrefix, baseR }: ChakraProps) {
  const clip = compass.clip && closed && pts.length >= 3
  const clipId = `${idPrefix}-plotclip`
  // clipped fills must reach the plot regardless of the Size slider — use the unscaled
  // radius, not the scaled ring radius, or shrinking the wheel leaves plot corners un-tinted
  const fillR = clip ? baseR * 1.7 : R
  const fills = compass.fillPct > 0 && (
    <g clipPath={clip ? `url(#${clipId})` : undefined}>
      {ZONES16.map((z, i) => {
        const a0 = north - 11.25 + i * 22.5
        const lum = relLuminance(z.color)
        // a flat alpha reads as one muddy band — nudge it so light hues stop glowing and
        // dark ones stop sinking, without touching the hues (ZONES16 itself is read-only here)
        const balance = 1.26 - lum * 0.5
        const op = Math.min(0.85, Math.max(0.05, (compass.fillPct / 100) * balance))
        return (
          <path key={z.key} d={wedgePath(c, fillR, a0, a0 + 22.5)}
            fill={z.color} fillOpacity={op} stroke="none" />
        )
      })}
    </g>
  )
  return (
    <g>
      {fills}
      {/* zone dividers: a quiet reference grid, not a crosshatch over the actual floor plan —
         16 full-length lines at the old opacity fought the walls/rooms for attention */}
      {ZONES16.map((_, i) => {
        const a = north - 11.25 + i * 22.5
        const p = polar(c, a, R)
        return (
          <Fragment key={i}>
            <line x1={c.x} y1={c.y} x2={p.x} y2={p.y}
              stroke={INKHALO} strokeWidth={1.8 / k} opacity={0.28} />
            <line x1={c.x} y1={c.y} x2={p.x} y2={p.y}
              stroke="#EFE3C0" strokeWidth={0.85 / k} opacity={0.38} />
          </Fragment>
        )
      })}
      <CasedCircle cx={c.x} cy={c.y} r={R} k={k} width={1.6 / k} opacity={0.9} />
      <circle cx={c.x} cy={c.y} r={R * 1.001} fill="none" stroke="#FFF6DF" strokeWidth={0.5 / k} opacity={0.4} />
      {compass.degreeRing && <DegreeTicks c={c} R={R} north={north} numbers={R * k > 260} k={k} vr={vr} />}
      <NorthNeedle c={c} R={R} north={north} k={k} />
      {compass.labels && ZONES16.map((z, i) => {
        const mid = north + i * 22.5
        const cardinal = i % 4 === 0
        const diagonal = i % 4 === 2
        // zoom-aware disclosure: cardinals always (readable floor), the rest earn their place
        const tierPx = R * 0.042 * k
        if (!cardinal && !diagonal && tierPx < 7) return null
        if (!cardinal && diagonal && tierPx < 4.8) return null
        const size = cardinal
          ? Math.min(Math.max(R * 0.062, 9.5 / k), R * 0.11)
          : R * 0.042
        return (
          <RingLabel key={z.key} c={c} deg={mid} r={R * 1.065}
            size={size}
            text={z.key} weight={cardinal ? 800 : 600}
            fill={i === 0 ? '#F26B57' : cardinal ? '#F5EBD3' : '#D8DCE6'}
            halo={size * 0.28} spacing={R * 0.004} vr={vr} upright={cardinal} />
        )
      })}
    </g>
  )
}

function Gates32({ c, R, north, compass, k, vr, paper }: ChakraProps) {
  const r0 = R * 0.8
  return (
    <g>
      {GATES32.map((g, i) => {
        const a0 = north + GATE_START_DEG + i * 11.25
        // the app's best domain data, one lookup away — auspicious/challenging gates now visible
        const q = GATE_QUALITY[g.code]
        const qColor = q?.v === 'good' ? GATE_GOOD : q?.v === 'caution' ? GATE_CAUTION : null
        return (
          <Fragment key={g.code}>
            {i % 2 === 0 && (
              <path d={ringSectorPath(c, r0, R, a0, a0 + 11.25)} fill={paper ? '#14151A' : '#FFFFFF'} fillOpacity={0.045} />
            )}
            {qColor && (
              <path d={ringSectorPath(c, r0, R, a0, a0 + 11.25)} fill={qColor} fillOpacity={0.15} />
            )}
            {qColor && (
              <path d={ringSectorPath(c, R * 0.978, R, a0, a0 + 11.25)} fill={qColor} fillOpacity={0.88} />
            )}
            <line x1={polar(c, a0, r0).x} y1={polar(c, a0, r0).y}
              x2={polar(c, a0, R).x} y2={polar(c, a0, R).y}
              stroke="#E8DDBE" strokeWidth={0.8 / k} opacity={0.55} />
          </Fragment>
        )
      })}
      {[45, 135, 225, 315].map((d) => {
        const p = polar(c, north + d, R)
        return <CasedLine key={d} x1={c.x} y1={c.y} x2={p.x} y2={p.y} k={k} width={1.2 / k} opacity={0.65} />
      })}
      {[0, 90, 180, 270].map((d) => {
        const p = polar(c, north + d, R)
        return <CasedLine key={d} x1={c.x} y1={c.y} x2={p.x} y2={p.y} k={k}
          stroke="#F2E6C4" width={1.1 / k} opacity={0.5} dash={`${8 / k} ${6 / k}`} />
      })}
      <CasedCircle cx={c.x} cy={c.y} r={R} k={k} width={1.7 / k} opacity={0.92} />
      <CasedCircle cx={c.x} cy={c.y} r={r0} k={k} width={1 / k} opacity={0.55} />
      {compass.degreeRing && <DegreeTicks c={c} R={R} north={north} numbers={false} k={k} vr={vr} />}
      <NorthNeedle c={c} R={R} north={north} k={k} />
      {compass.labels && R * 0.033 * k >= 6.2 && GATES32.map((g, i) => {
        const mid = north + GATE_START_DEG + (i + 0.5) * 11.25
        // stagger radii even/odd and trim the width budget so neighbouring long names
        // (Papayakshma, Bhringaraja…) stop nearly touching across the pada boundary
        const stagger = i % 2 === 0 ? 0.955 : 0.9
        const nameSize = Math.min(R * 0.033, (R * 0.16) / (g.devta.length * 0.58))
        return (
          <Fragment key={g.code}>
            <RingLabel c={c} deg={mid} r={R * stagger} size={nameSize} text={g.devta}
              fill="#EFE7D2" weight={600} halo={R * 0.01} vr={vr} />
            <RingLabel c={c} deg={mid} r={R * 0.845} size={R * 0.027} text={g.code}
              fill="#B8A26B" weight={700} spacing={R * 0.002} halo={R * 0.008} vr={vr} />
          </Fragment>
        )
      })}
      {compass.labels && GATES32.length > 0 && R * 0.033 * k < 6.2 && GATES32.map((g, i) => {
        // too small for names — codes only, on the mid ring, when they can still be read
        if (R * 0.03 * k < 5) return null
        const mid = north + GATE_START_DEG + (i + 0.5) * 11.25
        return (
          <RingLabel key={g.code} c={c} deg={mid} r={R * 0.9} size={R * 0.03} text={g.code}
            fill="#D9CCA6" weight={700} halo={R * 0.008} vr={vr} />
        )
      })}
      {compass.labels && ['N', 'E', 'S', 'W'].map((t, i) => (
        <RingLabel key={t} c={c} deg={north + i * 90} r={R * 1.07}
          size={Math.min(Math.max(R * 0.055, 10 / k), R * 0.1)}
          text={t} weight={800} fill={i === 0 ? '#F26B57' : '#F5EBD3'} halo={R * 0.014} vr={vr} upright />
      ))}
    </g>
  )
}

function Chakra8({ c, R, north, compass, k, vr, paper }: ChakraProps) {
  return (
    <g>
      {DIRS8.map((_, i) => {
        const a0 = north - 22.5 + i * 45
        return i % 2 === 1 ? (
          <path key={i} d={wedgePath(c, R, a0, a0 + 45)} fill={paper ? '#14151A' : '#FFFFFF'} fillOpacity={0.035} />
        ) : null
      })}
      {DIRS8.map((_, i) => {
        const a = north - 22.5 + i * 45
        const p = polar(c, a, R)
        return <CasedLine key={i} x1={c.x} y1={c.y} x2={p.x} y2={p.y} k={k}
          stroke="#EFE3C0" width={0.9 / k} opacity={0.5} />
      })}
      {DIRS8.map((_, i) => {
        const p = polar(c, north + i * 45, R * 0.985)
        return <CasedLine key={`ax${i}`} x1={c.x} y1={c.y} x2={p.x} y2={p.y} k={k}
          width={i % 2 === 0 ? 1.3 / k : 0.9 / k} opacity={i % 2 === 0 ? 0.75 : 0.55} />
      })}
      <CasedCircle cx={c.x} cy={c.y} r={R} k={k} width={1.6 / k} opacity={0.9} />
      <CasedCircle cx={c.x} cy={c.y} r={R * 0.62} k={k} width={0.8 / k} opacity={0.4} />
      {compass.degreeRing && <DegreeTicks c={c} R={R} north={north} numbers={R * k > 260} k={k} vr={vr} />}
      <NorthNeedle c={c} R={R} north={north} k={k} />
      {compass.labels && DIRS8.map((d8, i) => (
        <Fragment key={d8.key}>
          <RingLabel c={c} deg={north + i * 45} r={R * 1.08}
            size={Math.min(Math.max(i % 2 === 0 ? R * 0.068 : R * 0.05, 9.5 / k), R * 0.11)}
            text={d8.key} weight={800}
            fill={i === 0 ? '#F26B57' : '#F5EBD3'} halo={R * 0.013} vr={vr} upright={i % 2 === 0} />
          {R * 0.036 * k >= 6.5 && (
            <>
              <RingLabel c={c} deg={north + i * 45} r={R * 0.75} size={R * 0.036}
                text={d8.sanskrit} fill="#E4D9BC" weight={600} halo={R * 0.009} vr={vr} />
              <RingLabel c={c} deg={north + i * 45} r={R * 0.68} size={R * 0.03}
                text={d8.deity} fill="#A9B0BF" weight={500} halo={R * 0.008} vr={vr} />
            </>
          )}
        </Fragment>
      ))}
    </g>
  )
}

function Grid9({ c, north, compass, k, vr, pts, closed, paper }: ChakraProps) {
  const frame = useMemo(() => {
    if (!closed || pts.length < 3) return null
    const rad = (-north * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of pts) {
      const x = c.x + (p.x - c.x) * cos - (p.y - c.y) * sin
      const y = c.y + (p.x - c.x) * sin + (p.y - c.y) * cos
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    return { minX, minY, maxX, maxY }
  }, [pts, closed, north, c.x, c.y])

  if (!frame) return null
  const { minX, minY, maxX, maxY } = frame
  const cw = (maxX - minX) / 9, ch = (maxY - minY) / 9
  // this whole compass sits inside a `rotate(north)` group (below) so the mandala tracks the
  // plan's north, but that same rotation would otherwise carry into every label glyph and print
  // it sideways or upside-down — counter-rotating each text node by -(north+vr) cancels exactly
  // that (plus the live view rotation), so the grid still turns with north while its type stays
  // screen-upright, the same result RingLabel's own flip logic gets for the ring compasses.
  const upr = -(north + vr)

  const cells = []
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const name = mandalaCellName(row, col)
      const x = minX + col * cw, y = minY + row * ch
      const isBrahma = row >= 3 && row <= 5 && col >= 3 && col <= 5
      if (isBrahma) {
        cells.push(<rect key={`f${row}-${col}`} x={x} y={y} width={cw} height={ch}
          fill={GOLD} fillOpacity={0.07} />)
      } else if (name) {
        cells.push(<rect key={`f${row}-${col}`} x={x} y={y} width={cw} height={ch}
          fill={paper ? '#14151A' : '#FFFFFF'} fillOpacity={0.028} />)
      }
      if (name && compass.devtas) {
        const size = Math.min(Math.min(cw, ch) * 0.24, (cw * 0.9) / (name.length * 0.56))
        if (size * k < 5.5) continue
        const tx = x + cw / 2, ty = y + ch / 2
        cells.push(
          <text key={`n${row}-${col}`} x={tx} y={ty}
            fontSize={size} fontFamily={FONT} fontWeight={600} fill="#EDE4CC"
            textAnchor="middle" dominantBaseline="central" opacity={0.92}
            transform={`rotate(${upr} ${tx} ${ty})`}
            {...haloProps(size * 0.22)}>
            {name}
          </text>,
        )
      }
    }
  }

  const innerLabel = (text: string, colC: number, rowC: number, big = false) => {
    const size = big
      ? Math.min(cw, ch) * 0.5
      : Math.min(Math.min(cw, ch) * 0.26, (cw * 1.9) / (text.length * 0.56))
    const tx = minX + colC * cw, ty = minY + rowC * ch
    return (
      <text x={tx} y={ty} fontSize={size} fontFamily={FONT}
        fontWeight={big ? 700 : 600} fill={big ? GOLD : '#C9BE9D'}
        textAnchor="middle" dominantBaseline="central" opacity={big ? 0.95 : 0.8}
        transform={`rotate(${upr} ${tx} ${ty})`}
        {...haloProps(size * 0.2)}>
        {text}
      </text>
    )
  }

  const lines = []
  for (let i = 0; i <= 9; i++) {
    const strong = i % 3 === 0
    lines.push(<line key={`v${i}`} x1={minX + i * cw} y1={minY} x2={minX + i * cw} y2={maxY}
      stroke={GOLD} strokeWidth={(strong ? 1.5 : 0.7) / k} opacity={strong ? 0.8 : 0.45} />)
    lines.push(<line key={`h${i}`} x1={minX} y1={minY + i * ch} x2={maxX} y2={minY + i * ch}
      stroke={GOLD} strokeWidth={(strong ? 1.5 : 0.7) / k} opacity={strong ? 0.8 : 0.45} />)
  }

  // north needle above the frame's top edge — no counter-rotation, since its whole job
  // is to point at north, tracking the frame's own rotation exactly as Dial's needle does
  const nx = (minX + maxX) / 2
  const needleD = `M${nx} ${minY - ch * 0.95} L${nx + cw * 0.1} ${minY - ch * 0.58} L${nx - cw * 0.1} ${minY - ch * 0.58} Z`

  return (
    <g transform={`rotate(${north} ${c.x} ${c.y})`}>
      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY}
        fill="none" stroke={INKHALO} strokeWidth={3.8 / k} opacity={0.5} />
      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY}
        fill="none" stroke={GOLD} strokeWidth={2 / k} opacity={0.9} />
      {cells}
      {lines}
      {compass.devtas && (
        <g>
          {innerLabel(MANDALA_INNER.center, 4.5, 4.5, true)}
          {innerLabel(MANDALA_INNER.n, 4.5, 2)}
          {innerLabel(MANDALA_INNER.e, 7, 4.5)}
          {innerLabel(MANDALA_INNER.s, 4.5, 7)}
          {innerLabel(MANDALA_INNER.w, 2, 4.5)}
          {innerLabel(MANDALA_INNER.ne, 7, 2)}
          {innerLabel(MANDALA_INNER.se, 7, 7)}
          {innerLabel(MANDALA_INNER.sw, 2, 7)}
          {innerLabel(MANDALA_INNER.nw, 2, 2)}
        </g>
      )}
      <path d={needleD} fill="#F26B57" stroke={INKHALO} strokeWidth={2.4 / k} strokeLinejoin="round" opacity={0.98} />
      <path d={needleD} fill="#F26B57" stroke="#FFFDF4" strokeWidth={0.9 / k} strokeLinejoin="round" />
      {compass.labels && (
        <text x={nx} y={minY - ch * 0.35} fontSize={Math.min(cw, ch) * 0.42}
          fontFamily={FONT} fontWeight={800} fill="#F26B57" textAnchor="middle"
          dominantBaseline="central" transform={`rotate(${upr} ${nx} ${minY - ch * 0.35})`}
          {...haloProps(Math.min(cw, ch) * 0.09)}>
          N
        </text>
      )}
    </g>
  )
}

function Dial({ c, R, north, compass, k, vr }: ChakraProps) {
  const px = R * k
  // this wheel's whole job is fine degree resolution, so it keeps a finer floor than the
  // other compasses' LOD — but still coarsens at low zoom instead of rendering 180 ticks as fuzz
  const step = px > 1400 ? 2 : px > 700 ? 5 : px > 300 ? 10 : 30
  const ticks = []
  for (let d = 0; d < 360; d += step) {
    const major = d % 30 === 0
    const med = d % 10 === 0
    const len = major ? R * 0.055 : med ? R * 0.038 : R * 0.02
    const a = north + d
    const p0 = polar(c, a, R - len)
    const p1 = polar(c, a, R)
    ticks.push(
      <line key={`u${d}`} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
        stroke={INKHALO} strokeWidth={(major ? 3 : 1.8) / k} opacity={0.5} />,
      <line key={d} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
        stroke="#EDE2C2" strokeWidth={(major ? 1.5 : 0.7) / k} opacity={major ? 0.92 : 0.6} />,
    )
  }
  const nTip = polar(c, north, R * 0.995)
  const nL = polar(c, north + 4, R * 0.9)
  const nR = polar(c, north - 4, R * 0.9)
  return (
    <g>
      <CasedCircle cx={c.x} cy={c.y} r={R} k={k} width={1.8 / k} opacity={0.95} />
      <CasedCircle cx={c.x} cy={c.y} r={R * 0.82} k={k} width={0.7 / k} opacity={0.4} />
      {ticks}
      <path d={`M${nTip.x} ${nTip.y} L${nL.x} ${nL.y} L${nR.x} ${nR.y} Z`}
        fill="#F26B57" stroke={INKHALO} strokeWidth={1.8 / k} strokeLinejoin="round" />
      {compass.labels && R * 0.045 * k >= 6 && Array.from({ length: 12 }, (_, i) => i * 30).map((d) => (
        <RingLabel key={d} c={c} deg={north + d} r={R * 1.07} size={R * 0.045}
          text={String(d)} fill="#DFE3EC" weight={600} halo={R * 0.01} vr={vr} />
      ))}
      {compass.labels && DIRS8.map((d8, i) => (
        <RingLabel key={d8.key} c={c} deg={north + i * 45} r={R * 0.73}
          size={Math.min(Math.max(i % 2 === 0 ? R * 0.085 : R * 0.05, 9 / k), R * 0.12)} text={d8.key} weight={800}
          fill={i === 0 ? '#F26B57' : '#EFE4C8'} halo={R * 0.014} vr={vr} upright={i % 2 === 0} />
      ))}
    </g>
  )
}

function CustomOverlay({ c, R, north, compass }: ChakraProps) {
  if (!compass.customUrl) return null
  const aspect = compass.customAspect ?? 1
  let w = 2 * R, h = 2 * R * aspect
  if (h > 2 * R) { h = 2 * R; w = h / aspect }
  return (
    <g transform={`rotate(${north + compass.customRotDeg} ${c.x} ${c.y})`}>
      <image href={compass.customUrl} x={c.x - w / 2} y={c.y - h / 2} width={w} height={h}
        preserveAspectRatio="xMidYMid meet" />
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Room / object markers                                               */
/* ------------------------------------------------------------------ */

/** Drawn room/area outlines — rect, ellipse, or polygon. Same MarkerKind vocabulary
 *  and colour as point markers, so a room and a pin of the same kind read as one system. */
function RoomShapesLayer({ shapes, selected, k, vr }: {
  shapes: RoomShape[]; selected?: string | null; k: number; vr: number
}) {
  if (shapes.length === 0) return null
  return (
    <g>
      {shapes.map((r) => {
        const meta = markerKindMeta(r.kind)
        const on = r.id === selected
        const [p1, p2] = r.pts
        if (!p1 || !p2) return null
        let shapeEl: React.ReactElement<React.SVGProps<SVGElement>>
        let cx: number, cy: number
        if (r.shape === 'ellipse') {
          cx = (p1.x + p2.x) / 2; cy = (p1.y + p2.y) / 2
          const rx = Math.abs(p2.x - p1.x) / 2, ry = Math.abs(p2.y - p1.y) / 2
          shapeEl = <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
        } else if (r.shape === 'polygon' && r.pts.length >= 3) {
          const xs = r.pts.map((p) => p.x), ys = r.pts.map((p) => p.y)
          cx = (Math.min(...xs) + Math.max(...xs)) / 2
          cy = (Math.min(...ys) + Math.max(...ys)) / 2
          const d = `M${r.pts.map((p) => `${p.x} ${p.y}`).join('L')}Z`
          shapeEl = <path d={d} />
        } else {
          const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y)
          const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y)
          cx = x + w / 2; cy = y + h / 2
          shapeEl = <rect x={x} y={y} width={w} height={h} rx={Math.min(6 / k, w / 4, h / 4)} />
        }
        return (
          <g key={r.id}>
            {cloneElement(shapeEl, { fill: meta.color, fillOpacity: on ? 0.28 : 0.16 })}
            {cloneElement(shapeEl, { fill: 'none', stroke: INKHALO, strokeWidth: (on ? 4.4 : 3) / k, opacity: 0.55 })}
            {cloneElement(shapeEl, {
              fill: 'none', stroke: meta.color, strokeWidth: (on ? 2.6 : 1.8) / k,
              strokeDasharray: on ? undefined : `${9 / k} ${5 / k}`, opacity: 0.95,
            })}
            <text x={cx} y={cy} fontSize={10.5 / k} fontFamily={FONT} fontWeight={700}
              fill="#F5EFDD" textAnchor="middle" dominantBaseline="central"
              transform={`rotate(${-vr} ${cx} ${cy})`} {...haloProps(3 / k)}>
              {r.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function MarkersLayer(props: {
  markers: Marker[]; k: number; vr: number; center: Pt | null; north: number; R: number
}) {
  const { markers, k, vr, center, north, R } = props
  if (markers.length === 0) return null
  return (
    <g>
      {markers.map((m) => {
        const meta = markerKindMeta(m.kind)
        // every marker's placement is one lookup away — reuse it to echo the marker's own
        // zone (a thin ring in the zone's colour) and, for entrances, to tie back to the wheel
        const pl = center ? placementOf(m.p, center, north) : null
        return (
          <g key={m.id}>
            {m.kind === 'entrance' && center && pl && R > 0 && (() => {
              const rim = polar(center, north + pl.bearing, R)
              const padaA0 = north + GATE_START_DEG + pl.padaIdx * 11.25
              const q = GATE_QUALITY[pl.pada.code]
              const qColor = q?.v === 'good' ? GATE_GOOD : q?.v === 'caution' ? GATE_CAUTION : '#F26B57'
              return (
                <Fragment>
                  {/* the pada this entrance actually crosses, lit up — readable even with no wheel showing */}
                  <path d={ringSectorPath(center, R * 0.86, R, padaA0, padaA0 + 11.25)}
                    fill={qColor} fillOpacity={0.16} />
                  {/* a radial tie: centre through the marker (they're collinear by construction) to the rim */}
                  <line x1={center.x} y1={center.y} x2={rim.x} y2={rim.y}
                    stroke={INKHALO} strokeWidth={3 / k} opacity={0.4} strokeDasharray={`${7 / k} ${6 / k}`} />
                  <line x1={center.x} y1={center.y} x2={rim.x} y2={rim.y}
                    stroke="#F26B57" strokeWidth={1.3 / k} opacity={0.65} strokeDasharray={`${7 / k} ${6 / k}`} />
                  <circle cx={rim.x} cy={rim.y} r={3.2 / k} fill={qColor} stroke={INKHALO} strokeWidth={1.4 / k} />
                  {R * k > 100 && (
                    <RingLabel c={center} deg={north + pl.bearing} r={R + 14 / k} size={9.5 / k}
                      text={pl.pada.code} fill={qColor} weight={800} halo={2.6 / k} vr={vr} />
                  )}
                </Fragment>
              )
            })()}
            {pl && (
              <circle cx={m.p.x} cy={m.p.y} r={9.3 / k} fill="none"
                stroke={pl.zone.color} strokeWidth={1.3 / k} opacity={0.85} />
            )}
            <circle cx={m.p.x} cy={m.p.y} r={10 / k} fill={INKHALO} opacity={0.75} />
            <circle cx={m.p.x} cy={m.p.y} r={8 / k} fill={meta.color} stroke="#FFFDF4" strokeWidth={1.4 / k} />
            <text x={m.p.x} y={m.p.y + 0.5 / k} fontSize={9 / k} fontFamily={FONT} fontWeight={800}
              fill="#14151A" textAnchor="middle" dominantBaseline="central"
              transform={`rotate(${-vr} ${m.p.x} ${m.p.y})`}>
              {meta.glyph}
            </text>
            <text x={m.p.x} y={m.p.y + 20 / k} fontSize={9.5 / k} fontFamily={FONT} fontWeight={650}
              fill="#F0EBDD" textAnchor="middle"
              transform={`rotate(${-vr} ${m.p.x} ${m.p.y + 20 / k})`}
              {...haloProps(2.8 / k)}>
              {m.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Center marker                                                       */
/* ------------------------------------------------------------------ */

function CenterMarker(props: {
  c: Pt; brahmaR: number; k: number; brahmasthan: boolean; closed: boolean
  areaText: string | null; overridden: boolean; vr?: number; north: number
}) {
  const { c, brahmaR, k, brahmasthan, closed, areaText, overridden, vr = 0 } = props
  return (
    <g>
      {closed && brahmasthan && brahmaR > 0 && (
        <g>
          {/* the Brahmasthan circle — exactly one ninth of the plot's area (the mandala's
              central 3×3 of 81 padas), per analysis.ts's brahmasthanRadius */}
          <circle cx={c.x} cy={c.y} r={brahmaR}
            fill={GOLD} fillOpacity={0.055} stroke="none" />
          <circle cx={c.x} cy={c.y} r={brahmaR}
            fill="none" stroke={INKHALO} strokeWidth={2.6 / k} opacity={0.5} />
          <circle cx={c.x} cy={c.y} r={brahmaR}
            fill="none" stroke={GOLD} strokeWidth={1.1 / k} strokeDasharray={`${7 / k} ${5 / k}`} opacity={0.85} />
          <text x={c.x} y={c.y - brahmaR - 9 / k} fontSize={10.5 / k} fontFamily={FONT}
            fontWeight={600} fill="#D8C989" textAnchor="middle" opacity={0.9}
            transform={`rotate(${-vr} ${c.x} ${c.y - brahmaR - 9 / k})`}
            {...haloProps(2.8 / k)}>
            Brahmasthan
          </text>
        </g>
      )}
      <line x1={c.x - 15 / k} y1={c.y} x2={c.x + 15 / k} y2={c.y}
        stroke={INKHALO} strokeWidth={3.4 / k} opacity={0.7} />
      <line x1={c.x} y1={c.y - 15 / k} x2={c.x} y2={c.y + 15 / k}
        stroke={INKHALO} strokeWidth={3.4 / k} opacity={0.7} />
      <line x1={c.x - 15 / k} y1={c.y} x2={c.x + 15 / k} y2={c.y}
        stroke="#F5EBD3" strokeWidth={1.2 / k} opacity={0.95} />
      <line x1={c.x} y1={c.y - 15 / k} x2={c.x} y2={c.y + 15 / k}
        stroke="#F5EBD3" strokeWidth={1.2 / k} opacity={0.95} />
      <circle cx={c.x} cy={c.y} r={4.2 / k} fill={overridden ? '#F2A65A' : GOLD}
        stroke="#FFFDF4" strokeWidth={1.4 / k} />
      {overridden && (
        <text x={c.x} y={c.y + 16 / k} fontSize={9.5 / k} fontFamily={FONT} fontWeight={700}
          fill="#F2A65A" textAnchor="middle" transform={`rotate(${-vr} ${c.x} ${c.y + 16 / k})`}
          {...haloProps(2.6 / k)}>
          centre pinned
        </text>
      )}
      {areaText && (
        <text x={c.x} y={c.y + 30 / k} fontSize={12.5 / k} fontFamily={FONT} fontWeight={700}
          fill="#F3E9CF" textAnchor="middle" transform={`rotate(${-vr} ${c.x} ${c.y + 30 / k})`}
          {...haloProps(3.4 / k)}>
          {areaText}
        </text>
      )}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Scene root                                                          */
/* ------------------------------------------------------------------ */

export function Scene(props: SceneProps) {
  const { bg, dxf, pts, bulges, closed, center, R, northDeg, compass, metersPerPx, unit, k, showEdgeLabels, idPrefix } = props
  const vr = props.viewRotDeg ?? 0

  const RS = R * (compass.scalePct / 100)
  const showCompass = compass.id !== 'none' && closed && center && RS > 0

  const sampled = useMemo(() => sampledPolygon(pts, bulges, closed), [pts, bulges, closed])

  const areaText = useMemo(() => {
    if (!closed || pts.length < 3 || !metersPerPx) return null
    return formatArea(polygonArea(sampled) * metersPerPx * metersPerPx, unit)
  }, [sampled, pts.length, closed, metersPerPx, unit])

  const chakraProps: ChakraProps | null = showCompass && center
    ? { c: center, R: RS, north: northDeg, compass, k, vr, pts: sampled, closed, idPrefix, baseR: R, paper: props.paper ?? false }
    : null

  // entrance ties reach whichever ring is actually on screen (the scaled wheel radius when a
  // compass is showing), falling back to the plot's own circumradius when no wheel is selected
  const tieR = chakraProps ? chakraProps.R : R

  return (
    <g>
      <defs>
        {pts.length >= 3 && (
          <clipPath id={`${idPrefix}-plotclip`}>
            <path d={outlinePathD(pts, bulges, true)} />
          </clipPath>
        )}
      </defs>
      <Background bg={bg} dxf={dxf} k={k} paper={props.paper} />
      <g key={compass.id} className="compass-enter" opacity={compass.opacity}>
        {chakraProps && compass.id === 'custom' && <CustomOverlay {...chakraProps} />}
        {chakraProps && compass.id === 'zones16' && <Zones16 {...chakraProps} />}
        {chakraProps && compass.id === 'gates32' && <Gates32 {...chakraProps} />}
        {chakraProps && compass.id === 'chakra8' && <Chakra8 {...chakraProps} />}
        {chakraProps && compass.id === 'grid9' && <Grid9 {...chakraProps} />}
        {chakraProps && compass.id === 'dial' && <Dial {...chakraProps} />}
      </g>
      {/* tapped zone from the analysis panel, lit on the plan itself */}
      {typeof props.highlightZone === 'number' && closed && center && R > 0 && (() => {
        const z = ZONES16[props.highlightZone]
        if (!z) return null
        const a0 = northDeg - 11.25 + props.highlightZone * 22.5
        const d = wedgePath(center, R * 1.6, a0, a0 + 22.5)
        return (
          <g clipPath={`url(#${idPrefix}-plotclip)`}>
            <path d={d} fill={z.color} fillOpacity={0.42} />
            <path d={d} fill="none" stroke={z.color} strokeWidth={2.5 / k} opacity={0.95} />
          </g>
        )
      })()}
      <Outline pts={pts} bulges={bulges} closed={closed} k={k} metersPerPx={metersPerPx} unit={unit}
        showEdgeLabels={showEdgeLabels} center={center} vr={vr} />
      <StrokesLayer strokes={props.strokes ?? []} />
      <TextsLayer texts={props.texts ?? []} selected={props.selectedText} k={k} vr={vr} />
      <RoomShapesLayer shapes={props.roomShapes ?? []} selected={props.selectedRoomShape} k={k} vr={vr} />
      <MarkersLayer markers={props.markers ?? []} k={k} vr={vr} center={center} north={northDeg} R={tieR} />
      {center && pts.length >= 3 && (
        <CenterMarker c={center}
          brahmaR={brahmasthanRadius(sampled) * ((compass.brahmaPct ?? 100) / 100)}
          k={k} brahmasthan={compass.brahmasthan}
          closed={closed} areaText={areaText} overridden={props.centerOverridden ?? false} vr={vr} north={northDeg} />
      )}
    </g>
  )
}
