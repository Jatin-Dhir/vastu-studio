import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Scene } from '../src/canvas/Scene'
import { centroid, circumradius, sampledPolygon } from '../src/geometry'
import type { BgState, CompassId, CompassState, Pt } from '../src/types'
import { BG, CALLOUTS, COMPASS, DXF, MARKERS, NORTH_DEG, OUTLINE, ROOMS } from './sample'

/* The instrument and its parts, drawn by the studio's own renderer (the same Scene the app draws
 * and exports) and set in a brass bezel, the way a watch house photographs a dial. Nothing here
 * is an illustration of the product; every line is the product's own drawing. */

const sampled = sampledPolygon(OUTLINE, OUTLINE.map(() => 0), true)
const CENTER = centroid(sampled)
const R = circumradius(CENTER, sampled) * 1.03
const NO_BG: BgState = { kind: 'none', w: 0, h: 0, opacity: 1, grayscale: false, invert: false }
/** The drawing without its own grey room names: the studio's room tags already name each room,
 *  and the two sets of names stacked up on the page. */
const PLAN = { ...DXF, texts: [] }

/** Screen pixels per world unit: the Scene draws strokes and type in screen px through `k`. */
function useScale(worldW: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(0.35)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setK(Math.max(0.05, e.contentRect.width / worldW)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [worldW])
  return [ref, k]
}

/** The case: a brass ring between r0 and r1 with degree ticks engraved every 5°, the cardinal
 *  ticks longest. Fixed to the page, like a compass bezel; the chakra turns inside it. */
function Bezel({ c, r0, r1, id }: { c: Pt; r0: number; r1: number; id: string }) {
  const w = r1 - r0
  const ticks: ReactNode[] = []
  for (let d = 0; d < 360; d += 5) {
    const long = d % 90 === 0, mid = d % 45 === 0
    const a = ((d - 90) * Math.PI) / 180
    const t0 = r0 + w * 0.2, t1 = r0 + w * (long ? 0.72 : mid ? 0.56 : 0.4)
    ticks.push(<line key={d} x1={c.x + t0 * Math.cos(a)} y1={c.y + t0 * Math.sin(a)} x2={c.x + t1 * Math.cos(a)} y2={c.y + t1 * Math.sin(a)}
      stroke="rgba(52,36,8,0.55)" strokeWidth={w * (long ? 0.05 : 0.03)} strokeLinecap="round" />)
  }
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-brass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3DEA2" />
          <stop offset="0.18" stopColor="#B88E3E" />
          <stop offset="0.42" stopColor="#E9CF8C" />
          <stop offset="0.58" stopColor="#9C7530" />
          <stop offset="0.8" stopColor="#E4C67E" />
          <stop offset="1" stopColor="#8A6526" />
        </linearGradient>
      </defs>
      <path d={ring(c, r0, r1)} fill={`url(#${id}-brass)`} fillRule="evenodd" />
      <circle cx={c.x} cy={c.y} r={r1 - w * 0.06} fill="none" stroke="rgba(255,246,220,0.55)" strokeWidth={w * 0.03} />
      <circle cx={c.x} cy={c.y} r={r0} fill="none" stroke="rgba(40,26,4,0.55)" strokeWidth={w * 0.05} />
      <circle cx={c.x} cy={c.y} r={r1} fill="none" stroke="rgba(40,26,4,0.4)" strokeWidth={w * 0.025} />
      {ticks}
    </g>
  )
}

const ring = (c: Pt, r0: number, r1: number) =>
  `M${c.x + r1} ${c.y}A${r1} ${r1} 0 1 0 ${c.x - r1} ${c.y}A${r1} ${r1} 0 1 0 ${c.x + r1} ${c.y}Z` +
  `M${c.x + r0} ${c.y}A${r0} ${r0} 0 1 1 ${c.x - r0} ${c.y}A${r0} ${r0} 0 1 1 ${c.x + r0} ${c.y}Z`

/** The whole instrument: the sample residence seen through the dial, the sixteen zones turned to
 *  `north`, rooms and doors marked, inside the bezel. `paper` false is the Ink (night) view. */
