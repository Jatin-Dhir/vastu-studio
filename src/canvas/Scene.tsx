import { cloneElement, Fragment, memo, useMemo, useRef } from 'react'
import type { BgState, CompassState, Marker, Pt, RoomShape, Stroke, TextNote, Unit } from '../types'
import type { DxfImport } from '../importers/dxf'
import { edgeLength, edgePoint, outlinePathD, polar, polygonArea, sampledPolygon } from '../geometry'
import { brahmasthanRadius, placementOf } from '../analysis'
import { formatArea, formatLen } from '../format'
import { GATES32, GATE_QUALITY, GATE_START_DEG, MANDALA_INNER, ZONES16, mandalaCellName, markerKindMeta } from '../vastu'
import { at } from './svgText'

export const FONT = "'Inter Variable', Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
export const GOLD = '#D9B45B'
const INKHALO = 'rgba(9,10,14,0.78)'
/** Muted gold-brown — the design system's secondary-line ink (design language spec). */
const MUTED = '#8C7642'
/** Gate verdict colours, the same ladder as every other verdict in the app: auspicious green
 *  (ZONES16 E), challenging amber, inauspicious red (ZONES16 SE). The charts' 'avoid' class
 *  is most of the negative gates, so it takes the strongest colour. */
const GATE_GOOD = '#63B56F'
const GATE_CAUTION = '#D9A13B'
const GATE_AVOID = '#E0684F'
const gateColor = (v: string | undefined): string | null =>
  v === 'good' ? GATE_GOOD : v === 'caution' ? GATE_CAUTION : v === 'avoid' ? GATE_AVOID : null

/** Distance from c to the outline point farthest from it. */
function farthestFrom(c: Pt, pts: Pt[]): number {
  let m = 0
  for (const p of pts) m = Math.max(m, Math.hypot(p.x - c.x, p.y - c.y))
  return m
}

/** The room a label takes on the plan, as a capsule (a segment with a radius) in world units:
 *  what a movable label has to stay clear of. A point's circle is a capsule with a = b. */
export interface Keepout { a: Pt; b: Pt; r: number }

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function segmentsCross(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const o = (a: Pt, b: Pt, c: Pt) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  return o(p1, p2, q1) !== o(p1, p2, q2) && o(q1, q2, p1) !== o(q1, q2, p2)
}

function capsulesMeet(a: Keepout, b: Keepout): boolean {
  if (segmentsCross(a.a, a.b, b.a, b.b)) return true
  const d = Math.min(
    distToSegment(a.a, b.a, b.b), distToSegment(a.b, b.a, b.b),
    distToSegment(b.a, a.a, a.b), distToSegment(b.b, a.a, a.b),
  )
  return d < a.r + b.r
}

/** Advance width of Inter at 600–800: 0.6 em a character is within a few percent for the
 *  capitals, digits and foot/inch marks these labels carry. */
const textW = (text: string, size: number) => text.length * 0.6 * size

/** A label kept screen-upright (turned by -vr) and centred on p, as a capsule. */
function uprightCapsule(p: Pt, w: number, h: number, vr: number): Keepout {
  const rad = (-vr * Math.PI) / 180
  const half = Math.max(0, w / 2 - h / 2)
  const ux = Math.cos(rad) * half, uy = Math.sin(rad) * half
  return { a: { x: p.x - ux, y: p.y - uy }, b: { x: p.x + ux, y: p.y + uy }, r: h / 2 }
}

/** The 16-zone ring's lettering size, or null when that tier stays hidden. A tier appears once
 *  its ring has room for it and is never drawn below a readable size: the diagonals used to
 *  come in at 4.8 px and the rest at 7 px. Shared with the keep-outs so they match what shows. */
function zoneLabelSize(i: number, R: number, k: number): number | null {
  const cardinal = i % 4 === 0
  const diagonal = i % 4 === 2
  const ringPx = R * k
  if (!cardinal && !diagonal && ringPx < 167) return null
  if (diagonal && ringPx < 114) return null
  return cardinal ? Math.min(Math.max(R * 0.062, 9.5 / k), R * 0.11) : Math.max(R * 0.042, 9 / k)
}

/** Below this on-screen radius the Brahmasthan circle speaks for itself: its label would only
 *  crowd the plot's centre, where the area and the nearest room names already sit. */
