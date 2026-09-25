import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Scene } from '../src/canvas/Scene'
import { centroid, circumradius, sampledPolygon } from '../src/geometry'
import { reducedMotion } from './motion'
import { BG, CALLOUTS, COMPASS, DXF, MARKERS, NORTH_DEG, OUTLINE, ROOMS } from './sample'

/* The hero is the product doing its job, in order: the imported drawing sits there, the
 * corners land one by one as a practitioner taps them, the outline closes, the sixteen-zone
 * wheel settles over it, the rooms appear, and each gets its verdict. It's the app's own
 * Scene renderer — the same SVG the studio draws and exports — not an illustration of it.
 *
 * Steps: 0 = drawing only · 1–6 = corners · 7 = closed · 8 = wheel · 9 = rooms · 10 = verdicts */
const FINAL = 10
const CORNER_MS = 150

export function HeroPlan({ compact = false }: { compact?: boolean }) {
  const [step, setStep] = useState(reducedMotion ? FINAL : 0)
  const wrap = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(0.3)

  useEffect(() => {
    if (reducedMotion) return
    const timers: number[] = []
    const at = (ms: number, s: number) => timers.push(window.setTimeout(() => setStep(s), ms))
    let t = 700
    for (let i = 1; i <= 6; i++) { at(t, i); t += CORNER_MS }
    at(t + 120, 7); at(t + 520, 8); at(t + 1150, 9); at(t + 1650, 10)
    return () => timers.forEach(clearTimeout)
  }, [])

  const pts = step >= 7 ? OUTLINE : OUTLINE.slice(0, step)
  const closed = step >= 7
  const sampled = useMemo(() => sampledPolygon(OUTLINE, OUTLINE.map(() => 0), true), [])
  const center = useMemo(() => centroid(sampled), [sampled])
  const R = useMemo(() => circumradius(center, sampled) * 1.03, [center, sampled])

  // the view: the whole instrument — wheel, degree ring and its labels — with a little air
  const box = useMemo(() => {
    const reach = R * 1.27 // the wheel, its rim labels, and the callouts beyond them
    const minX = Math.min(0, center.x - reach), minY = Math.min(0, center.y - reach)
    const maxX = Math.max(DXF.w, center.x + reach), maxY = Math.max(DXF.h, center.y + reach)
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }, [center, R])

  // stroke widths and type in the Scene are set in screen pixels through `k` — measure the box
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setK(Math.max(0.05, e.contentRect.width / box.w)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [box.w])

  const compass = step >= 8 ? COMPASS : { ...COMPASS, id: 'none' as const }

  return (
    <div ref={wrap} className={`hero-plan ${compact ? 'compact' : ''}`} style={{ aspectRatio: `${box.w} / ${box.h}` }}>
      <p className="sr-only">The sample residence with the sixteen-zone wheel over it. {CALLOUTS.map((c) => `${c.label}: ${c.verdict}, ${c.where}`).join('. ')}.</p>
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} width="100%" height="100%" className="hero-plan-svg" aria-hidden="true">
        <Scene
          bg={BG} dxf={DXF} pts={pts} bulges={pts.map(() => 0)} closed={closed} center={closed ? center : null} R={R}
          northDeg={NORTH_DEG} compass={compass} metersPerPx={DXF.metersPerPx} unit="ft" k={k}
          showEdgeLabels={closed} markers={step >= 9 ? MARKERS : []} roomShapes={step >= 9 ? ROOMS : []}
          paper idPrefix="site"
        />
        {/* the corner just placed, the way the studio marks it while tracing */}
        {!closed && pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={7 / k} fill="#FFFDF8" stroke="#A9782E" strokeWidth={2.2 / k} className="hero-corner" />
        ))}
        {/* leaders from each callout to its room — drawn, then the chip lands */}
        {step >= 10 && (
          <g className="hero-leaders">
            {CALLOUTS.map((c, i) => (
              <g key={c.id} style={{ animationDelay: `${i * 110}ms` }} className="hero-leader">
                <line x1={c.at.x} y1={c.at.y} x2={c.to.x} y2={c.to.y} stroke="#A9782E" strokeWidth={1.3 / k} pathLength={1} />
                <circle cx={c.to.x} cy={c.to.y} r={4.5 / k} fill="#A9782E" />
              </g>
            ))}
          </g>
        )}
      </svg>
      {step >= 10 && (
        <div className="hero-chips" aria-hidden="true">
          {CALLOUTS.map((c, i) => (
            <span key={c.id} className={`hchip v-${c.verdict}`}
              style={{ left: `${((c.at.x - box.x) / box.w) * 100}%`, top: `${((c.at.y - box.y) / box.h) * 100}%`, animationDelay: `${i * 110 + 200}ms` }}>
              <b>{c.label}</b><i>{c.verdict}</i><small>{c.where}</small>
            </span>
          ))}
        </div>
      )}
      {/* on a phone the drawing has no margin to spare: the same verdicts, as a row beneath it */}
      <ul className="hero-list" aria-hidden="true">
        {CALLOUTS.map((c) => (
          <li key={c.id} className={`hchip v-${c.verdict}`}><b>{c.label}</b><i>{c.verdict}</i></li>
        ))}
      </ul>
    </div>
  )
}

/** A still of the same drawing with one overlay — the "read" chapter's triptych. */
export function PlanStill({ overlay }: { overlay: 'zones16' | 'gates32' | 'grid9' }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(0.2)
  const sampled = useMemo(() => sampledPolygon(OUTLINE, OUTLINE.map(() => 0), true), [])
  const center = useMemo(() => centroid(sampled), [sampled])
  const R = useMemo(() => circumradius(center, sampled) * 1.03, [center, sampled])
  const reach = R * 1.18
  const box = { x: center.x - reach, y: center.y - reach, w: reach * 2, h: reach * 2 }
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setK(Math.max(0.05, e.contentRect.width / box.w)))
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div ref={wrap} className="plan-still" aria-hidden="true">
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} width="100%" height="100%">
        <Scene
          bg={BG} dxf={DXF} pts={OUTLINE} bulges={OUTLINE.map(() => 0)} closed center={center} R={R}
          northDeg={NORTH_DEG} compass={{ ...COMPASS, id: overlay, labels: overlay !== 'grid9' }} metersPerPx={DXF.metersPerPx} unit="ft" k={k}
          showEdgeLabels={false} markers={overlay === 'gates32' ? MARKERS.slice(0, 1) : []} roomShapes={overlay === 'zones16' ? ROOMS : []}
          paper idPrefix={`still-${overlay}`}
        />
      </svg>
    </div>
  )
}