export function Instrument({ north, paper }: { north: number; paper: boolean }) {
  const r0 = R * 1.16, r1 = R * 1.27, pad = R * 0.03
  const box = { x: CENTER.x - r1 - pad, y: CENTER.y - r1 - pad, w: 2 * (r1 + pad), h: 2 * (r1 + pad) }
  const [ref, k] = useScale(box.w)
  return (
    <div ref={ref} className={`dial ${paper ? 'paper' : 'ink'}`}>
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} width="100%" height="100%" role="img"
        aria-label={`Vastu Studio's sixteen-zone chakra over a sample residence, north at ${Math.round(north)} degrees, with its rooms and main door marked.`}>
        <defs>
          <radialGradient id="hero-face" cx="0.42" cy="0.36" r="0.75">
            <stop offset="0" stopColor={paper ? '#FFFFFF' : '#1A1D25'} />
            <stop offset="1" stopColor={paper ? '#F3F1EB' : '#0C0E13'} />
          </radialGradient>
          {/* a clip, not a mask: a mask makes software-rendered Chrome (and every headless shot)
              resample the whole plan soft */}
          <clipPath id="hero-window"><circle cx={CENTER.x} cy={CENTER.y} r={r0} /></clipPath>
        </defs>
        <circle cx={CENTER.x} cy={CENTER.y} r={r0} fill="url(#hero-face)" />
        <g clipPath="url(#hero-window)">
          <Scene bg={BG} dxf={PLAN} pts={OUTLINE} bulges={OUTLINE.map(() => 0)} closed center={CENTER} R={R}
            northDeg={north} compass={COMPASS} metersPerPx={DXF.metersPerPx} unit="ft" k={k}
            showEdgeLabels markers={MARKERS} roomShapes={ROOMS} paper={paper} idPrefix="hero" />
        </g>
        <Bezel c={CENTER} r0={r0} r1={r1} id="hero" />
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ the parts, one at a time */

const PART_R = 1000
const CIRCLE: Pt[] = Array.from({ length: 96 }, (_, i) => {
  const a = (i / 96) * Math.PI * 2
  return { x: PART_R * Math.cos(a), y: PART_R * Math.sin(a) }
})
const ORIGIN = { x: 0, y: 0 }
/** The mandala turns with north, so its square needs this much more room than it has sides. */
const TILT = Math.abs(Math.cos((NORTH_DEG * Math.PI) / 180)) + Math.abs(Math.sin((NORTH_DEG * Math.PI) / 180))

/** One part of the instrument on its own: the sixteen-zone ring, the thirty-two gates, or the
 *  nine-by-nine mandala. The zone ring lights the zone under the pointer (`onZone`). */
export function Part({ id, highlight = null, onZone, label }: {
  id: Extract<CompassId, 'zones16' | 'gates32' | 'grid9'>
  highlight?: number | null
  onZone?: (zone: number | null) => void
  label: string
}) {
  const square = id === 'grid9'
  const r0 = PART_R * 1.16, r1 = PART_R * 1.27
  const half = square ? PART_R * (1.02 * TILT + 0.04) : r1 * 1.02
  const box = { x: -half, y: -half, w: half * 2, h: half * 2 }
  const [ref, k] = useScale(box.w)
  const compass: CompassState = {
    ...COMPASS, id, scalePct: 100, opacity: 1, fillPct: id === 'zones16' ? 34 : 18, clip: true,
    labels: true, degreeRing: true, brahmasthan: id === 'grid9', devtas: true,
  }
  const svg = useRef<SVGSVGElement>(null)
  // without a pointer, the arrow keys walk the ring a zone at a time
  const step = (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d || !onZone) return
    e.preventDefault()
    onZone(((highlight ?? 2) + d + 16) % 16)
  }
  // the zone under a pointer: its bearing from the centre, against the chakra's own north
  const pick = (e: React.PointerEvent) => {
    if (!onZone || !svg.current) return
    const r = svg.current.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * box.w + box.x
    const y = ((e.clientY - r.top) / r.height) * box.h + box.y
    const dist = Math.hypot(x, y)
    if (dist > r0) { onZone(null); return }
    const bearing = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360
    onZone(Math.round(((bearing - NORTH_DEG + 360) % 360) / 22.5) % 16)
  }
  return (
    <div ref={ref} className={`part part-${id}`}>
      <svg ref={svg} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} width="100%" height="100%" role="img" aria-label={label}
        tabIndex={onZone ? 0 : undefined} onKeyDown={onZone ? step : undefined}
        onPointerMove={onZone ? pick : undefined} onPointerDown={onZone ? pick : undefined}
        onPointerLeave={onZone ? () => onZone(null) : undefined}>
        {!square && <circle cx={0} cy={0} r={r0} fill="#FBFAF6" />}
        {square && <rect x={-PART_R * 1.02} y={-PART_R * 1.02} width={PART_R * 2.04} height={PART_R * 2.04} fill="#FBFAF6" transform={`rotate(${NORTH_DEG})`} />}
        <Scene bg={NO_BG} dxf={null} pts={CIRCLE} bulges={CIRCLE.map(() => 0)} closed center={ORIGIN} R={PART_R}
          northDeg={NORTH_DEG} compass={compass} metersPerPx={null} unit="ft" k={k} showEdgeLabels={false}
          wallOpacity={0} highlightZone={highlight} paper idPrefix={`part-${id}`} />
        {!square && <Bezel c={ORIGIN} r0={r0} r1={r1} id={`part-${id}`} />}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ the plan and its verdicts */

const REACH = R * 1.3
const PLAN_BOX = {
  x: Math.min(0, CENTER.x - REACH), y: Math.min(0, CENTER.y - REACH),
  w: Math.max(DXF.w, CENTER.x + REACH) - Math.min(0, CENTER.x - REACH),
  h: Math.max(DXF.h, CENTER.y + REACH) - Math.min(0, CENTER.y - REACH),
}

/** The sample residence as the studio reads it: rooms, the main door, the zones, and the four
 *  verdicts the studio gave, each pinned to its room. */
export function PlanReading() {
  const [ref, k] = useScale(PLAN_BOX.w)
  const compass: CompassState = { ...COMPASS, fillPct: 22 }
  return (
    <div ref={ref} className="reading" style={{ aspectRatio: `${PLAN_BOX.w} / ${PLAN_BOX.h}` }}>
      <svg viewBox={`${PLAN_BOX.x} ${PLAN_BOX.y} ${PLAN_BOX.w} ${PLAN_BOX.h}`} width="100%" height="100%" role="img"
        aria-label={`The sample residence read by the studio. ${CALLOUTS.map((c) => `${c.label}: ${c.verdict}, ${c.where}`).join('. ')}.`}>
        <Scene bg={BG} dxf={PLAN} pts={OUTLINE} bulges={OUTLINE.map(() => 0)} closed center={CENTER} R={R}
          northDeg={NORTH_DEG} compass={compass} metersPerPx={DXF.metersPerPx} unit="ft" k={k}
          showEdgeLabels markers={MARKERS} roomShapes={ROOMS} paper idPrefix="reading" />
        {CALLOUTS.map((c) => (
          <g key={c.id} className="reading-leader">
            <line x1={c.at.x} y1={c.at.y} x2={c.to.x} y2={c.to.y} stroke="#1B1B1D" strokeWidth={1.1 / k} />
            <circle cx={c.to.x} cy={c.to.y} r={4 / k} fill="#1B1B1D" />
          </g>
        ))}
      </svg>
      <div className="reading-tags" aria-hidden="true">
        {CALLOUTS.map((c) => (
          <span key={c.id} className={`vtag v-${c.verdict}`}
            style={{ left: `${((c.at.x - PLAN_BOX.x) / PLAN_BOX.w) * 100}%`, top: `${((c.at.y - PLAN_BOX.y) / PLAN_BOX.h) * 100}%` }}>
            <b>{c.label}</b><i>{c.verdict}</i><small>{c.where}</small>
          </span>
        ))}
      </div>
    </div>
  )
}
