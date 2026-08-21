import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Scene, FONT, GOLD, strokePathD } from './Scene'
import { importDxf, type DxfImport } from '../importers/dxf'
import { angleOf, boundsOf, bulgeFromMid, centroid, circumradius, dist, distToSegment, edgePoint, nearestOnEdge, polar, sampledPolygon, simplifyPath } from '../geometry'
import { formatLen } from '../format'
import type { Pt, ViewState } from '../types'

const COARSE = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const CLOSE_PX = COARSE ? 20 : 13
const HIT_PX = COARSE ? 18 : 12
const pushHistory = () =>
  useStore.setState((s) => ({
    undoStack: [...s.undoStack, { pts: s.pts, closed: s.closed, bulges: s.bulges, markers: s.markers, strokes: s.strokes }].slice(-100),
    redoStack: [],
  }))

/** One hint per session when geometry edits happen while the centre is pinned. */
let warnedPinnedCenter = false
/** Throttle for the closed-outline tracing hint. */
let lastClosedHintAt = 0

const norm180 = (a: number) => ((a % 360) + 540) % 360 - 180

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
  mode: 'idle' | 'maybe-pan' | 'pan' | 'vertex' | 'center' | 'calA' | 'calB' | 'calLine' | 'bulge' | 'marker' | 'drawing'
  idx: number
  markerId: string | null
  startX: number
  startY: number
  lastX: number
  lastY: number
  moved: boolean
  pushed: boolean
  grabbed: Pt | null
}

/** What the magnifier loupe is following, if anything. */
interface LoupeState { mode: 'vertex' | 'center' | 'calA' | 'calB' | 'bulge' | 'marker'; idx: number; markerId?: string | null }

