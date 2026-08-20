import { Fragment, useMemo } from 'react'
import type { BgState, CompassState, Pt, Unit } from '../types'
import type { DxfImport } from '../importers/dxf'
import { edgeLength, edgePoint, outlinePathD, polar, polygonArea, sampledPolygon } from '../geometry'
import { formatArea, formatLen } from '../format'
import { DIRS8, GATES32, GATE_START_DEG, MANDALA_INNER, ZONES16, mandalaCellName } from '../vastu'

export const FONT = "'Inter Variable', Inter, system-ui, sans-serif"
export const GOLD = '#D9B45B'
const INKHALO = 'rgba(9,10,14,0.78)'

export interface SceneProps {
  bg: BgState
  dxf: DxfImport | null
  pts: Pt[]
  bulges: number[]
  closed: boolean
  center: Pt | null
  centerOverridden?: boolean
  R: number
  northDeg: number
  compass: CompassState
  metersPerPx: number | null
  unit: Unit
  k: number
  showEdgeLabels: boolean
  idPrefix: string
}

const haloProps = (w: number) => ({
  stroke: INKHALO,
  strokeWidth: w,
  paintOrder: 'stroke' as const,
  strokeLinejoin: 'round' as const,
})

export function RingLabel(props: {
  c: Pt; deg: number; r: number; size: number; text: string
  fill?: string; weight?: number; opacity?: number; halo?: number; spacing?: number
}) {
  const { c, deg, r, size, text, fill = '#EDEFF4', weight = 600, opacity = 1, halo = 0, spacing } = props
  const norm = ((deg % 360) + 360) % 360
  const flip = norm > 90 && norm < 270
  const p = polar(c, deg, r)
  const rot = flip ? deg + 180 : deg
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


/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

function Background({ bg, dxf, k }: { bg: BgState; dxf: DxfImport | null; k: number }) {
  if (bg.kind === 'none') return null
  const filters: string[] = []
  if (bg.grayscale) filters.push('grayscale(1)')
  if (bg.invert) filters.push('invert(0.92) hue-rotate(180deg)')
  const filter = filters.length ? filters.join(' ') : undefined

  if (bg.kind === 'raster' && bg.dataUrl) {
    return (
      <g opacity={bg.opacity}>
        <rect x={0} y={0} width={bg.w} height={bg.h} fill="#0E0F14" opacity={0.5}
          transform={`translate(${10 / k} ${14 / k})`} />
        <image href={bg.dataUrl} x={0} y={0} width={bg.w} height={bg.h}
          preserveAspectRatio="none" style={filter ? { filter } : undefined} />
      </g>
    )
  }
  if (bg.kind === 'dxf' && dxf) {
    return (
      <g opacity={bg.opacity} style={filter ? { filter } : undefined}>
        {dxf.paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#A9B4C9" strokeWidth={1.3 / k}
            strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {dxf.texts.map((t, i) => (
          <text key={`t${i}`} x={t.x} y={t.y} fontSize={t.size} fill="#7E8AA0" fontFamily={FONT}
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
  showEdgeLabels: boolean; center: Pt | null
}) {
  const { pts, bulges, closed, k, metersPerPx, unit, showEdgeLabels, center } = props
  if (pts.length === 0) return null
  const d = outlinePathD(pts, bulges, closed)
  const n = pts.length
  const edges: [Pt, Pt, number][] = []
  for (let i = 0; i < (closed ? n : n - 1); i++) edges.push([pts[i], pts[(i + 1) % n], bulges[i] ?? 0])

  return (
    <g>
      {closed && <path d={d} fill={GOLD} fillOpacity={0.055} stroke="none" />}
      <path d={d} fill="none" stroke={GOLD} strokeWidth={8 / k} opacity={0.14}
        strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke="rgba(20,16,4,0.55)" strokeWidth={3.6 / k}
        strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke={GOLD} strokeWidth={2.2 / k}
        strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#FFF3D6" strokeWidth={0.7 / k}
        strokeLinejoin="round" strokeLinecap="round" opacity={0.55} />
      {showEdgeLabels && metersPerPx && edges.map(([a, b, bu], i) => {
        const L = edgeLength(a, b, bu)
        if (L * k < 46) return null
        const chordL = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const mid = edgePoint(a, b, bu, 0.5) // tangent at the arc midpoint is parallel to the chord
        let rot = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
        if (rot > 90 || rot < -90) rot += 180
        let nx = (b.y - a.y) / chordL, ny = -(b.x - a.x) / chordL
        if (center) {
          const toC = { x: center.x - mid.x, y: center.y - mid.y }
          if (nx * toC.x + ny * toC.y > 0) { nx = -nx; ny = -ny }
        }
        const off = 13 / k
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
  c: Pt; R: number; north: number; compass: CompassState; k: number
  pts: Pt[]; closed: boolean; idPrefix: string
}

function DegreeTicks({ c, R, north, numbers, k }: { c: Pt; R: number; north: number; numbers: boolean; k: number }) {
  const ticks = []
  for (let d = 0; d < 360; d += 5) {
    const major = d % 30 === 0
    const med = d % 10 === 0
    const len = major ? R * 0.045 : med ? R * 0.032 : R * 0.02
    const a = north + d
    const p0 = polar(c, a, R - len)
    const p1 = polar(c, a, R)
    ticks.push(
      <line key={d} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
        stroke="#E8DDBE" strokeWidth={(major ? 1.4 : 0.8) / k} opacity={major ? 0.8 : 0.45} />,
    )
  }
  return (
    <g>
      {ticks}
      {numbers && Array.from({ length: 12 }, (_, i) => i * 30).map((d) => (
        <RingLabel key={d} c={c} deg={north + d} r={R * 0.905} size={R * 0.033}
          text={String(d)} fill="#CBD2DF" weight={500} opacity={0.85} />
      ))}
    </g>
  )
}

function Zones16({ c, R, north, compass, k, pts, closed, idPrefix }: ChakraProps) {
  const clip = compass.clip && closed && pts.length >= 3
  const clipId = `${idPrefix}-plotclip`
  const fills = (
    <g clipPath={clip ? `url(#${clipId})` : undefined}>
      {ZONES16.map((z, i) => {
        const a0 = north - 11.25 + i * 22.5
        return (
          <path key={z.key} d={wedgePath(c, R * (clip ? 1.6 : 1), a0, a0 + 22.5)}
            fill={z.color} fillOpacity={compass.fillPct / 100} stroke="none" />
        )
      })}
    </g>
  )
  return (
    <g>
      {fills}
      {ZONES16.map((_, i) => {
        const a = north - 11.25 + i * 22.5
        const p = polar(c, a, R)
        return <line key={i} x1={c.x} y1={c.y} x2={p.x} y2={p.y}
          stroke="#EFE3C0" strokeWidth={0.9 / k} opacity={0.5} />
      })}
      <circle cx={c.x} cy={c.y} r={R} fill="none" stroke={GOLD} strokeWidth={1.6 / k} opacity={0.9} />
      <circle cx={c.x} cy={c.y} r={R * 1.001} fill="none" stroke="#FFF6DF" strokeWidth={0.5 / k} opacity={0.4} />
      {compass.degreeRing && <DegreeTicks c={c} R={R} north={north} numbers={R * k > 260} k={k} />}
      {compass.labels && ZONES16.map((z, i) => {
        const mid = north + i * 22.5
        const cardinal = i % 4 === 0
        return (
          <RingLabel key={z.key} c={c} deg={mid} r={R * 1.065}
            size={cardinal ? R * 0.062 : R * 0.042}
            text={z.key} weight={cardinal ? 800 : 600}
            fill={i === 0 ? '#F26B57' : cardinal ? '#F5EBD3' : '#D8DCE6'}
            halo={R * 0.012} spacing={R * 0.004} />
        )
      })}
    </g>
  )
}

function Gates32({ c, R, north, compass, k }: ChakraProps) {
  const r0 = R * 0.8
  return (
    <g>
      {GATES32.map((g, i) => {
        const a0 = north + GATE_START_DEG + i * 11.25
        return (
          <Fragment key={g.code}>
            {i % 2 === 0 && (
              <path d={ringSectorPath(c, r0, R, a0, a0 + 11.25)} fill="#FFFFFF" fillOpacity={0.045} />
            )}
            <line x1={polar(c, a0, r0).x} y1={polar(c, a0, r0).y}
              x2={polar(c, a0, R).x} y2={polar(c, a0, R).y}
              stroke="#E8DDBE" strokeWidth={0.8 / k} opacity={0.55} />
          </Fragment>
        )
      })}
      {[45, 135, 225, 315].map((d) => {
        const p = polar(c, north + d, R)
        return <line key={d} x1={c.x} y1={c.y} x2={p.x} y2={p.y}
          stroke={GOLD} strokeWidth={1.2 / k} opacity={0.65} />
      })}
      {[0, 90, 180, 270].map((d) => {
        const p = polar(c, north + d, R)
        return <line key={d} x1={c.x} y1={c.y} x2={p.x} y2={p.y}
          stroke="#F2E6C4" strokeWidth={1.1 / k} opacity={0.5} strokeDasharray={`${8 / k} ${6 / k}`} />
      })}
      <circle cx={c.x} cy={c.y} r={R} fill="none" stroke={GOLD} strokeWidth={1.7 / k} opacity={0.92} />
      <circle cx={c.x} cy={c.y} r={r0} fill="none" stroke={GOLD} strokeWidth={1 / k} opacity={0.55} />
      {compass.degreeRing && <DegreeTicks c={c} R={R * 1.055} north={north} numbers={false} k={k} />}
      {compass.labels && GATES32.map((g, i) => {
        const mid = north + GATE_START_DEG + (i + 0.5) * 11.25
        const nameSize = Math.min(R * 0.033, (R * 0.175) / (g.devta.length * 0.58))
        return (
          <Fragment key={g.code}>
            <RingLabel c={c} deg={mid} r={R * 0.935} size={nameSize} text={g.devta}
              fill="#EFE7D2" weight={600} halo={R * 0.01} />
            <RingLabel c={c} deg={mid} r={R * 0.845} size={R * 0.027} text={g.code}
              fill="#B8A26B" weight={700} spacing={R * 0.002} />
          </Fragment>
        )
      })}
      {compass.labels && ['N', 'E', 'S', 'W'].map((t, i) => (
        <RingLabel key={t} c={c} deg={north + i * 90} r={R * 1.07} size={R * 0.055}
          text={t} weight={800} fill={i === 0 ? '#F26B57' : '#F5EBD3'} halo={R * 0.012} />
      ))}
    </g>
  )
}

function Chakra8({ c, R, north, compass, k }: ChakraProps) {
  return (
    <g>
      {DIRS8.map((_, i) => {
        const a0 = north - 22.5 + i * 45
        return i % 2 === 1 ? (
          <path key={i} d={wedgePath(c, R, a0, a0 + 45)} fill="#FFFFFF" fillOpacity={0.035} />
        ) : null
      })}
      {DIRS8.map((_, i) => {
        const a = north - 22.5 + i * 45
        const p = polar(c, a, R)
        return <line key={i} x1={c.x} y1={c.y} x2={p.x} y2={p.y}
          stroke="#EFE3C0" strokeWidth={0.9 / k} opacity={0.5} />
      })}
      {DIRS8.map((_, i) => {
        const p = polar(c, north + i * 45, R * 0.985)
        return <line key={`ax${i}`} x1={c.x} y1={c.y} x2={p.x} y2={p.y}
          stroke={GOLD} strokeWidth={i % 2 === 0 ? 1.3 / k : 0.9 / k} opacity={i % 2 === 0 ? 0.75 : 0.55} />
      })}
      <circle cx={c.x} cy={c.y} r={R} fill="none" stroke={GOLD} strokeWidth={1.6 / k} opacity={0.9} />
      <circle cx={c.x} cy={c.y} r={R * 0.62} fill="none" stroke={GOLD} strokeWidth={0.8 / k} opacity={0.4} />
      {compass.degreeRing && <DegreeTicks c={c} R={R} north={north} numbers={R * k > 260} k={k} />}
      {compass.labels && DIRS8.map((d8, i) => (
        <Fragment key={d8.key}>
          <RingLabel c={c} deg={north + i * 45} r={R * 1.08}
            size={i % 2 === 0 ? R * 0.068 : R * 0.05} text={d8.key} weight={800}
            fill={i === 0 ? '#F26B57' : '#F5EBD3'} halo={R * 0.013} />
          <RingLabel c={c} deg={north + i * 45} r={R * 0.75} size={R * 0.036}
            text={d8.sanskrit} fill="#E4D9BC" weight={600} halo={R * 0.009} />
          <RingLabel c={c} deg={north + i * 45} r={R * 0.68} size={R * 0.03}
            text={d8.deity} fill="#A9B0BF" weight={500} halo={R * 0.008} />
        </Fragment>
      ))}
    </g>
  )
}

function Grid9({ c, north, compass, k, pts, closed }: ChakraProps) {
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
          fill="#FFFFFF" fillOpacity={0.028} />)
      }
      if (name && compass.devtas) {
        const size = Math.min(Math.min(cw, ch) * 0.24, (cw * 0.9) / (name.length * 0.56))
        cells.push(
          <text key={`n${row}-${col}`} x={x + cw / 2} y={y + ch / 2}
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
    return (
      <text x={minX + colC * cw} y={minY + rowC * ch} fontSize={size} fontFamily={FONT}
        fontWeight={big ? 700 : 600} fill={big ? GOLD : '#C9BE9D'}
        textAnchor="middle" dominantBaseline="central" opacity={big ? 0.95 : 0.8}
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

  return (
    <g transform={`rotate(${north} ${c.x} ${c.y})`}>
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
      {compass.labels && (
        <text x={(minX + maxX) / 2} y={minY - ch * 0.35} fontSize={Math.min(cw, ch) * 0.42}
          fontFamily={FONT} fontWeight={800} fill="#F26B57" textAnchor="middle"
          dominantBaseline="central" {...haloProps(Math.min(cw, ch) * 0.09)}>
          N
        </text>
      )}
    </g>
  )
}

function Dial({ c, R, north, compass, k }: ChakraProps) {
  const ticks = []
  for (let d = 0; d < 360; d += 2) {
    const major = d % 30 === 0
    const med = d % 10 === 0
    const len = major ? R * 0.055 : med ? R * 0.038 : R * 0.02
    const a = north + d
    const p0 = polar(c, a, R - len)
    const p1 = polar(c, a, R)
    ticks.push(<line key={d} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
      stroke="#EDE2C2" strokeWidth={(major ? 1.5 : 0.7) / k} opacity={major ? 0.9 : 0.5} />)
  }
  const nTip = polar(c, north, R * 0.995)
  const nL = polar(c, north + 4, R * 0.9)
  const nR = polar(c, north - 4, R * 0.9)
  return (
    <g>
      <circle cx={c.x} cy={c.y} r={R} fill="none" stroke={GOLD} strokeWidth={1.8 / k} opacity={0.95} />
      <circle cx={c.x} cy={c.y} r={R * 0.82} fill="none" stroke={GOLD} strokeWidth={0.7 / k} opacity={0.4} />
      {ticks}
      <path d={`M${nTip.x} ${nTip.y} L${nL.x} ${nL.y} L${nR.x} ${nR.y} Z`} fill="#F26B57" />
      {compass.labels && Array.from({ length: 12 }, (_, i) => i * 30).map((d) => (
        <RingLabel key={d} c={c} deg={north + d} r={R * 1.07} size={R * 0.045}
          text={String(d)} fill="#DFE3EC" weight={600} halo={R * 0.01} />
      ))}
      {compass.labels && DIRS8.map((d8, i) => (
        <RingLabel key={d8.key} c={c} deg={north + i * 45} r={R * 0.73}
          size={i % 2 === 0 ? R * 0.085 : R * 0.05} text={d8.key} weight={800}
          fill={i === 0 ? '#F26B57' : '#EFE4C8'} halo={R * 0.014} />
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
/* Center marker                                                       */
/* ------------------------------------------------------------------ */

function CenterMarker(props: {
  c: Pt; R: number; k: number; brahmasthan: boolean; closed: boolean
  areaText: string | null; overridden: boolean
}) {
  const { c, R, k, brahmasthan, closed, areaText, overridden } = props
  return (
    <g>
      {closed && brahmasthan && R > 0 && (
        <g>
          <circle cx={c.x} cy={c.y} r={R * 0.24} fill={GOLD} fillOpacity={0.06}
            stroke={GOLD} strokeWidth={1.1 / k} strokeDasharray={`${7 / k} ${6 / k}`} opacity={0.9} />
          <text x={c.x} y={c.y - R * 0.24 - 9 / k} fontSize={10.5 / k} fontFamily={FONT}
            fontWeight={600} fill="#D8C989" textAnchor="middle" opacity={0.9}
            {...haloProps(2.8 / k)}>
            Brahmasthan
          </text>
        </g>
      )}
      <line x1={c.x - 15 / k} y1={c.y} x2={c.x + 15 / k} y2={c.y}
        stroke="#F5EBD3" strokeWidth={1.2 / k} opacity={0.9} />
      <line x1={c.x} y1={c.y - 15 / k} x2={c.x} y2={c.y + 15 / k}
        stroke="#F5EBD3" strokeWidth={1.2 / k} opacity={0.9} />
      <circle cx={c.x} cy={c.y} r={4.2 / k} fill={overridden ? '#F2A65A' : GOLD}
        stroke="#FFFDF4" strokeWidth={1.4 / k} />
      {overridden && (
        <text x={c.x} y={c.y + 16 / k} fontSize={9.5 / k} fontFamily={FONT} fontWeight={700}
          fill="#F2A65A" textAnchor="middle" {...haloProps(2.6 / k)}>
          centre pinned
        </text>
      )}
      {areaText && (
        <text x={c.x} y={c.y + 30 / k} fontSize={12.5 / k} fontFamily={FONT} fontWeight={700}
          fill="#F3E9CF" textAnchor="middle" {...haloProps(3.4 / k)}>
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

  const RS = R * (compass.scalePct / 100)
  const showCompass = compass.id !== 'none' && closed && center && RS > 0

  const sampled = useMemo(() => sampledPolygon(pts, bulges, closed), [pts, bulges, closed])

  const areaText = useMemo(() => {
    if (!closed || pts.length < 3 || !metersPerPx) return null
    return formatArea(polygonArea(sampled) * metersPerPx * metersPerPx, unit)
  }, [sampled, pts.length, closed, metersPerPx, unit])

  const chakraProps: ChakraProps | null = showCompass && center
    ? { c: center, R: RS, north: northDeg, compass, k, pts: sampled, closed, idPrefix }
    : null

  return (
    <g>
      <defs>
        {pts.length >= 3 && (
          <clipPath id={`${idPrefix}-plotclip`}>
            <path d={outlinePathD(pts, bulges, true)} />
          </clipPath>
        )}
      </defs>
      <Background bg={bg} dxf={dxf} k={k} />
      <g opacity={compass.opacity}>
        {chakraProps && compass.id === 'custom' && <CustomOverlay {...chakraProps} />}
        {chakraProps && compass.id === 'zones16' && <Zones16 {...chakraProps} />}
        {chakraProps && compass.id === 'gates32' && <Gates32 {...chakraProps} />}
        {chakraProps && compass.id === 'chakra8' && <Chakra8 {...chakraProps} />}
        {chakraProps && compass.id === 'grid9' && <Grid9 {...chakraProps} />}
        {chakraProps && compass.id === 'dial' && <Dial {...chakraProps} />}
      </g>
      <Outline pts={pts} bulges={bulges} closed={closed} k={k} metersPerPx={metersPerPx} unit={unit}
        showEdgeLabels={showEdgeLabels} center={center} />
      {center && pts.length >= 3 && (
        <CenterMarker c={center} R={RS} k={k} brahmasthan={compass.brahmasthan && compass.id !== 'none'}
          closed={closed} areaText={areaText} overridden={props.centerOverridden ?? false} />
      )}
    </g>
  )
}