const BRAHMA_LABEL_MIN_PX = 50

/** Where the Brahmasthan label sits: above its circle, or below it when a marker or its caption
 *  is in the way above and the space below is clear (it used to run under the Pooja marker). */
function brahmaLabelY(c: Pt, brahmaR: number, k: number, avoid: Pt[]): number {
  const half = textW('Brahmasthan', 10.5 / k) / 2
  const blocked = (y: number) => avoid.some((p) => Math.abs(p.x - c.x) < half + 14 / k && Math.abs(p.y - y) < 17 / k)
  const above = c.y - brahmaR - 9 / k
  const below = c.y + brahmaR + 19 / k
  return blocked(above - 4 / k) && !blocked(below - 4 / k) ? below : above
}

/** Gate names are sized to their pada; the longest decides when every one can be read. */
const LONGEST_DEVTA = Math.max(...GATES32.map((g) => g.devta.length))

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
  /** wall render style — practitioner preference, defaults match the original look */
  wallColor?: string
  wallWidthM?: number
  wallOpacity?: number
  /** light paper ground (PNG export) — swaps the few inks that assume the dark canvas */
  paper?: boolean
  idPrefix: string
  /** the wheel steps aside while the outline itself is traced or reshaped — kept mounted and
   *  frozen at its last drawing rather than unmounted, so a corner press no longer tears down
   *  ~120 nodes and a release no longer replays the 0.45 s entrance animation */
  compassHidden?: boolean
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
        const place = at(t.p.x, t.p.y, 0, t.size)
        return (
          <g key={t.id} transform={`rotate(${-vr} ${t.p.x} ${t.p.y})`}>
            {on && (
              <rect x={t.p.x - t.size * 0.3} y={t.p.y - t.size * 0.95} width={boxW + t.size * 0.6} height={boxH + t.size * 0.55}
                fill="none" stroke={GOLD} strokeWidth={1.4 / k} strokeDasharray={`${6 / k} ${4 / k}`} rx={3 / k} opacity={0.95} />
            )}
            <text {...place} fontSize={t.size} fontFamily={FONT} fontWeight={650}
              fill={t.color} {...haloProps(t.size * 0.22)}>
              {lines.map((l, i) => (
                <tspan key={i} x={place.x} dy={i === 0 ? 0 : t.size * 1.25}>{l}</tspan>
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
      {...at(p.x, p.y, rot, size)}
      textAnchor="middle" dominantBaseline="central"
      fontSize={size} fontWeight={weight} fontFamily={FONT}
      fill={fill} opacity={opacity}
      letterSpacing={spacing}
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
  wallColor?: string; wallWidthM?: number; wallOpacity?: number
  /** labels that outrank the wall lengths: the wheel's letters, markers and their captions */
  keepouts?: Keepout[]
}) {
  const {
    pts, bulges, closed, k, metersPerPx, unit, showEdgeLabels, center, vr = 0,
    wallColor = '#C9C6BC', wallWidthM = 0.23, wallOpacity = 1,
  } = props
  if (pts.length === 0) return null
  const d = outlinePathD(pts, bulges, closed)
  const n = pts.length
  const edges: [Pt, Pt, number][] = []
  for (let i = 0; i < (closed ? n : n - 1); i++) edges.push([pts[i], pts[(i + 1) % n], bulges[i] ?? 0])

  // real wall thickness once scale is known (default 23cm / ~9in, the standard interior-wall
  // convention, practitioner-adjustable) — a solid architectural band, not a thin decorative
  // line; before scaling there's no real-world size to convert, so the practitioner's chosen
  // thickness is applied as a ratio against the same on-screen baseline the default (23cm)
  // used to produce — the slider still visibly moves the wall pre-calibration, not just after
  const wallW = metersPerPx ? wallWidthM / metersPerPx : (15 / k) * (wallWidthM / 0.23)

  return (
    <g opacity={wallOpacity}>
      {closed && <path d={d} fill={GOLD} fillOpacity={0.03} stroke="none" />}
      {/* a real architectural wall: a solid band framed by a crisp dark face line — the
          convention every floor-plan drawing (and every reference chart the owner sent)
          actually uses. The dark casing stays fixed regardless of fill colour: it's what
          reads as a wall's edge, not the building's own colour choice. */}
      <path d={d} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={wallW + 3 / k} opacity={0.45}
        strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#17181C" strokeWidth={wallW}
        strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke={wallColor} strokeWidth={Math.max(1.2 / k, wallW - 2.6 / k)}
        strokeLinejoin="round" strokeLinecap="round" />
      {showEdgeLabels && metersPerPx && (() => {
        // a length makes way for what matters more (the wheel's letters, markers and their
        // captions, the lengths already placed): it slides along its own wall to a free
        // stretch, and stays off the plan at this zoom when there is none. They used to sit
        // on the "W", under a door's gate code, into "Bore well".
        const taken: Keepout[] = [...(props.keepouts ?? [])]
        const size = 11.5 / k
        return edges.map(([a, b, bu], i) => {
          const L = edgeLength(a, b, bu)
          if (L * k < 46) return null
          const text = formatLen(L * metersPerPx, unit)
          const half = textW(text, size) / 2
          const chordL = Math.hypot(b.x - a.x, b.y - a.y) || 1
          const ux = (b.x - a.x) / chordL, uy = (b.y - a.y) / chordL
          let rot = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
          const screenRot = ((rot + vr) % 360 + 360) % 360
          if (screenRot > 90 && screenRot < 270) rot += 180
          let nx = uy, ny = -ux
          const mid = edgePoint(a, b, bu, 0.5) // tangent at the arc midpoint is parallel to the chord
          if (center) {
            const toC = { x: center.x - mid.x, y: center.y - mid.y }
            if (nx * toC.x + ny * toC.y > 0) { nx = -nx; ny = -ny }
          }
          const off = wallW / 2 + 9 / k
          const reach = Math.max(0, half - size / 2)
          // a curved wall keeps its label at the arc's middle, the one place the chord's angle is true
          const ts = Math.abs(bu) < 0.02 ? [0.5, 0.36, 0.64, 0.23, 0.77] : [0.5]
          for (const t of ts) {
            if (t !== 0.5 && (t * L < half + 6 / k || (1 - t) * L < half + 6 / k)) continue
            const m = t === 0.5 ? mid : edgePoint(a, b, bu, t)
            const p = { x: m.x + nx * off, y: m.y + ny * off }
            const cap: Keepout = { a: { x: p.x - ux * reach, y: p.y - uy * reach }, b: { x: p.x + ux * reach, y: p.y + uy * reach }, r: size * 0.55 }
            if (taken.some((q) => capsulesMeet(cap, q))) continue
            taken.push(cap)
            return (
              <text key={i} {...at(p.x, p.y, rot, size)} fontSize={size} fontWeight={600} fontFamily={FONT}
                fill="#F3E9CF" textAnchor="middle" dominantBaseline="central"
                {...haloProps(3 / k)}>
                {text}
              </text>
            )
          }
          return null
        })
      })()}
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
  /** 'body' draws the wheel itself, beneath the walls; 'labels' only its lettering, above them.
   *  Lettering drawn under the walls was cut by them ("WSW" read "WS"). */
  part?: 'body' | 'labels'
}

function DegreeTicks({ c, R, north, numbers, k, vr = 0, part = 'body' }: {
  c: Pt; R: number; north: number; numbers: boolean; k: number; vr?: number; part?: 'body' | 'labels'
}) {
  if (part === 'labels') {
    if (!numbers) return null
    // held to a readable size; the tier only opens once the ring has room for seven of them
    const size = Math.max(R * 0.032, 9.5 / k)
    return (
      <g>
        {[45, 90, 135, 180, 225, 270, 315].map((d) => (
          <RingLabel key={d} c={c} deg={north + d} r={R * 0.905} size={size}
            text={`${d}°`} fill="#CBD2DF" weight={600} opacity={0.92} halo={size * 0.26} vr={vr} />
        ))}
      </g>
    )
  }
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
  return <g>{ticks}</g>
}

function Zones16({ c, R, north, compass, k, vr, pts, closed, idPrefix, baseR, part = 'body' }: ChakraProps) {
  if (part === 'labels') {
    return (
      <g>
        {compass.degreeRing && <DegreeTicks c={c} R={R} north={north} numbers={R * k > 300} k={k} vr={vr} part="labels" />}
        {compass.labels && ZONES16.map((z, i) => {
          const size = zoneLabelSize(i, R, k)
          if (size == null) return null
          const cardinal = i % 4 === 0
          return (
            <RingLabel key={z.key} c={c} deg={north + i * 22.5} r={R * 1.065}
              size={size}
              text={z.key} weight={cardinal ? 800 : 600}
              fill={i === 0 ? '#F26B57' : cardinal ? '#F5EBD3' : '#D8DCE6'}
              halo={size * 0.28} spacing={R * 0.004} vr={vr} upright={cardinal} />
          )
        })}
      </g>
    )
  }
  const clip = compass.clip && closed && pts.length >= 3
  const clipId = `${idPrefix}-plotclip`
  // clipped fills must reach every corner of the plot regardless of the Size slider — the
  // farthest outline point, not a multiple of the wheel radius (a 1:5 plot's ends sit ~2.4R
  // out and stayed un-tinted at 1.7R)
  const fillR = clip ? Math.max(baseR * 1.7, farthestFrom(c, pts) * 1.02) : R
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
      {compass.degreeRing && <DegreeTicks c={c} R={R} north={north} numbers={false} k={k} vr={vr} />}
      <NorthNeedle c={c} R={R} north={north} k={k} />
    </g>
  )
}

function Gates32({ c, R, north, compass, k, vr, paper, part = 'body' }: ChakraProps) {
  if (part === 'labels') {
    if (!compass.labels) return null
    // names once the longest of them reads at 8 px or more; below that the codes alone, held
    // at 8.5 px, while the ring still has room for all 32 (they used to go down to 5 px)
    const nameFloorPx = Math.min(R * 0.033, (R * 0.16) / (LONGEST_DEVTA * 0.58)) * k
    const codeSize = Math.max(R * 0.03, 8.5 / k)
    return (
      <g>
        {nameFloorPx >= 8 && GATES32.map((g, i) => {
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
        {nameFloorPx < 8 && R * k >= 150 && GATES32.map((g, i) => {
          const mid = north + GATE_START_DEG + (i + 0.5) * 11.25
          return (
            <RingLabel key={g.code} c={c} deg={mid} r={R * 0.9} size={codeSize} text={g.code}
              fill="#D9CCA6" weight={700} halo={codeSize * 0.26} vr={vr} />
          )
        })}
        {['N', 'E', 'S', 'W'].map((t, i) => (
          <RingLabel key={t} c={c} deg={north + i * 90} r={R * 1.07}
            size={Math.min(Math.max(R * 0.055, 10 / k), R * 0.1)}
            text={t} weight={800} fill={i === 0 ? '#F26B57' : '#F5EBD3'} halo={R * 0.014} vr={vr} upright />
        ))}
      </g>
    )
  }
  const r0 = R * 0.8
  return (
    <g>
      {GATES32.map((g, i) => {
        const a0 = north + GATE_START_DEG + i * 11.25
        // the app's best domain data, one lookup away — auspicious/challenging gates now visible
        const q = GATE_QUALITY[g.code]
        const qColor = gateColor(q?.v)
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
    </g>
  )
}

function Grid9({ c, north, compass, k, vr, pts, closed, paper, part = 'body' }: ChakraProps) {
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

  const cellRects = []
  const cellNames = []
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const name = mandalaCellName(row, col)
      const x = minX + col * cw, y = minY + row * ch
      const isBrahma = row >= 3 && row <= 5 && col >= 3 && col <= 5
      if (isBrahma) {
        cellRects.push(<rect key={`f${row}-${col}`} x={x} y={y} width={cw} height={ch}
          fill={GOLD} fillOpacity={0.07} />)
      } else if (name) {
        cellRects.push(<rect key={`f${row}-${col}`} x={x} y={y} width={cw} height={ch}
          fill={paper ? '#14151A' : '#FFFFFF'} fillOpacity={0.028} />)
      }
      if (name && compass.devtas) {
        const size = Math.min(Math.min(cw, ch) * 0.24, (cw * 0.9) / (name.length * 0.56))
        // below 8 px a name is a smudge, not a word
        if (size * k < 8) continue
        const tx = x + cw / 2, ty = y + ch / 2
        cellNames.push(
          <text key={`n${row}-${col}`} {...at(tx, ty, upr, size)}
            fontSize={size} fontFamily={FONT} fontWeight={600} fill="#EDE4CC"
            textAnchor="middle" dominantBaseline="central" opacity={0.92}
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
    if (!big && size * k < 8) return null
    const tx = minX + colC * cw, ty = minY + rowC * ch
    return (
      <text {...at(tx, ty, upr, size)} fontSize={size} fontFamily={FONT}
        fontWeight={big ? 700 : 600} fill={big ? GOLD : '#C9BE9D'}
        textAnchor="middle" dominantBaseline="central" opacity={big ? 0.95 : 0.8}
        {...haloProps(size * 0.2)}>
        {text}
      </text>
    )
  }

  // north needle above the frame's top edge — no counter-rotation, since its whole job
  // is to point at north, tracking the frame's own rotation exactly as Dial's needle does
  const nx = (minX + maxX) / 2
  const needleD = `M${nx} ${minY - ch * 0.95} L${nx + cw * 0.1} ${minY - ch * 0.58} L${nx - cw * 0.1} ${minY - ch * 0.58} Z`

  if (part === 'labels') {
    return (
      <g transform={`rotate(${north} ${c.x} ${c.y})`}>
        {cellNames}
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
        {compass.labels && (
          <text {...at(nx, minY - ch * 0.35, upr, Math.min(cw, ch) * 0.42)} fontSize={Math.min(cw, ch) * 0.42}
            fontFamily={FONT} fontWeight={800} fill="#F26B57" textAnchor="middle"
            dominantBaseline="central"
            {...haloProps(Math.min(cw, ch) * 0.09)}>
            N
          </text>
        )}
      </g>
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

  return (
    <g transform={`rotate(${north} ${c.x} ${c.y})`}>
      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY}
        fill="none" stroke={INKHALO} strokeWidth={3.8 / k} opacity={0.5} />
      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY}
        fill="none" stroke={GOLD} strokeWidth={2 / k} opacity={0.9} />
      {cellRects}
      {lines}
      <path d={needleD} fill="#F26B57" stroke={INKHALO} strokeWidth={2.4 / k} strokeLinejoin="round" opacity={0.98} />
      <path d={needleD} fill="#F26B57" stroke="#FFFDF4" strokeWidth={0.9 / k} strokeLinejoin="round" />
    </g>
  )
}

function CustomOverlay({ c, R, north, compass, part = 'body' }: ChakraProps) {
  if (part === 'labels' || !compass.customUrl) return null
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
function RoomShapesLayer({ shapes, selected, k, vr, keepouts }: {
  shapes: RoomShape[]; selected?: string | null; k: number; vr: number
  /** markers, captions and the centre's labels, which a tag must not sit on */
  keepouts?: Keepout[]
}) {
  if (shapes.length === 0) return null
  const taken: Keepout[] = [...(keepouts ?? [])]
  return (
    <g>
      {shapes.map((r) => {
        const meta = markerKindMeta(r.kind)
        const on = r.id === selected
        const [p1, p2] = r.pts
        if (!p1 || !p2) return null
        let shapeEl: React.ReactElement<React.SVGProps<SVGElement>>
        let cx: number, cy: number
        // the box a corner tag may sit in (an ellipse's inscribed rectangle)
        let box: { x: number; y: number; w: number; h: number } | null = null
        if (r.shape === 'ellipse') {
          cx = (p1.x + p2.x) / 2; cy = (p1.y + p2.y) / 2
          const rx = Math.abs(p2.x - p1.x) / 2, ry = Math.abs(p2.y - p1.y) / 2
          shapeEl = <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
          box = { x: cx - rx * 0.7071, y: cy - ry * 0.7071, w: rx * 1.4142, h: ry * 1.4142 }
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
          box = { x, y, w, h }
        }
        // the name as a small tag in the room's top-left corner, clear of the drawing's own room
        // name, which plans print at the centre (the two used to garble into "L[Living]G"); a
        // room too small for that, a polygon, or a turned view keeps the tag at the centre
        const size = 10 / k
        const tagW = textW(r.label, size) + 12 / k, tagH = 17 / k
        const turned = Math.abs((((vr % 360) + 540) % 360) - 180) > 0.5
        const spots: Pt[] = []
        if (!turned && box && box.w * k >= tagW * k + 26 && box.h * k >= 50) {
          const inX = 9 / k + tagW / 2, inY = 9 / k + tagH / 2
          spots.push(
            { x: box.x + inX, y: box.y + inY }, { x: box.x + box.w - inX, y: box.y + inY },
            { x: box.x + inX, y: box.y + box.h - inY }, { x: box.x + box.w - inX, y: box.y + box.h - inY },
          )
        }
        spots.push({ x: cx, y: cy })
        // the first corner clear of the markers, the centre's labels and the tags already placed;
        // with none free the tag steps off at this zoom (the room is still named in the panel),
        // except for the selected room, which always says what it is
        const free = spots.find((p) => !taken.some((q) => capsulesMeet(uprightCapsule(p, tagW, tagH, vr), q)))
        const pick = free ?? (on ? spots[0] : null)
        if (pick) taken.push(uprightCapsule(pick, tagW, tagH, vr))
        const ax = pick?.x ?? cx, ay = pick?.y ?? cy
        return (
          <g key={r.id}>
            {cloneElement(shapeEl, { fill: meta.color, fillOpacity: on ? 0.28 : 0.16 })}
            {cloneElement(shapeEl, { fill: 'none', stroke: INKHALO, strokeWidth: (on ? 4.4 : 3) / k, opacity: 0.55 })}
            {cloneElement(shapeEl, {
              fill: 'none', stroke: meta.color, strokeWidth: (on ? 2.6 : 1.8) / k,
              strokeDasharray: on ? undefined : `${9 / k} ${5 / k}`, opacity: 0.95,
            })}
            {pick && <g transform={vr ? `rotate(${-vr} ${ax} ${ay})` : undefined}>
              <rect x={ax - tagW / 2} y={ay - tagH / 2} width={tagW} height={tagH} rx={4.5 / k}
                fill="#101116" fillOpacity={0.8} stroke={meta.color} strokeWidth={(on ? 1.6 : 1.1) / k} />
              <text {...at(ax, ay, 0, size)} fontSize={size} fontFamily={FONT} fontWeight={700}
                fill="#F5EFDD" textAnchor="middle" dominantBaseline="central">
                {r.label}
              </text>
            </g>}
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
              const qColor = gateColor(q?.v) ?? '#F26B57'
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
            <text {...at(m.p.x, m.p.y + 0.5 / k, -vr, 9 / k, m.p.x, m.p.y)} fontSize={9 / k} fontFamily={FONT} fontWeight={800}
              fill="#14151A" textAnchor="middle" dominantBaseline="central">
              {meta.glyph}
            </text>
            <text {...at(m.p.x, m.p.y + 20 / k, -vr, 9.5 / k)} fontSize={9.5 / k} fontFamily={FONT} fontWeight={650}
              fill="#F0EBDD" textAnchor="middle"
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
  /** markers and their captions: the Brahmasthan label steps below its circle to clear them */
  avoid?: Pt[]
}) {
  const { c, brahmaR, k, brahmasthan, closed, areaText, overridden, vr = 0 } = props
  const bY = brahmaLabelY(c, brahmaR, k, props.avoid ?? [])
  return (
    <g>
      {closed && brahmasthan && brahmaR > 0 && (
        <g>
          {/* the Brahmasthan circle — a quarter of the compass's own radius, per
              analysis.ts's brahmasthanRadius */}
          <circle cx={c.x} cy={c.y} r={brahmaR}
            fill={GOLD} fillOpacity={0.055} stroke="none" />
          <circle cx={c.x} cy={c.y} r={brahmaR}
            fill="none" stroke={INKHALO} strokeWidth={2.6 / k} opacity={0.5} />
          <circle cx={c.x} cy={c.y} r={brahmaR}
            fill="none" stroke={GOLD} strokeWidth={1.1 / k} strokeDasharray={`${7 / k} ${5 / k}`} opacity={0.85} />
          {brahmaR * k >= BRAHMA_LABEL_MIN_PX && <text {...at(c.x, bY, -vr, 10.5 / k)} fontSize={10.5 / k} fontFamily={FONT}
            fontWeight={600} fill="#D8C989" textAnchor="middle" opacity={0.9}
            {...haloProps(2.8 / k)}>
            Brahmasthan
          </text>}
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
        <text {...at(c.x, c.y + 16 / k, -vr, 9.5 / k)} fontSize={9.5 / k} fontFamily={FONT} fontWeight={700}
          fill="#F2A65A" textAnchor="middle"
          {...haloProps(2.6 / k)}>
          centre pinned
        </text>
      )}
      {areaText && (() => {
        // on a dark tag: the area sits where the drawing's own walls and room names cross the
        // centre, and a halo alone let "945 sq ft" run into them
        const size = 12.5 / k
        const w = textW(areaText, size) + 14 / k, h = 19 / k
        const ay = c.y + 28 / k
        return (
          <g transform={vr ? `rotate(${-vr} ${c.x} ${ay})` : undefined}>
            <rect x={c.x - w / 2} y={ay - h / 2} width={w} height={h} rx={5 / k} fill="#101116" fillOpacity={0.72} />
            <text {...at(c.x, ay, 0, size)} fontSize={size} fontFamily={FONT} fontWeight={700}
              fill="#F3E9CF" textAnchor="middle" dominantBaseline="central">
              {areaText}
            </text>
          </g>
        )
      })()}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Scene root                                                          */
/* ------------------------------------------------------------------ */

const Zones16Layer = memo(Zones16)
const Gates32Layer = memo(Gates32)
const Grid9Layer = memo(Grid9)
const CustomLayer = memo(CustomOverlay)

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
  // while hidden, draw (invisibly) the wheel as it last was — same object, so the memoised
  // layers skip their work on every frame of a drag
  const lastChakra = useRef<ChakraProps | null>(null)
  if (chakraProps && !props.compassHidden) lastChakra.current = chakraProps
  const drawn = props.compassHidden ? lastChakra.current : chakraProps

  // entrance ties reach whichever ring is actually on screen (the scaled wheel radius when a
  // compass is showing), falling back to the plot's own circumradius when no wheel is selected
  const tieR = chakraProps ? chakraProps.R : R

  // what the wall lengths must stay clear of, in the order the eye needs them: the wheel's
  // letters, then each marker, its caption and (for an entrance) its gate code
  const keepouts: Keepout[] = []
  if (drawn && !props.compassHidden && drawn.compass.labels) {
    if (drawn.compass.id === 'zones16') {
      ZONES16.forEach((z, i) => {
        const size = zoneLabelSize(i, drawn.R, k)
        if (size == null) return
        const p = polar(drawn.c, drawn.north + i * 22.5, drawn.R * 1.065)
        keepouts.push({ a: p, b: p, r: textW(z.key, size) / 2 + size * 0.3 })
      })
    } else if (drawn.compass.id === 'gates32') {
      const size = Math.min(Math.max(drawn.R * 0.055, 10 / k), drawn.R * 0.1)
      for (const d of [0, 90, 180, 270]) {
        const p = polar(drawn.c, drawn.north + d, drawn.R * 1.07)
        keepouts.push({ a: p, b: p, r: size * 0.8 })
      }
    }
  }
  const brahmaR = center ? brahmasthanRadius(sampled) * ((compass.brahmaPct ?? 100) / 100) : 0
  const avoid: Pt[] = []
  for (const m of props.markers ?? []) {
    keepouts.push({ a: m.p, b: m.p, r: 12 / k })
    const cap = { x: m.p.x, y: m.p.y + 16.5 / k }
    keepouts.push(uprightCapsule(cap, textW(m.label, 9.5 / k), 12 / k, vr))
    avoid.push(m.p, cap)
    if (m.kind === 'entrance' && center && tieR > 0 && tieR * k > 100) {
      const p = polar(center, northDeg + placementOf(m.p, center, northDeg).bearing, tieR + 14 / k)
      keepouts.push({ a: p, b: p, r: 12 / k })
    }
  }
  // what a room's tag must not sit on: all of the above, the wheel's degree numbers, and the
  // centre cross with its labels
  const tagKeepouts: Keepout[] = [...keepouts]
  if (drawn && !props.compassHidden && drawn.compass.id === 'zones16' && drawn.compass.degreeRing && drawn.R * k > 300) {
    const size = Math.max(drawn.R * 0.032, 9.5 / k)
    for (const d of [45, 90, 135, 180, 225, 270, 315]) {
      const p = polar(drawn.c, drawn.north + d, drawn.R * 0.905)
      tagKeepouts.push({ a: p, b: p, r: textW(`${d}°`, size) / 2 + size * 0.2 })
    }
  }
  if (center && pts.length >= 3) {
    tagKeepouts.push({ a: center, b: center, r: 17 / k })
    if (areaText) tagKeepouts.push(uprightCapsule({ x: center.x, y: center.y + 28 / k }, textW(areaText, 12.5 / k) + 14 / k, 19 / k, vr))
    if (closed && compass.brahmasthan && brahmaR * k >= BRAHMA_LABEL_MIN_PX) {
      const y = brahmaLabelY(center, brahmaR, k, avoid)
      tagKeepouts.push(uprightCapsule({ x: center.x, y: y - 4 / k }, textW('Brahmasthan', 10.5 / k), 13 / k, vr))
    }
  }

  return (
    <g>
      <defs>
        {pts.length >= 3 && (
          <clipPath id={`${idPrefix}-plotclip`}>
            <path d={outlinePathD(pts, bulges, true)} />
          </clipPath>
        )}
      </defs>
      {/* ids let the touch magnifier re-use just the drawing and the outline */}
      <g id={`${idPrefix}-bg`}><Background bg={bg} dxf={dxf} k={k} paper={props.paper} /></g>
      <g key={drawn?.compass.id ?? compass.id} className="compass-enter" opacity={(drawn?.compass ?? compass).opacity}
        display={props.compassHidden ? 'none' : undefined}>
        {drawn && drawn.compass.id === 'custom' && <CustomLayer {...drawn} />}
        {drawn && drawn.compass.id === 'zones16' && <Zones16Layer {...drawn} />}
        {drawn && drawn.compass.id === 'gates32' && <Gates32Layer {...drawn} />}
        {drawn && drawn.compass.id === 'grid9' && <Grid9Layer {...drawn} />}
      </g>
      {/* tapped zone from the analysis panel, lit on the plan itself */}
      {typeof props.highlightZone === 'number' && closed && center && R > 0 && (() => {
        const z = ZONES16[props.highlightZone]
        if (!z) return null
        const a0 = northDeg - 11.25 + props.highlightZone * 22.5
        const d = wedgePath(center, Math.max(R * 1.6, farthestFrom(center, sampled) * 1.02), a0, a0 + 22.5)
        return (
          <g clipPath={`url(#${idPrefix}-plotclip)`}>
            <path d={d} fill={z.color} fillOpacity={0.42} />
            <path d={d} fill="none" stroke={z.color} strokeWidth={2.5 / k} opacity={0.95} />
          </g>
        )
      })()}
      <g id={`${idPrefix}-outline`}><Outline pts={pts} bulges={bulges} closed={closed} k={k} metersPerPx={metersPerPx} unit={unit}
        showEdgeLabels={showEdgeLabels} center={center} vr={vr}
        wallColor={props.wallColor} wallWidthM={props.wallWidthM} wallOpacity={props.wallOpacity}
        keepouts={keepouts} /></g>
      {/* the wheel's lettering, above the walls that used to cut it */}
      <g key={`${drawn?.compass.id ?? compass.id}-labels`} className="compass-enter" opacity={(drawn?.compass ?? compass).opacity}
        display={props.compassHidden ? 'none' : undefined}>
        {drawn && drawn.compass.id === 'zones16' && <Zones16Layer {...drawn} part="labels" />}
        {drawn && drawn.compass.id === 'gates32' && <Gates32Layer {...drawn} part="labels" />}
        {drawn && drawn.compass.id === 'grid9' && <Grid9Layer {...drawn} part="labels" />}
      </g>
      <StrokesLayer strokes={props.strokes ?? []} />
      <TextsLayer texts={props.texts ?? []} selected={props.selectedText} k={k} vr={vr} />
      <RoomShapesLayer shapes={props.roomShapes ?? []} selected={props.selectedRoomShape} k={k} vr={vr} keepouts={tagKeepouts} />
      <MarkersLayer markers={props.markers ?? []} k={k} vr={vr} center={center} north={northDeg} R={tieR} />
      {center && pts.length >= 3 && (
        <CenterMarker c={center}
          brahmaR={brahmaR}
          k={k} brahmasthan={compass.brahmasthan}
          closed={closed} areaText={areaText} overridden={props.centerOverridden ?? false} vr={vr} north={northDeg}
          avoid={avoid} />
      )}
    </g>
  )
}
