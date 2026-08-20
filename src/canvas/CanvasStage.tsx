import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Scene, FONT, GOLD } from './Scene'
import { importDxf, type DxfImport } from '../importers/dxf'
import { angleOf, boundsOf, bulgeFromMid, centroid, circumradius, dist, distToSegment, edgePoint, polar, sampledPolygon } from '../geometry'
import { formatLen } from '../format'
import type { Pt } from '../types'

const COARSE = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const CLOSE_PX = COARSE ? 20 : 13
const HIT_PX = COARSE ? 18 : 12
const pushHistory = () =>
  useStore.setState((s) => ({
    undoStack: [...s.undoStack, { pts: s.pts, closed: s.closed, bulges: s.bulges }].slice(-100),
    redoStack: [],
  }))

/** One hint per session when geometry edits happen while the centre is pinned. */
let warnedPinnedCenter = false

function snapPoint(prev: Pt, p: Pt): Pt {
  const dx = p.x - prev.x, dy = p.y - prev.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return p
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI
  const snapped = Math.round(ang / 15) * 15
  const diff = Math.abs(((ang - snapped + 180) % 360) - 180)
  if (diff > 4) return p
  const r = (snapped * Math.PI) / 180
  return { x: prev.x + len * Math.cos(r), y: prev.y + len * Math.sin(r) }
}

interface DragState {
  mode: 'idle' | 'maybe-pan' | 'pan' | 'vertex' | 'center' | 'calA' | 'calB' | 'calLine' | 'bulge'
  idx: number
  startX: number
  startY: number
  moved: boolean
  pushed: boolean
  grabbed: Pt | null
}

/** What the magnifier loupe is following, if anything. */
interface LoupeState { mode: 'vertex' | 'center' | 'calA' | 'calB' | 'bulge'; idx: number }