export function CanvasStage() {
  const svgRef = useRef<SVGSVGElement>(null)
  const worldRef = useRef<SVGGElement>(null)
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
  const highlightZone = useStore((s) => s.highlightZone)
  const markers = useStore((s) => s.markers)
  const selectedMarker = useStore((s) => s.selectedMarker)
  const strokes = useStore((s) => s.strokes)

  const [cursor, setCursor] = useState<Pt | null>(null)
  const [loupe, setLoupe] = useState<LoupeState | null>(null)
  const [editDragging, setEditDragging] = useState(false)
  // ink preview is driven imperatively (like the view transform) so drawing never re-renders the scene
  const activeStrokeRef = useRef<Pt[]>([])
  const activeInkRef = useRef<SVGPathElement>(null)
  const snapDotsRef = useRef<SVGGElement>(null)
  const penCursorRef = useRef<Pt | null>(null)
  const drag = useRef<DragState>({ mode: 'idle', idx: -1, markerId: null, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false, pushed: false, grabbed: null })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null)
  const lastPinch = useRef<{ d: number; mx: number; my: number; ang: number; twist: number; rotating: boolean } | null>(null)

  /* ---------- gesture-speed view: DOM transform now, store commit at rest ---------- */
  const viewRef = useRef<ViewState>(useStore.getState().view)
  const commitTimer = useRef(0)

  const applyDom = () => {
    const v = viewRef.current
    worldRef.current?.setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.k}) rotate(${v.rot})`)
  }
  const setViewLive = (v: ViewState) => { viewRef.current = v; applyDom() }
  const commitView = () => {
    window.clearTimeout(commitTimer.current)
    useStore.getState().setView(viewRef.current)
  }
  const commitViewDebounced = (ms = 150) => {
    window.clearTimeout(commitTimer.current)
    commitTimer.current = window.setTimeout(commitView, ms)
  }

  // external view changes (fit, project load) flow into the ref; every render re-asserts the DOM transform
  useEffect(() => { viewRef.current = view }, [view])
  useLayoutEffect(() => { applyDom() })

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
    const { tx, ty, k, rot } = viewRef.current
    const qx = (clientX - rect.left - tx) / k
    const qy = (clientY - rect.top - ty) / k
    const rad = (-rot * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    return { x: qx * cos - qy * sin, y: qx * sin + qy * cos }
  }

  /** Snap a world point to the outline's corners (priority) or edges — used by straight-line ink. */
  const snapToOutline = (p: Pt): { p: Pt; snapped: boolean } => {
    const s = useStore.getState()
    const n = s.pts.length
    if (n === 0) return { p, snapped: false }
    const k2 = viewRef.current.k
    let best: Pt | null = null
    let bd = (COARSE ? 16 : 12) / k2
    for (const v of s.pts) {
      const dd = dist(p, v)
      if (dd < bd) { bd = dd; best = { x: v.x, y: v.y } }
    }
    if (best) return { p: best, snapped: true }
    const m = s.closed ? n : n - 1
    bd = (COARSE ? 12 : 9) / k2
    for (let i = 0; i < m; i++) {
      const r = nearestOnEdge(p, s.pts[i], s.pts[(i + 1) % n], s.bulges[i] ?? 0)
      if (r.d < bd) { bd = r.d; best = r.point }
    }
    return best ? { p: best, snapped: true } : { p, snapped: false }
  }

  const setSnapDot = (i: 0 | 1, p: Pt | null) => {
    const c = snapDotsRef.current?.children[i] as SVGCircleElement | undefined
    if (!c) return
    if (!p) { c.style.display = 'none'; return }
    c.style.display = ''
    c.setAttribute('cx', String(p.x))
    c.setAttribute('cy', String(p.y))
  }

  /** Rotate the view by dDeg around a screen point (defaults to the viewport centre). */
  const rotateViewAbout = (dDeg: number, m?: { x: number; y: number }) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = m?.x ?? rect.width / 2
    const my = m?.y ?? rect.height / 2
    const v = viewRef.current
    const rad = (dDeg * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    const dx = v.tx - mx, dy = v.ty - my
    setViewLive({
      tx: mx + dx * cos - dy * sin,
      ty: my + dx * sin + dy * cos,
      k: v.k,
      rot: v.rot + dDeg,
    })
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
    // fit the ROTATED footprint of the content
    const rot = viewRef.current.rot
    const rad = (rot * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    const corners = [
      { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY },
      { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
    ].map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }))
    const rminX = Math.min(...corners.map((p) => p.x)), rmaxX = Math.max(...corners.map((p) => p.x))
    const rminY = Math.min(...corners.map((p) => p.y)), rmaxY = Math.max(...corners.map((p) => p.y))
    const rw = rmaxX - rminX, rh = rmaxY - rminY
    const k = Math.min(availW / rw, availH / rh) * 0.95
    const tx = padL + (availW - rw * k) / 2 - rminX * k
    const ty = padT + (availH - rh * k) / 2 - rminY * k
    setViewLive({ tx, ty, k, rot })
    commitView()
  }

  useEffect(() => {
    const onFit = () => fitView()
    const onRotate = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {}
      if (typeof detail.set === 'number') rotateViewAbout(norm180(detail.set - viewRef.current.rot))
      else if (typeof detail.delta === 'number') rotateViewAbout(detail.delta)
      commitView()
    }
    window.addEventListener('vastu:fit', onFit)
    window.addEventListener('vastu:rotate', onRotate)
    return () => {
      window.removeEventListener('vastu:fit', onFit)
      window.removeEventListener('vastu:rotate', onRotate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const v = viewRef.current
      const rect = svg.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.006 : 0.0016))
      const nk = Math.min(60, Math.max(0.02, v.k * factor))
      setViewLive({
        tx: mx - ((mx - v.tx) * nk) / v.k,
        ty: my - ((my - v.ty) * nk) / v.k,
        k: nk,
        rot: v.rot,
      })
      commitViewDebounced()
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const target = (e.target as Element).closest('[data-vidx],[data-bidx],[data-mkid],[data-strokeid],[data-role]')
    const vidx = target?.getAttribute('data-vidx')
    const bidx = target?.getAttribute('data-bidx')
    const mkid = target?.getAttribute('data-mkid')
    const strokeId = target?.getAttribute('data-strokeid')
    const role = target?.getAttribute('data-role')
    const d = drag.current
    d.startX = e.clientX; d.startY = e.clientY
    d.lastX = e.clientX; d.lastY = e.clientY
    d.moved = false; d.pushed = false; d.markerId = null
    d.grabbed = toWorld(e.clientX, e.clientY)
    if (vidx != null) { d.mode = 'vertex'; d.idx = Number(vidx); setEditDragging(true) }
    else if (bidx != null) { d.mode = 'bulge'; d.idx = Number(bidx); setEditDragging(true) }
    else if (mkid != null) { d.mode = 'marker'; d.markerId = mkid }
    else if (strokeId != null) {
      useStore.getState().setSelectedStroke(
        useStore.getState().selectedStroke === strokeId ? null : strokeId)
      d.mode = 'idle'
      return
    }
    else if (role === 'center' || role === 'calA' || role === 'calB' || role === 'calLine') { d.mode = role }
    else if (e.button === 1) { d.mode = 'pan' }
    else if (useStore.getState().tool === 'draw' && !useStore.getState().locked && e.button === 0) {
      const s0 = useStore.getState()
      d.mode = 'drawing'
      let start = d.grabbed!
      let startSnapped = false
      if (s0.drawMode === 'line') {
        const r = snapToOutline(start)
        start = r.p; startSnapped = r.snapped
      }
      activeStrokeRef.current = [start]
      penCursorRef.current = start
      const k0 = viewRef.current.k
      const ink = activeInkRef.current
      if (ink) {
        ink.setAttribute('stroke', s0.drawMode === 'line' ? s0.lineColor : s0.penColor)
        ink.setAttribute('stroke-width', String((s0.drawWidth === 1 ? 2 : s0.drawWidth === 3 ? 6 : 3.5) / k0))
        ink.setAttribute('d', '')
      }
      if (snapDotsRef.current) {
        for (const c of snapDotsRef.current.children) {
          c.setAttribute('r', String(6 / k0))
          c.setAttribute('stroke-width', String(2 / k0))
        }
      }
      setSnapDot(0, startSnapped ? start : null)
      setSnapDot(1, null)
    }
    else { d.mode = 'maybe-pan' }
    if (e.pointerType !== 'mouse' &&
      (d.mode === 'vertex' || d.mode === 'center' || d.mode === 'calA' || d.mode === 'calB' || d.mode === 'bulge' || d.mode === 'marker')) {
      setLoupe({ mode: d.mode, idx: d.idx, markerId: d.markerId })
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const s = useStore.getState()
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    // pinch: zoom + pan + (after intent) twist-to-rotate — all direct to the DOM
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()]
      const dpx = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const angNow = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI
      const rect = svgRef.current!.getBoundingClientRect()
      const mx = (p1.x + p2.x) / 2 - rect.left
      const my = (p1.y + p2.y) / 2 - rect.top
      const lp = lastPinch.current
      if (lp) {
        const v = viewRef.current
        const nk = Math.min(60, Math.max(0.02, (v.k * dpx) / lp.d))
        let ntx = mx - ((mx - v.tx) * nk) / v.k
        let nty = my - ((my - v.ty) * nk) / v.k
        ntx += mx - lp.mx; nty += my - lp.my
        setViewLive({ tx: ntx, ty: nty, k: nk, rot: v.rot })
        const dAng = norm180(angNow - lp.ang)
        lp.twist += dAng
        if (!lp.rotating && Math.abs(lp.twist) > 8) lp.rotating = true
        if (lp.rotating && dAng !== 0) rotateViewAbout(dAng, { x: mx, y: my })
        lp.d = dpx; lp.mx = mx; lp.my = my; lp.ang = angNow
      } else {
        lastPinch.current = { d: dpx, mx, my, ang: angNow, twist: 0, rotating: false }
      }
      return
    }
    const d = drag.current
    const world = toWorld(e.clientX, e.clientY)
    const needCursor = s.tool === 'calibrate' || s.tool === 'north' || (s.tool === 'trace' && !s.closed)
    if (needCursor) setCursor(world)
    if (d.mode === 'idle') return
    const movedPx = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
    if (movedPx > 4) d.moved = true

    if (d.mode === 'maybe-pan' && d.moved) d.mode = 'pan'
    if (d.mode === 'pan') {
      const v = viewRef.current
      setViewLive({ tx: v.tx + (e.clientX - d.lastX), ty: v.ty + (e.clientY - d.lastY), k: v.k, rot: v.rot })
      d.lastX = e.clientX; d.lastY = e.clientY
      return
    }
    d.lastX = e.clientX; d.lastY = e.clientY
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
    if (d.mode === 'marker' && d.moved && d.markerId && !s.locked) {
      if (!d.pushed) { pushHistory(); d.pushed = true }
      s.moveMarker(d.markerId, world)
      return
    }
    if (d.mode === 'drawing') {
      const arr = activeStrokeRef.current
      const k2 = viewRef.current.k
      if (s.drawMode === 'line') {
        const r = snapToOutline(world)
        let p = r.p
        if (!r.snapped && s.angleSnap && arr.length > 0) p = snapPoint(arr[0], p)
        activeStrokeRef.current = [arr[0], p]
        setSnapDot(1, r.snapped ? p : null)
      } else {
        // every hardware sample, lightly low-passed — density feeds the quadratic smoothing
        const ne = e.nativeEvent as PointerEvent
        const evs = ne.getCoalescedEvents && ne.getCoalescedEvents().length > 0 ? ne.getCoalescedEvents() : [ne]
        for (const ce of evs) {
          const raw = toWorld(ce.clientX, ce.clientY)
          const c0 = penCursorRef.current ?? raw
          const sm = { x: c0.x + (raw.x - c0.x) * 0.55, y: c0.y + (raw.y - c0.y) * 0.55 }
          penCursorRef.current = sm
          if (arr.length === 0 || dist(arr[arr.length - 1], sm) > 1.2 / k2) arr.push(sm)
        }
      }
      activeInkRef.current?.setAttribute('d',
        strokePathD(activeStrokeRef.current, s.drawMode === 'line' ? 'line' : 'pen'))
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
        if (Math.abs((b * chord) / 2) < 5 / viewRef.current.k) b = 0
        s.setBulge(d.idx, b)
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2 && lastPinch.current) {
      // pinch ended: settle a near-level tilt back to 0, then commit
      lastPinch.current = null
      const r = norm180(viewRef.current.rot)
      if (r !== 0 && Math.abs(r) < 3) rotateViewAbout(-r)
      commitView()
    }
    setLoupe(null)
    setEditDragging(false)
    const d = drag.current
    const mode = d.mode
    const moved = d.moved
    d.mode = 'idle'
    if (mode === 'pan') commitView()
    // ink commits on release — drawing IS a drag, so this must precede the moved guard
    if (mode === 'drawing') {
      const s0 = useStore.getState()
      const arr = activeStrokeRef.current
      activeStrokeRef.current = []
      penCursorRef.current = null
      activeInkRef.current?.setAttribute('d', '')
      setSnapDot(0, null)
      setSnapDot(1, null)
      const k2 = viewRef.current.k
      let total = 0
      for (let i = 1; i < arr.length; i++) total += dist(arr[i - 1], arr[i])
      if (arr.length >= 2 && total > 4 / k2) {
        s0.addStroke({
          id: (crypto as any).randomUUID ? crypto.randomUUID() : `st${Math.floor(performance.now() * 1000)}`,
          kind: s0.drawMode,
          pts: s0.drawMode === 'line' ? [arr[0], arr[arr.length - 1]] : simplifyPath(arr, 0.4 / k2),
          color: s0.drawMode === 'line' ? s0.lineColor : s0.penColor,
          width: (s0.drawWidth === 1 ? 2 : s0.drawWidth === 3 ? 6 : 3.5) / k2,
        })
      }
      return
    }
    if (e.button === 2 || moved) return
    if (pointers.current.size > 0) return

    const s = useStore.getState()
    const world = toWorld(e.clientX, e.clientY)
    const k = viewRef.current.k

    if (mode === 'vertex') {
      if (s.tool === 'trace' && !s.closed && d.idx === 0 && s.pts.length >= 3) s.closePolygon()
      else if (s.tool === 'select' && !s.locked) s.setSelection({ vertex: d.idx, edge: null })
      return
    }
    if (mode === 'bulge') {
      if (s.tool === 'select' && !s.locked) s.setSelection({ edge: d.idx, vertex: null })
      return
    }
    if (mode === 'marker') {
      if (d.markerId) s.setSelectedMarker(s.selectedMarker === d.markerId ? null : d.markerId)
      return
    }
    // a tap only ever places/dispatches from a plain press on empty canvas —
    // never from handle presses or the tail end of a pinch (mode 'idle')
    if (mode !== 'maybe-pan') return
    if (s.tool === 'select') {
      // double-tap zooms on touch — the gesture every map app taught the thumb
      if (COARSE) {
        const lt = lastTap.current
        const now = performance.now()
        if (lt && now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 32) {
          lastTap.current = null
          const rect = svgRef.current!.getBoundingClientRect()
          const mx = e.clientX - rect.left, my = e.clientY - rect.top
          const v = viewRef.current
          const nk = Math.min(60, v.k * 2.1)
          setViewLive({ tx: mx - ((mx - v.tx) * nk) / v.k, ty: my - ((my - v.ty) * nk) / v.k, k: nk, rot: v.rot })
          commitView()
          return
        }
        lastTap.current = { t: now, x: e.clientX, y: e.clientY }
      }
      s.setSelection({ vertex: null, edge: null }); s.setSelectedMarker(null); s.setSelectedStroke(null); return
    }
    if (s.locked) return

    switch (s.tool) {
      case 'marker': {
        s.addMarker(world)
        break
      }
      case 'trace': {
        if (s.closed) {
          // tapping an edge of the closed outline inserts a point exactly there
          const n = s.pts.length
          let bi = -1, bt = 0, bp: Pt | null = null
          let bd = (COARSE ? 22 : 12) / k
          for (let i = 0; i < n; i++) {
            const r = nearestOnEdge(world, s.pts[i], s.pts[(i + 1) % n], s.bulges[i] ?? 0)
            if (r.d < bd) { bd = r.d; bi = i; bt = r.t; bp = r.point }
          }
          if (bi >= 0 && bp && bt > 0.02 && bt < 0.98) {
            s.insertPointOnEdge(bi, bp, bt)
            s.setSelection({ vertex: bi + 1, edge: null })
            s.toast('Point added — drag it to shape the wall', 'ok')
          } else if (Date.now() - lastClosedHintAt > 5000) {
            lastClosedHintAt = Date.now()
            s.toast('Outline is closed — tap on an edge to add a point there', 'info', 'Reopen to extend', () => {
              const s2 = useStore.getState()
              s2.reopenPolygon()
              s2.setTool('trace')
              s2.toast('Outline reopened — new points continue from the last corner. Tap the ✓ to close again', 'info')
            })
          }
          break
        }
        if (s.pts.length >= 3 && dist(world, s.pts[0]) < CLOSE_PX / k) { s.closePolygon(); break }
        let p = world
        if (s.angleSnap && s.pts.length > 0) p = snapPoint(s.pts[s.pts.length - 1], p)
        s.addPoint(p)
        break
      }
      case 'calibrate': {
        // instructions live in the persistent tool hint now
        if (!s.calA || (s.calA && s.calB)) s.setCal(world, null)
        else s.setCal(s.calA, world)
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
        } else if (dist(s.northA, world) > 3 / k) {
          const deg = Math.round(angleOf(s.northA, world) * 2) / 2
          s.setNorth(deg, 'plan')
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
    if (COARSE) return // touch double-tap zooms; point-insert stays a precise mouse gesture
    const s = useStore.getState()
    if (s.locked || s.tool !== 'select' || s.pts.length < 2) return
    const world = toWorld(e.clientX, e.clientY)
    const k = viewRef.current.k
    const n = s.pts.length
    const count = s.closed ? n : n - 1
    let best = -1, bestD = 9 / k, bestT = 0.5, bestP: Pt | null = null
    for (let i = 0; i < count; i++) {
      const r = nearestOnEdge(world, s.pts[i], s.pts[(i + 1) % n], s.bulges[i] ?? 0)
      if (r.d < bestD) { bestD = r.d; best = i; bestT = r.t; bestP = r.point }
    }
    // curve-preserving split — same math as the tap path, so arcs never flatten
    if (best >= 0 && bestP && bestT > 0.02 && bestT < 0.98) s.insertPointOnEdge(best, bestP, bestT)
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
  const { k, rot } = view
  // the compass steps aside while the outline itself is being drawn or reshaped
  const editingOutline = tool === 'trace' || editDragging
  const sceneCompass = editingOutline && compass.id !== 'none'
    ? { ...compass, id: 'none' as const }
    : compass
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
      <g id="world" ref={worldRef}>
        <Scene
          bg={bg} dxf={dxf} pts={pts} bulges={bulges} closed={closed} center={center} R={R}
          centerOverridden={!!centerOverride} highlightZone={editingOutline ? null : highlightZone}
          northDeg={northDeg} compass={sceneCompass} metersPerPx={metersPerPx} unit={unit}
          k={k} viewRotDeg={rot} showEdgeLabels={showEdgeLabels} markers={markers} strokes={strokes} idPrefix="live"
        />

        {/* live ink preview + snap rings — attributes set imperatively so drawing never re-renders */}
        {tool === 'draw' && (
          <g>
            <path ref={activeInkRef} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.92} />
            <g ref={snapDotsRef}>
              <circle style={{ display: 'none' }} fill="none" stroke={GOLD} opacity={0.95} />
              <circle style={{ display: 'none' }} fill="none" stroke={GOLD} opacity={0.95} />
            </g>
          </g>
        )}

        {/* stroke hit paths — tap a stroke in Select mode to manage it */}
        {tool === 'select' && !locked && strokes.map((s2) => (
          <path key={`hit-${s2.id}`} data-strokeid={s2.id} d={strokePathD(s2.pts, s2.kind)} fill="none"
            stroke="rgba(0,0,0,0)" strokeWidth={Math.max(s2.width * 2, (COARSE ? 20 : 12) / k)}
            style={{ cursor: 'pointer' }} />
        ))}

        {/* live trace segment */}
        {liveTo && (
          <g>
            <line x1={pts[pts.length - 1].x} y1={pts[pts.length - 1].y} x2={liveTo.x} y2={liveTo.y}
              stroke={GOLD} strokeWidth={1.8 / k} strokeDasharray={`${7 / k} ${5 / k}`} opacity={0.85} />
            {metersPerPx && (
              <text x={liveTo.x + 14 / k} y={liveTo.y - 12 / k} fontSize={11.5 / k}
                fontFamily={FONT} fontWeight={600} fill="#F3E9CF"
                transform={`rotate(${-rot} ${liveTo.x} ${liveTo.y})`}
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
                    transform={`rotate(${-rot} ${mid.x} ${mid.y})`}
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
                  fill="#FFD9D2" transform={`rotate(${-rot} ${tip.x} ${tip.y})`}
                  stroke="rgba(9,10,14,0.78)" strokeWidth={3 / k} paintOrder="stroke">
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

        {/* marker hit handles + selection ring */}
        {!locked && markers.map((m) => (
          <g key={m.id}>
            {selectedMarker === m.id && (
              <circle cx={m.p.x} cy={m.p.y} r={13 / k} fill="none" stroke={GOLD}
                strokeWidth={1.6 / k} opacity={0.9} />
            )}
            <circle data-mkid={m.id} cx={m.p.x} cy={m.p.y} r={(COARSE ? 20 : 13) / k}
              fill="rgba(0,0,0,0)" style={{ cursor: 'grab' }} />
          </g>
        ))}

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
        else if (loupe.mode === 'marker') {
          wp = s.markers.find((m) => m.id === loupe.markerId)?.p ?? null
        }
        else {
          const p1 = s.pts[loupe.idx], p2 = s.pts[(loupe.idx + 1) % s.pts.length]
          wp = p1 && p2 ? edgePoint(p1, p2, s.bulges[loupe.idx] ?? 0, 0.5) : null
        }
        if (!wp) return null
        const v = viewRef.current
        const rad = (v.rot * Math.PI) / 180
        const cosR = Math.cos(rad), sinR = Math.sin(rad)
        const sx = v.tx + v.k * (wp.x * cosR - wp.y * sinR)
        const sy = v.ty + v.k * (wp.x * sinR + wp.y * cosR)
        const R2 = 62, MAG = 2.4, M = 16
        const svgW = svgRef.current?.clientWidth ?? 400
        const nearLeft = sx < R2 * 2 + M * 2 && sy < R2 * 2 + M * 2
        const cx = nearLeft ? svgW - R2 - M : R2 + M
        const cy = R2 + M
        return (
          <g pointerEvents="none">
            <defs>
              <clipPath id="loupe-clip"><circle cx={cx} cy={cy} r={R2} /></clipPath>
            </defs>
            <circle cx={cx + 2} cy={cy + 4} r={R2 + 3} fill="rgba(0,0,0,0.45)" />
            <circle cx={cx} cy={cy} r={R2 + 2.5} fill="#0B0C10" />
            <g clipPath="url(#loupe-clip)">
              <rect x={cx - R2} y={cy - R2} width={R2 * 2} height={R2 * 2} fill="#101318" />
              <use href="#world" transform={`translate(${cx - MAG * sx} ${cy - MAG * sy}) scale(${MAG})`} />
            </g>
            <line x1={cx - 11} y1={cy} x2={cx + 11} y2={cy} stroke="#F26B57" strokeWidth={1.4} />
            <line x1={cx} y1={cy - 11} x2={cx} y2={cy + 11} stroke="#F26B57" strokeWidth={1.4} />
            <circle cx={cx} cy={cy} r={R2 + 2.5} fill="none" stroke={GOLD} strokeWidth={2} />
          </g>
        )
      })()}
    </svg>
  )
}
