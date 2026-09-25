import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Scene } from '../src/canvas/Scene'
import { centroid, circumradius, sampledPolygon } from '../src/geometry'
import { drawPaths, reducedMotion } from './motion'
import { BG, CALLOUTS, COMPASS, DXF, MARKERS, NORTH_DEG, OUTLINE, ROOMS } from './sample'

/* The stage: the studio's own Scene renderer — the SVG the app draws and exports — showing
 * the sample residence in whatever state the story asks for. Nothing here is an illustration
 * of the product; it is the product's drawing, controlled from outside. */

export type Overlay = 'none' | 'zones16' | 'gates32' | 'grid9'
export interface StageState {
  corners: number            // 0–6 corners placed
  closed: boolean
  overlay: Overlay
  rooms: boolean
  callouts: 'none' | 'door' | 'all'
}

export const FINAL_STATE: StageState = { corners: 6, closed: true, overlay: 'zones16', rooms: true, callouts: 'all' }

const sampled = sampledPolygon(OUTLINE, OUTLINE.map(() => 0), true)
const CENTER = centroid(sampled)
const R = circumradius(CENTER, sampled) * 1.03
// the view: the wheel, its rim labels, and the callouts beyond them, with a little air
const REACH = R * 1.27
export const BOX = {
  x: Math.min(0, CENTER.x - REACH), y: Math.min(0, CENTER.y - REACH),
  w: Math.max(DXF.w, CENTER.x + REACH) - Math.min(0, CENTER.x - REACH),
  h: Math.max(DXF.h, CENTER.y + REACH) - Math.min(0, CENTER.y - REACH),
}

export function PlanStage({ state, paper, drawIn = false, className = '' }: { state: StageState; paper: boolean; drawIn?: boolean; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [k, setK] = useState(0.3)
  const [drawn, setDrawn] = useState(!drawIn || reducedMotion)

  // stroke widths and type in the Scene are set in screen pixels through `k` — measure the box
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setK(Math.max(0.05, e.contentRect.width / BOX.w)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // the opening act: the imported drawing plots itself, wall by wall
  useEffect(() => {
    if (!drawIn || reducedMotion || !svgRef.current) return
    const paths = Array.from(svgRef.current.querySelectorAll<SVGPathElement>('path'))
    const texts = Array.from(svgRef.current.querySelectorAll<SVGTextElement>('text'))
    return drawPaths(paths, texts, () => setDrawn(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pts = state.closed ? OUTLINE : OUTLINE.slice(0, state.corners)
  const compass = useMemo(() => ({ ...COMPASS, id: state.overlay, labels: state.overlay !== 'grid9' }), [state.overlay])
  const callouts = state.callouts === 'all' ? CALLOUTS : state.callouts === 'door' ? CALLOUTS.filter((c) => c.id === 'm1') : []

  return (
    <div ref={wrap} className={`stage ${paper ? 'paper' : 'ink'} ${drawn ? 'drawn' : 'drawing'} ${className}`} style={{ aspectRatio: `${BOX.w} / ${BOX.h}` }}>
      <p className="sr-only">The sample residence with the sixteen-zone wheel over it. {CALLOUTS.map((c) => `${c.label}: ${c.verdict}, ${c.where}`).join('. ')}.</p>
      <svg ref={svgRef} viewBox={`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`} width="100%" height="100%" className="stage-svg" aria-hidden="true">
        <Scene
          bg={BG} dxf={DXF} pts={pts} bulges={pts.map(() => 0)} closed={state.closed} center={state.closed ? CENTER : null} R={R}
          northDeg={NORTH_DEG} compass={compass} metersPerPx={DXF.metersPerPx} unit="ft" k={k}
          showEdgeLabels={state.closed} markers={state.rooms ? MARKERS : []} roomShapes={state.rooms ? ROOMS : []}
          paper={paper} idPrefix="stage"
        />
        {/* the corner just placed, the way the studio marks it while tracing */}
        {!state.closed && pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={7 / k} fill={paper ? '#FFFDF8' : '#14161d'} stroke={paper ? '#A9782E' : '#D9B45B'} strokeWidth={2.2 / k} className="stage-corner" />
        ))}
        {callouts.length > 0 && (
          <g className="stage-leaders">
            {callouts.map((c, i) => (
              <g key={c.id} style={{ animationDelay: `${i * 110}ms` }} className="stage-leader">
                <line x1={c.at.x} y1={c.at.y} x2={c.to.x} y2={c.to.y} stroke={paper ? '#A9782E' : '#D9B45B'} strokeWidth={1.3 / k} pathLength={1} />
                <circle cx={c.to.x} cy={c.to.y} r={4.5 / k} fill={paper ? '#A9782E' : '#D9B45B'} />
              </g>
            ))}
          </g>
        )}
      </svg>
      {callouts.length > 0 && (
        <div className="stage-chips" aria-hidden="true">
          {callouts.map((c, i) => (
            <span key={c.id} className={`hchip v-${c.verdict}`}
              style={{ left: `${((c.at.x - BOX.x) / BOX.w) * 100}%`, top: `${((c.at.y - BOX.y) / BOX.h) * 100}%`, animationDelay: `${i * 110 + 200}ms` }}>
              <b>{c.label}</b><i>{c.verdict}</i><small>{c.where}</small>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