export function CanvasStage() {
  const svgRef = useRef<SVGSVGElement>(null)
  const bg = useStore((s) => s.bg)
  const pts = useStore((s) => s.pts)
  const bulges = useStore((s) => s.bulges)
  const closed = useStore((s) => s.closed)
  const centerOverride = useStore((s) => s.centerOverride)
  const northDeg = useStore((s) => s.northDeg)
  const compass = useStore((s) => s.compass)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const unit = useStore((s) => s.unit)
  const tool = useStore((s) => s.tool)
  const view = useStore((s) => s.view)
  const calA = useStore((s) => s.calA)
  const calB = useStore((s) => s.calB)
  const northA = useStore((s) => s.northA)
  const showEdgeLabels = useStore((s) => s.showEdgeLabels)
  const locked = useStore((s) => s.locked)
  const selectedVertex = useStore((s) => s.selectedVertex)
  const selectedEdge = useStore((s) => s.selectedEdge)

  const [cursor, setCursor] = useState<Pt | null>(null)
  const [loupe, setLoupe] = useState<LoupeState | null>(null)
  const drag = useRef<DragState>({ mode: 'idle', idx: -1, startX: 0, startY: 0, moved: false, pushed: false, grabbed: null })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastPinch = useRef<{ d: number; mx: number; my: number } | null>(null)

  const dxf = useMemo<DxfImport | null>(() => {
    if (bg.kind !== 'dxf' || !bg.dxfText) return null
    try { return importDxf(bg.dxfText) } catch { return null }
  }, [bg.kind, bg.dxfText])

  const sampled = useMemo(() => sampledPolygon(pts, bulges, closed), [pts, bulges, closed])

  const center = useMemo<Pt | null>(() => {
    if (centerOverride) return centerOverride
    if (pts.length >= 3) return centroid(sampled)
    return null
  }, [pts.length, sampled, centerOverride])

  const R = useMemo(() => (center && pts.length >= 3 ? circumradius(center, sampled) * 1.03 : 0), [center, pts.length, sampled])

  const toWorld = (clientX: number, clientY: number): Pt => {
    const rect = svgRef.current!.getBoundingClientRect()
    const { tx, ty, k } = useStore.getState().view
    return { x: (clientX - rect.left - tx) / k, y: (clientY - rect.top - ty) / k }
  }

  /* ---------- fit view ---------- */
  const fitView = () => {
    const svg = svgRef.current
    if (!svg) return
    const s = useStore.getState()
    let b: { minX: number; minY: number; maxX: number; maxY: number }
    if (s.bg.kind !== 'none' && s.bg.w > 0) b = { minX: 0, minY: 0, maxX: s.bg.w, maxY: s.bg.h }
    else if (s.pts.length > 0) b = boundsOf(s.pts)
    else return
    const rect = svg.getBoundingClientRect()
    const hasBg = s.bg.kind !== 'none'
    const mobile = rect.width <= 760
    const padL = mobile ? 18 : 88
    const padR = mobile ? 18 : hasBg ? 348 : 88
    const padT = mobile ? 60 : 76
    const padB = mobile ? 150 : 28
    const availW = Math.max(120, rect.width - padL - padR)
    const availH = Math.max(120, rect.height - padT - padB)
    const w = b.maxX - b.minX, h = b.maxY - b.minY
    const k = Math.min(availW / w, availH / h) * 0.95
    const tx = padL + (availW - w * k) / 2 - b.minX * k
    const ty = padT + (availH - h * k) / 2 - b.minY * k
    useStore.getState().setView({ tx, ty, k })
  }

  useEffect(() => {
    const onFit = () => fitView()
    window.addEventListener('vastu:fit', onFit)
    return () => window.removeEventListener('vastu:fit', onFit)
  }, [])

  useEffect(() => {
    if (bg.kind !== 'none') fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bg.kind, bg.w, bg.h])

  /* ---------- wheel zoom (native, non-passive) ---------- */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = useStore.getState()
      const { tx, ty, k } = s.view
      const rect = svg.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.006 : 0.0016))
      const nk = Math.min(60, Math.max(0.02, k * factor))
      s.setView({ tx: mx - ((mx - tx) * nk) / k, ty: my - ((my - ty) * nk) / k, k: nk })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  /* ---------- pointer handlers ---------- */
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current!
    try { svg.setPointerCapture(e.pointerId) } catch { /* synthetic or stale pointer */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      drag.current.mode = 'idle'
      lastPinch.current = null
      return
    }
    if (e.button === 2) return
    const target = (e.target as Element).closest('[data-vidx],[data-bidx],[data-role]')
    const vidx = target?.getAttribute('data-vidx')
    const bidx = target?.getAttribute('data-bidx')
    const role = target?.getAttribute('data-role')
    const d = drag.current
    d.startX = e.clientX; d.startY = e.clientY; d.moved = false; d.pushed = false
    d.grabbed = toWorld(e.clientX, e.clientY)
    if (vidx != null) { d.mode = 'vertex'; d.idx = Number(vidx) }
    else if (bidx != null) { d.mode = 'bulge'; d.idx = Number(bidx) }
    else if (role === 'center' || role === 'calA' || role === 'calB' || role === 'calLine') { d.mode = role }
    else if (e.button === 1) { d.mode = 'pan' }
    else { d.mode = 'maybe-pan' }
    if (e.pointerType !== 'mouse' &&
      (d.mode === 'vertex' || d.mode === 'center' || d.mode === 'calA' || d.mode === 'calB' || d.mode === 'bulge')) {
      setLoupe({ mode: d.mode, idx: d.idx })
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const s = useStore.getState()
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    // pinch
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()]
      const dpx = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const rect = svgRef.current!.getBoundingClientRect()
      const mx = (p1.x + p2.x) / 2 - rect.left
      const my = (p1.y + p2.y) / 2 - rect.top
      const lp = lastPinch.current
      if (lp) {
        const { tx, ty, k } = s.view
        const nk = Math.min(60, Math.max(0.02, (k * dpx) / lp.d))
        let ntx = mx - ((mx - tx) * nk) / k
        let nty = my - ((my - ty) * nk) / k
        ntx += mx - lp.mx; nty += my - lp.my
        s.setView({ tx: ntx, ty: nty, k: nk })
      }
      lastPinch.current = { d: dpx, mx, my }
      return
    }
    const d = drag.current
    const world = toWorld(e.clientX, e.clientY)
    setCursor(world)
    if (d.mode === 'idle') return
    const movedPx = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
    if (movedPx > 4) d.moved = true

    if (d.mode === 'maybe-pan' && d.moved) d.mode = 'pan'
    if (d.mode === 'pan') {
      const { tx, ty, k } = s.view
      s.setView({ tx: tx + e.movementX, ty: ty + e.movementY, k })
      return
    }
    if (d.mode === 'vertex' && d.moved) {
      if (!d.pushed) {
        pushHistory(); d.pushed = true
        if (s.centerOverride && !warnedPinnedCenter) {
          warnedPinnedCenter = true
          s.toast('Centre is pinned, so it won’t follow shape edits — reset it in the panel', 'warn')
        }
      }
      let p = world
      if (s.angleSnap && s.pts.length > 1) {
        const prev = s.pts[(d.idx - 1 + s.pts.length) % s.pts.length]
        if (prev && (d.idx > 0 || s.closed)) p = snapPoint(prev, p)
      }
      s.movePoint(d.idx, p)
      return
    }
    if (d.mode === 'center' && d.moved) {
      s.setCenterOverride(world)
      return
    }
    if ((d.mode === 'calA' || d.mode === 'calB') && d.moved) {
      if (d.mode === 'calA') s.setCal(world, s.calB)
      else s.setCal(s.calA, world)
      return
    }
    if (d.mode === 'calLine' && d.moved && d.grabbed && s.calA && s.calB) {
      const dx = world.x - d.grabbed.x, dy = world.y - d.grabbed.y
      d.grabbed = world
      s.setCal({ x: s.calA.x + dx, y: s.calA.y + dy }, { x: s.calB.x + dx, y: s.calB.y + dy })
      return
    }
    if (d.mode === 'bulge' && d.moved) {
      if (!d.pushed) {
        pushHistory(); d.pushed = true
        if (s.centerOverride && !warnedPinnedCenter) {
          warnedPinnedCenter = true
          s.toast('Centre is pinned, so it won’t follow shape edits — reset it in the panel', 'warn')
        }
      }
      const n = s.pts.length
      const p1 = s.pts[d.idx], p2 = s.pts[(d.idx + 1) % n]
      if (p1 && p2) {
        let b = bulgeFromMid(p1, p2, world)
        const chord = dist(p1, p2)
        // snap back to straight when the sagitta is a few screen px
        if (Math.abs((b * chord) / 2) < 5 / s.view.k) b = 0
        s.setBulge(d.idx, b)
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) lastPinch.current = null
    setLoupe(null)
    const d = drag.current
    const mode = d.mode
    const moved = d.moved
    d.mode = 'idle'
    if (e.button === 2 || moved) return
    if (pointers.current.size > 0) return

    const s = useStore.getState()
    const world = toWorld(e.clientX, e.clientY)
    const k = s.view.k

    if (mode === 'vertex') {
      if (s.tool === 'trace' && !s.closed && d.idx === 0 && s.pts.length >= 3) s.closePolygon()
      else if (s.tool === 'select' && !s.locked) s.setSelection({ vertex: d.idx, edge: null })
      return
    }
    if (mode === 'bulge') {
      if (s.tool === 'select' && !s.locked) s.setSelection({ edge: d.idx, vertex: null })
      return
    }
    // a tap only ever places/dispatches from a plain press on empty canvas —
    // never from handle presses or the tail end of a pinch (mode 'idle')
    if (mode !== 'maybe-pan') return
    if (s.tool === 'select') { s.setSelection({ vertex: null, edge: null }); return }
    if (s.locked) return

    switch (s.tool) {
      case 'trace': {
        if (s.closed) break
        if (s.pts.length >= 3 && dist(world, s.pts[0]) < CLOSE_PX / k) { s.closePolygon(); break }
        let p = world
        if (s.angleSnap && s.pts.length > 0) p = snapPoint(s.pts[s.pts.length - 1], p)
        s.addPoint(p)
        break
      }
      case 'calibrate': {
        if (!s.calA || (s.calA && s.calB)) s.setCal(world, null)
        else {
          s.setCal(s.calA, world)
          s.toast('Drag the pins to fine-tune, then tap “Enter length”', 'info')
        }
        break
      }
      case 'center': {
        s.setCenterOverride(world)
        s.toast('Centre pinned — drag it anytime, or reset in the panel', 'info')
        break
      }
      case 'north': {
        if (!s.northA) {
          s.setNorthA(world)
          s.toast('Now tap the TIP of the north arrow', 'info')
        } else if (dist(s.northA, world) > 3 / k) {
          const deg = Math.round(angleOf(s.northA, world) * 2) / 2
          s.setNorth(deg)
          s.setNorthA(null)
          s.setTool('select')
          s.toast(`North aligned to the plan — ${deg}°`, 'ok')
        } else {
          s.toast('Too close to the first tap — tap the arrow TIP further away', 'warn')
        }
        break
      }
      default:
        break
    }
  }

  const onDblClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const s = useStore.getState()
    if (s.tool !== 'select' || s.pts.length < 2) return
    const world = toWorld(e.clientX, e.clientY)
    const k = s.view.k
    const n = s.pts.length
    const count = s.closed ? n : n - 1
    let best = -1, bestD = 9 / k
    for (let i = 0; i < count; i++) {
      const dd = distToSegment(world, s.pts[i], s.pts[(i + 1) % n])
      if (dd < bestD) { bestD = dd; best = i }
    }
    if (best >= 0) s.insertPoint(best + 1, world)
  }

  const onContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    const s = useStore.getState()
    if (s.locked) return
    const target = (e.target as Element).closest('[data-vidx]')
    const vidx = target?.getAttribute('data-vidx')
    if (vidx != null) {
      s.deletePoint(Number(vidx))
      s.setSelection({ vertex: null, edge: null })
    }
  }

  /* ---------- render helpers ---------- */
  const { tx, ty, k } = view
  const tracing = tool === 'trace' && !closed
  const nearFirst = tracing && cursor && pts.length >= 3 && dist(cursor, pts[0]) < CLOSE_PX / k
  const showHandles = !locked && (tool === 'trace' || tool === 'select') && pts.length > 0
  const liveTo = tracing && cursor && pts.length > 0
    ? (useStore.getState().angleSnap ? snapPoint(pts[pts.length - 1], cursor) : cursor)
    : null

  return (
    <svg
      ref={svgRef}
      className={`stage tool-${tool}`} data-canvas
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDblClick}
      onContextMenu={onContextMenu}
    >
      <g id="world" transform={`translate(${tx} ${ty}) scale(${k})`}>
        <Scene
          bg={bg} dxf={dxf} pts={pts} bulges={bulges} closed={closed} center={center} R={R}
          centerOverridden={!!centerOverride}
          northDeg={northDeg} compass={compass} metersPerPx={metersPerPx} unit={unit}
          k={k} showEdgeLabels={showEdgeLabels} idPrefix="live"
        />

        {/* live trace segment */}
        {liveTo && (
          <g>
            <line x1={pts[pts.length - 1].x} y1={pts[pts.length - 1].y} x2={liveTo.x} y2={liveTo.y}
              stroke={GOLD} strokeWidth={1.8 / k} strokeDasharray={`${7 / k} ${5 / k}`} opacity={0.85} />
            {metersPerPx && (
              <text x={liveTo.x + 14 / k} y={liveTo.y - 12 / k} fontSize={11.5 / k}
                fontFamily={FONT} fontWeight={600} fill="#F3E9CF"
                stroke="rgba(9,10,14,0.78)" strokeWidth={3 / k} paintOrder="stroke">
                {formatLen(dist(pts[pts.length - 1], liveTo) * metersPerPx, unit)}
              </text>
            )}
          </g>
        )}

        {/* calibration line */}
        {tool === 'calibrate' && calA && (
          <g>
            {(() => {
              const b = calB ?? cursor
              if (!b) return null
              const mid = { x: (calA.x + b.x) / 2, y: (calA.y + b.y) / 2 }
              const L = dist(calA, b)
              const pinR = COARSE ? 8 : 5.5
              const hitR = COARSE ? 24 : 13
              const pins: [Pt, 'calA' | 'calB'][] = calB ? [[calA, 'calA'], [calB, 'calB']] : [[calA, 'calA']]
              return (
                <g>
                  {calB && (
                    <line data-role="calLine" x1={calA.x} y1={calA.y} x2={b.x} y2={b.y}
                      stroke="rgba(0,0,0,0)" strokeWidth={(COARSE ? 30 : 14) / k}
                      style={{ cursor: 'move' }} />
                  )}
                  <line x1={calA.x} y1={calA.y} x2={b.x} y2={b.y} stroke="#6FC7CE" pointerEvents="none"
                    strokeWidth={2.2 / k} strokeDasharray={calB ? undefined : `${8 / k} ${6 / k}`} />
                  {pins.map(([p, role]) => (
                    <g key={role} data-role={role} style={{ cursor: 'grab' }}>
                      <circle cx={p.x} cy={p.y} r={hitR / k} fill="rgba(0,0,0,0)" data-role={role} />
                      <circle cx={p.x} cy={p.y} r={pinR / k} fill="#0E1116" stroke="#6FC7CE" strokeWidth={2.2 / k} />
                      <circle cx={p.x} cy={p.y} r={2 / k} fill="#6FC7CE" />
                    </g>
                  ))}
                  {!calB && cursor && (
                    <circle cx={b.x} cy={b.y} r={4 / k} fill="none" stroke="#6FC7CE" strokeWidth={1.2 / k} opacity={0.7} />
                  )}
                  <text x={mid.x} y={mid.y - 14 / k} fontSize={12 / k} fontFamily={FONT} fontWeight={700}
                    fill="#BFEDF2" textAnchor="middle"
                    stroke="rgba(9,10,14,0.78)" strokeWidth={3 / k} paintOrder="stroke">
                    {metersPerPx ? formatLen(L * metersPerPx, unit) : `${L.toFixed(0)} px`}
                  </text>
                </g>
              )
            })()}
          </g>
        )}

        {/* north alignment arrow */}
        {tool === 'north' && northA && cursor && (
          (() => {
            const deg = angleOf(northA, cursor)
            const tip = cursor
            const lWing = polar(tip, deg + 155, 14 / k)
            const rWing = polar(tip, deg - 155, 14 / k)
            return (
              <g>
                <line x1={northA.x} y1={northA.y} x2={tip.x} y2={tip.y} stroke="#F26B57"
                  strokeWidth={2.4 / k} strokeDasharray={`${8 / k} ${5 / k}`} />
                <path d={`M${tip.x} ${tip.y} L${lWing.x} ${lWing.y} M${tip.x} ${tip.y} L${rWing.x} ${rWing.y}`}
                  stroke="#F26B57" strokeWidth={2.4 / k} fill="none" strokeLinecap="round" />
                <circle cx={northA.x} cy={northA.y} r={4 / k} fill="#F26B57" stroke="#FFF" strokeWidth={1.2 / k} />
                <text x={tip.x + 16 / k} y={tip.y - 10 / k} fontSize={12 / k} fontWeight={700}
                  fill="#FFD9D2" stroke="rgba(9,10,14,0.78)" strokeWidth={3 / k} paintOrder="stroke">
                  {deg.toFixed(1)}°
                </text>
              </g>
            )
          })()
        )}

        {/* curve (bulge) handles — drag an edge midpoint to bow the wall */}
        {tool === 'select' && !locked && pts.length >= 2 && (closed ? pts : pts.slice(0, -1)).map((p, i) => {
          const p2 = pts[(i + 1) % pts.length]
          const m = edgePoint(p, p2, bulges[i] ?? 0, 0.5)
          const sel = selectedEdge === i
          const size = ((COARSE ? 6.5 : 5) + (sel ? 1.5 : 0)) / k
          return (
            <g key={`b${i}`} data-bidx={i} style={{ cursor: 'grab' }}>
              <circle cx={m.x} cy={m.y} r={(COARSE ? 17 : 10) / k} fill="rgba(0,0,0,0)" data-bidx={i} />
              {sel && <circle cx={m.x} cy={m.y} r={12 / k} fill="none" stroke={GOLD} strokeWidth={1.3 / k} opacity={0.8} />}
              <rect x={m.x - size} y={m.y - size} width={size * 2} height={size * 2}
                transform={`rotate(45 ${m.x} ${m.y})`}
                fill={Math.abs(bulges[i] ?? 0) > 1e-4 ? GOLD : '#151820'}
                stroke={GOLD} strokeWidth={1.5 / k} opacity={0.95} />
            </g>
          )
        })}

        {/* vertex handles */}
        {showHandles && pts.map((p, i) => {
          const isFirst = i === 0
          const highlight = isFirst && nearFirst
          const sel = selectedVertex === i
          return (
            <g key={i} data-vidx={i} style={{ cursor: 'grab' }}>
              <circle cx={p.x} cy={p.y} r={HIT_PX / k} fill="rgba(0,0,0,0)" data-vidx={i} />
              {(highlight || sel) && (
                <circle cx={p.x} cy={p.y} r={11 / k} fill="none" stroke={GOLD}
                  strokeWidth={1.5 / k} opacity={0.85} />
              )}
              <circle cx={p.x} cy={p.y} r={highlight ? 6.5 / k : COARSE ? 5.4 / k : 4.6 / k}
                fill={isFirst && tracing ? GOLD : '#FFFFFF'}
                stroke={isFirst && tracing ? '#FFF6DF' : GOLD} strokeWidth={1.8 / k} />
            </g>
          )
        })}

        {/* center drag handle — ONLY in the Pin-centre tool, so panning and
            curve-handle drags near the middle can never pin it by accident */}
        {tool === 'center' && center && pts.length >= 3 && (
          <circle data-role="center" cx={center.x} cy={center.y} r={(COARSE ? 22 : 15) / k}
            fill="rgba(0,0,0,0)" style={{ cursor: 'move' }} />
        )}
      </g>

      {/* magnifier loupe while dragging a point on touch — screen space */}
      {loupe && (() => {
        const s = useStore.getState()
        let wp: Pt | null = null
        if (loupe.mode === 'vertex') wp = s.pts[loupe.idx] ?? null
        else if (loupe.mode === 'center') wp = s.centerOverride ?? center
        else if (loupe.mode === 'calA') wp = s.calA
        else if (loupe.mode === 'calB') wp = s.calB
        else {
          const p1 = s.pts[loupe.idx], p2 = s.pts[(loupe.idx + 1) % s.pts.length]
          wp = p1 && p2 ? edgePoint(p1, p2, s.bulges[loupe.idx] ?? 0, 0.5) : null
        }
        if (!wp) return null
        const sx = wp.x * k + tx
        const sy = wp.y * k + ty
        const R = 62, MAG = 2.4, M = 16
        const svgW = svgRef.current?.clientWidth ?? 400
        const nearLeft = sx < R * 2 + M * 2 && sy < R * 2 + M * 2
        const cx = nearLeft ? svgW - R - M : R + M
        const cy = R + M
        return (
          <g pointerEvents="none">
            <defs>
              <clipPath id="loupe-clip"><circle cx={cx} cy={cy} r={R} /></clipPath>
            </defs>
            <circle cx={cx + 2} cy={cy + 4} r={R + 3} fill="rgba(0,0,0,0.45)" />
            <circle cx={cx} cy={cy} r={R + 2.5} fill="#0B0C10" />
            <g clipPath="url(#loupe-clip)">
              <rect x={cx - R} y={cy - R} width={R * 2} height={R * 2} fill="#101318" />
              <use href="#world" transform={`translate(${cx - MAG * sx} ${cy - MAG * sy}) scale(${MAG})`} />
            </g>
            <line x1={cx - 11} y1={cy} x2={cx + 11} y2={cy} stroke="#F26B57" strokeWidth={1.4} />
            <line x1={cx} y1={cy - 11} x2={cx} y2={cy + 11} stroke="#F26B57" strokeWidth={1.4} />
            <circle cx={cx} cy={cy} r={R + 2.5} fill="none" stroke={GOLD} strokeWidth={2} />
          </g>
        )
      })()}
    </svg>
  )
}
