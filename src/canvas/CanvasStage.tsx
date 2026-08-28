import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Scene, FONT, GOLD, strokePathD } from './Scene'
import { importDxf, type DxfImport } from '../importers/dxf'
import { angleOf, boundsOf, bulgeFromMid, centroid, circumradius, dist, distToSegment, edgeLength, edgePoint, nearestOnEdge, polar, polygonArea, sampledPolygon, simplifyPath } from '../geometry'
import { formatLen } from '../format'
import { haptic } from '../native'
import { setGestureBusy } from './gesture'
import { ZONES16, markerKindMeta } from '../vastu'
import type { Pt, ViewState } from '../types'

const COARSE = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const CLOSE_PX = COARSE ? 20 : 13
const HIT_PX = COARSE ? 18 : 12
const TAP_SLOP = COARSE ? 9 : 4
const pushHistory = () => useStore.getState().pushHistory()

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
  mode: 'idle' | 'maybe-pan' | 'pan' | 'vertex' | 'center' | 'calA' | 'calB' | 'calLine' | 'bulge' | 'marker' | 'drawing' | 'room-shape' | 'ink-shape' | 'erasing' | 'text-drag'
  idx: number
  markerId: string | null
  rsid: string | null
  txid: string | null
  zoneIdx: number | null
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
  const roomShapes = useStore((s) => s.roomShapes)
  const selectedRoomShape = useStore((s) => s.selectedRoomShape)
  const roomDrawMode = useStore((s) => s.roomDrawMode)
  const texts = useStore((s) => s.texts)
  const selectedText = useStore((s) => s.selectedText)
  const wallColor = useStore((s) => s.wallColor)
  const wallWidthM = useStore((s) => s.wallWidthM)
  const wallOpacity = useStore((s) => s.wallOpacity)
  const roomDraft = useStore((s) => s.roomDraft)

  const [cursor, setCursor] = useState<Pt | null>(null)
  const [loupe, setLoupe] = useState<LoupeState | null>(null)
  const [editDragging, setEditDragging] = useState(false)
  // which vertex/edge is being reshaped — drives the live length callout, independent of the showEdgeLabels setting
  const [dragIdx, setDragIdx] = useState<{ mode: 'vertex' | 'bulge'; idx: number } | null>(null)
  // live preview while dragging a new room rect/ellipse — a single small drag, not a
  // 60fps-critical gesture, so plain state (like the calibration line) is fine here
  const [activeRoom, setActiveRoom] = useState<[Pt, Pt] | null>(null)
  const [activeShape, setActiveShape] = useState<[Pt, Pt] | null>(null)
  const activeLenRef = useRef<SVGTextElement>(null)
  // ink preview is driven imperatively (like the view transform) so drawing never re-renders the scene
  const activeStrokeRef = useRef<Pt[]>([])
  const activeInkRef = useRef<SVGPathElement>(null)
  const snapDotsRef = useRef<SVGGElement>(null)
  const penCursorRef = useRef<Pt | null>(null)
  const drag = useRef<DragState>({ mode: 'idle', idx: -1, markerId: null, rsid: null, txid: null, zoneIdx: null, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false, pushed: false, grabbed: null })
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

  // the wheel's AREA equals the plot's (πR² = A) — the compass reads as the plot's equal,
  // not a halo around it; an open outline falls back to its enclosing circle
  const R = useMemo(() => {
    if (!center || pts.length < 3) return 0
    return closed
      ? Math.sqrt(Math.abs(polygonArea(sampled)) / Math.PI)
      : circumradius(center, sampled) * 1.03
  }, [center, pts.length, sampled, closed])

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
    const rw = Math.max(rmaxX - rminX, 1), rh = Math.max(rmaxY - rminY, 1)
    const k = Math.min(60, Math.max(0.02, Math.min(availW / rw, availH / rh) * 0.95))
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
  /** Eraser sweep: whole strokes and notes under the fingertip go at once; one undo step per gesture. */
  const eraseAt = (w: Pt) => {
    const s0 = useStore.getState()
    const rad = (COARSE ? 16 : 12) / viewRef.current.k
    const sids: string[] = []
    for (const st of s0.strokes) {
      // shapes hit along their outline — sample the ring/box into segments first
      let pp = st.pts
      if (st.kind === 'rect' && st.pts.length >= 2) {
        const [a, b] = st.pts
        pp = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a]
      } else if (st.kind === 'ellipse' && st.pts.length >= 2) {
        const [a, b] = st.pts
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
        const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2
        pp = Array.from({ length: 25 }, (_, i) => {
          const t = (i / 24) * 2 * Math.PI
          return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) }
        })
      }
      let hit = pp.length === 1 && dist(pp[0], w) < rad + st.width
      for (let i = 1; i < pp.length && !hit; i++) {
        if (distToSegment(w, pp[i - 1], pp[i]) < rad + st.width / 2) hit = true
      }
      if (hit) sids.push(st.id)
    }
    const tids: string[] = []
    for (const t of s0.texts) {
      const lines = (t.text || ' ').split('\n')
      const bw = Math.max(...lines.map((l) => l.length), 1) * t.size * 0.6
      const bh = lines.length * t.size * 1.25
      if (w.x > t.p.x - t.size * 0.3 - rad && w.x < t.p.x + bw + t.size * 0.3 + rad &&
          w.y > t.p.y - t.size - rad && w.y < t.p.y - t.size + bh + t.size * 0.6 + rad) tids.push(t.id)
    }
    if (sids.length || tids.length) {
      if (!drag.current.pushed) { pushHistory(); drag.current.pushed = true }
      s0.eraseHits(sids, tids)
      haptic('light')
    }
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current!
    try { svg.setPointerCapture(e.pointerId) } catch { /* synthetic or stale pointer */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setGestureBusy(true)
    if (pointers.current.size >= 2) {
      // another finger aborts any in-flight gesture — clear its live preview too, not just its mode
      const dd = drag.current
      if (dd.mode === 'room-shape') setActiveRoom(null)
      else if (dd.mode === 'ink-shape') setActiveShape(null)
      else if (dd.mode === 'drawing') {
        activeStrokeRef.current = []
        penCursorRef.current = null
        activeInkRef.current?.setAttribute('d', '')
        if (activeLenRef.current) activeLenRef.current.textContent = ''
        setSnapDot(0, null)
        setSnapDot(1, null)
      }
      dd.mode = 'idle'
      lastPinch.current = null
      return
    }
    if (e.button === 2) return
    const target = (e.target as Element).closest('[data-vidx],[data-bidx],[data-mkid],[data-strokeid],[data-rsid],[data-txid],[data-zone],[data-role]')
    const vidx = target?.getAttribute('data-vidx')
    const bidx = target?.getAttribute('data-bidx')
    const mkid = target?.getAttribute('data-mkid')
    const strokeId = target?.getAttribute('data-strokeid')
    const rsid = target?.getAttribute('data-rsid')
    const txid = target?.getAttribute('data-txid')
    const zone = target?.getAttribute('data-zone')
    const role = target?.getAttribute('data-role')
    const d = drag.current
    d.startX = e.clientX; d.startY = e.clientY
    d.lastX = e.clientX; d.lastY = e.clientY
    d.moved = false; d.pushed = false; d.markerId = null; d.rsid = null; d.txid = null; d.zoneIdx = null
    d.grabbed = toWorld(e.clientX, e.clientY)
    if (vidx != null) { d.mode = 'vertex'; d.idx = Number(vidx); setEditDragging(true); setDragIdx({ mode: 'vertex', idx: d.idx }) }
    else if (bidx != null) { d.mode = 'bulge'; d.idx = Number(bidx); setEditDragging(true); setDragIdx({ mode: 'bulge', idx: d.idx }) }
    else if (mkid != null) { d.mode = 'marker'; d.markerId = mkid }
    else if (strokeId != null) {
      useStore.getState().setSelectedStroke(
        useStore.getState().selectedStroke === strokeId ? null : strokeId)
      d.mode = 'idle'
      return
    }
    else if (rsid != null) {
      const s0 = useStore.getState()
      if (s0.tool === 'room' && !s0.locked && e.button === 0) {
        // room tool: a press on an existing room starts a new shape on top of it —
        // a press that stays a tap still selects, on release
        if (s0.roomDrawMode === 'polygon') { d.mode = 'maybe-pan' } // taps place corners, drags pan
        else {
          d.mode = 'room-shape'
          d.rsid = rsid
          setActiveRoom([d.grabbed!, d.grabbed!])
        }
      } else {
        s0.setSelectedRoomShape(s0.selectedRoomShape === rsid ? null : rsid)
        d.mode = 'idle'
        return
      }
    }
    else if (txid != null) {
      // text notes: drag moves, tap toggles selection — mirrors markers
      d.mode = 'text-drag'
      d.txid = txid
    }
    else if (zone != null) {
      // a zone wedge: taps open the zone's detail card, drags still pan
      d.mode = 'maybe-pan'
      d.zoneIdx = parseInt(zone, 10)
    }
    else if (role === 'center' || role === 'calA' || role === 'calB' || role === 'calLine') { d.mode = role }
    else if (e.button === 1) { d.mode = 'pan' }
    else if (useStore.getState().tool === 'room' && !useStore.getState().locked && e.button === 0) {
      if (useStore.getState().roomDrawMode === 'polygon') { d.mode = 'maybe-pan' } // corner taps, like tracing
      else {
        d.mode = 'room-shape'
        setActiveRoom([d.grabbed!, d.grabbed!])
      }
    }
    else if (useStore.getState().tool === 'draw' && !useStore.getState().locked && e.button === 0) {
      const s0 = useStore.getState()
      if (s0.drawMode === 'text') { d.mode = 'maybe-pan' } // a tap places the note, on release
      else if (s0.drawMode === 'erase') {
        d.mode = 'erasing'
        eraseAt(d.grabbed!)
      }
      else if (s0.drawMode === 'rect' || s0.drawMode === 'ellipse') {
        d.mode = 'ink-shape'
        setActiveShape([d.grabbed!, d.grabbed!])
      }
      else {
      d.mode = 'drawing'
      let start = d.grabbed!
      let startSnapped = false
      if (s0.drawMode === 'line' || s0.drawMode === 'arrow') {
        const r = snapToOutline(start)
        start = r.p; startSnapped = r.snapped
      }
      activeStrokeRef.current = [start]
      penCursorRef.current = start
      const k0 = viewRef.current.k
      const ink = activeInkRef.current
      if (ink) {
        ink.setAttribute('stroke', s0.drawMode === 'pen' ? s0.penColor : s0.lineColor)
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
    if (pointers.current.size >= 2) {
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
    if (movedPx > TAP_SLOP) d.moved = true

    if (d.mode === 'maybe-pan' && d.moved) d.mode = 'pan'
    if (d.mode === 'pan') {
      const v = viewRef.current
      setViewLive({ tx: v.tx + (e.clientX - d.lastX), ty: v.ty + (e.clientY - d.lastY), k: v.k, rot: v.rot })
      d.lastX = e.clientX; d.lastY = e.clientY
      return
    }
    d.lastX = e.clientX; d.lastY = e.clientY
    if (d.mode === 'vertex' && d.moved && !s.locked) {
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
    if (d.mode === 'center' && d.moved && !s.locked) {
      s.setCenterOverride(world)
      return
    }
    if (d.mode === 'marker' && d.moved && d.markerId && !s.locked) {
      if (!d.pushed) { pushHistory(); d.pushed = true }
      s.moveMarker(d.markerId, world)
      return
    }
    if (d.mode === 'erasing' && !s.locked) {
      eraseAt(world)
      return
    }
    if (d.mode === 'text-drag' && d.moved && d.txid && !s.locked) {
      if (!d.pushed) { pushHistory(); d.pushed = true }
      s.moveText(d.txid, world)
      return
    }
    if (d.mode === 'drawing') {
      const arr = activeStrokeRef.current
      const k2 = viewRef.current.k
      if (s.drawMode === 'line' || s.drawMode === 'arrow') {
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
        strokePathD(activeStrokeRef.current, s.drawMode === 'pen' ? 'pen' : 'line'))
      // live length readout for line/arrow — the CAD feel: you see the size as you draw
      const lbl = activeLenRef.current
      if (lbl && (s.drawMode === 'line' || s.drawMode === 'arrow')) {
        const a = activeStrokeRef.current[0], b = activeStrokeRef.current[1]
        if (a && b) {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 12 / k2
          const px = dist(a, b)
          lbl.textContent = s.metersPerPx ? formatLen(px * s.metersPerPx, s.unit) : `${Math.round(px)} u`
          lbl.setAttribute('x', String(mx))
          lbl.setAttribute('y', String(my))
          lbl.setAttribute('font-size', String(11.5 / k2))
          lbl.setAttribute('stroke-width', String(3 / k2))
          lbl.setAttribute('transform', `rotate(${-viewRef.current.rot} ${mx} ${my})`)
        } else lbl.textContent = ''
      }
      return
    }
    if ((d.mode === 'room-shape' || d.mode === 'ink-shape') && d.grabbed) {
      let p2 = world
      // hold Shift for a true square / perfect circle, like every other drawing tool
      if ((e.nativeEvent as PointerEvent).shiftKey) {
        const dx = p2.x - d.grabbed.x, dy = p2.y - d.grabbed.y
        const m = Math.max(Math.abs(dx), Math.abs(dy))
        p2 = { x: d.grabbed.x + Math.sign(dx || 1) * m, y: d.grabbed.y + Math.sign(dy || 1) * m }
      }
      if (d.mode === 'ink-shape') setActiveShape([d.grabbed, p2])
      else setActiveRoom([d.grabbed, p2])
      return
    }
    if ((d.mode === 'calA' || d.mode === 'calB') && d.moved && !s.locked) {
      if (d.mode === 'calA') s.setCal(world, s.calB)
      else s.setCal(s.calA, world)
      return
    }
    if (d.mode === 'calLine' && d.moved && d.grabbed && s.calA && s.calB && !s.locked) {
      const dx = world.x - d.grabbed.x, dy = world.y - d.grabbed.y
      d.grabbed = world
      s.setCal({ x: s.calA.x + dx, y: s.calA.y + dy }, { x: s.calB.x + dx, y: s.calB.y + dy })
      return
    }
    if (d.mode === 'bulge' && d.moved && !s.locked) {
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
    if (pointers.current.size === 0) setGestureBusy(false)
    // 3+ fingers: when one lifts, drop the stale pair so the survivors re-seed on their next move
    if (pointers.current.size >= 2) lastPinch.current = null
    if (pointers.current.size < 2 && lastPinch.current) {
      // pinch ended: settle a near-right-angle tilt onto the nearest 90° (not just level)
      lastPinch.current = null
      const r = norm180(viewRef.current.rot)
      const nearest90 = Math.round(r / 90) * 90
      if (r !== nearest90 && Math.abs(r - nearest90) < 3) rotateViewAbout(nearest90 - r)
      commitView()
    }
    setLoupe(null)
    setEditDragging(false)
    setDragIdx(null)
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
      if (activeLenRef.current) activeLenRef.current.textContent = ''
      setSnapDot(0, null)
      setSnapDot(1, null)
      const k2 = viewRef.current.k
      let total = 0
      for (let i = 1; i < arr.length; i++) total += dist(arr[i - 1], arr[i])
      if (arr.length >= 2 && total > 4 / k2) {
        s0.addStroke({
          id: (crypto as any).randomUUID ? crypto.randomUUID() : `st${Math.floor(performance.now() * 1000)}`,
          kind: s0.drawMode as 'pen' | 'line' | 'arrow', // 'drawing' only arms for these three
          pts: s0.drawMode === 'pen' ? simplifyPath(arr, 0.4 / k2) : [arr[0], arr[arr.length - 1]],
          color: s0.drawMode === 'pen' ? s0.penColor : s0.lineColor,
          width: (s0.drawWidth === 1 ? 2 : s0.drawWidth === 3 ? 6 : 3.5) / k2,
        })
      }
      return
    }
    // an ink rectangle/circle commits on release, exactly like the room drag
    if (mode === 'ink-shape') {
      const s0 = useStore.getState()
      const region = activeShape
      setActiveShape(null)
      const k2 = viewRef.current.k
      if (region) {
        const [p1, p2] = region
        if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 6 / k2) {
          haptic('light')
          s0.addStroke({
            id: (crypto as any).randomUUID ? crypto.randomUUID() : `st${Math.floor(performance.now() * 1000)}`,
            kind: s0.drawMode as 'rect' | 'ellipse',
            pts: [p1, p2],
            color: s0.lineColor,
            width: (s0.drawWidth === 1 ? 2 : s0.drawWidth === 3 ? 6 : 3.5) / k2,
          })
        }
      }
      return
    }
    // room-shape commits on release too — it's a drag, same reasoning as ink above
    if (mode === 'room-shape') {
      const s0 = useStore.getState()
      const region = activeRoom
      setActiveRoom(null)
      const k2 = viewRef.current.k
      if (region) {
        const [p1, p2] = region
        const big = Math.hypot(p2.x - p1.x, p2.y - p1.y) > 6 / k2
        if (big) {
          haptic('light')
          s0.addRoomShape(s0.roomDrawMode, [p1, p2])
        } else if (d.rsid) {
          // the press began on an existing room and stayed a tap — select it
          s0.setSelectedRoomShape(s0.selectedRoomShape === d.rsid ? null : d.rsid)
        }
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
    if (mode === 'text-drag') {
      if (d.txid) s.setSelectedText(s.selectedText === d.txid ? null : d.txid)
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
      s.setSelection({ vertex: null, edge: null }); s.setSelectedMarker(null); s.setSelectedStroke(null); s.setSelectedRoomShape(null); s.setSelectedText(null)
      // tapping a wheel zone opens its detail card (same zone again closes); anywhere else clears it
      s.setHighlightZone(d.zoneIdx != null && d.zoneIdx !== s.highlightZone ? d.zoneIdx : null)
      return
    }
    if (s.locked) return

    switch (s.tool) {
      case 'marker': {
        haptic('light')
        s.addMarker(world)
        break
      }
      case 'draw': {
        if (s.drawMode === 'text') {
          haptic('light')
          // legible at the zoom it was placed at, and it scales with the plan from there
          const size = Math.min(200, Math.max(6, 18 / viewRef.current.k))
          s.addText(world, s.penColor, size)
          s.setTextEditing(true)
        }
        break
      }
      case 'room': {
        if (s.roomDrawMode !== 'polygon') break
        const draft = s.roomDraft ?? []
        // close by tapping the first corner again — the same gesture as the outline
        if (draft.length >= 3 && dist(world, draft[0]) < CLOSE_PX / k) { haptic('success'); s.closeRoomDraft(); break }
        haptic('light')
        s.setRoomDraft([...draft, world])
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
        if (s.pts.length >= 3 && dist(world, s.pts[0]) < CLOSE_PX / k) { haptic('success'); s.closePolygon(); break }
        let p = world
        // snap a new corner onto an already-placed one, or onto an edge it's crossing —
        // catches the "close a notch" / "align with the wall I just drew" cases
        const snap = snapToOutline(world)
        // …but never back onto the corner just placed — that would append a coincident duplicate
        const lastPt = s.pts[s.pts.length - 1]
        const dupSnap = snap.snapped && lastPt != null && dist(snap.p, lastPt) < 1e-9
        if (snap.snapped && !dupSnap) {
          p = snap.p
          haptic('light')
          if (snapDotsRef.current) {
            for (const c of snapDotsRef.current.children) {
              c.setAttribute('r', String(6 / k))
              c.setAttribute('stroke-width', String(2 / k))
            }
          }
          setSnapDot(0, p)
          window.setTimeout(() => setSnapDot(0, null), 260)
        } else if (s.angleSnap && s.pts.length > 0) {
          p = snapPoint(s.pts[s.pts.length - 1], p)
        }
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
          haptic('success')
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
    if (s.locked || s.tool !== 'select') return
    // double-click a text note to edit it in place
    const noteId = (e.target as Element).closest('[data-txid]')?.getAttribute('data-txid')
    if (noteId) {
      s.setSelectedText(noteId)
      s.setTextEditing(true)
      return
    }
    if (s.pts.length < 2) return
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
          k={k} viewRotDeg={rot} showEdgeLabels={showEdgeLabels} markers={markers} strokes={strokes}
          roomShapes={roomShapes} selectedRoomShape={selectedRoomShape}
          texts={texts} selectedText={selectedText}
          wallColor={wallColor} wallWidthM={wallWidthM} wallOpacity={wallOpacity} idPrefix="live"
        />

        {/* live ink preview + snap rings — attributes set imperatively so drawing/tracing never re-renders */}
        {(tool === 'draw' || tool === 'trace') && (
          <g>
            {tool === 'draw' && <path ref={activeInkRef} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.92} />}
            {tool === 'draw' && (
              <text ref={activeLenRef} fontFamily={FONT} fontWeight={700} textAnchor="middle"
                fill="#F3E9CF" stroke="rgba(9,10,14,0.78)" paintOrder="stroke" />
            )}
            <g ref={snapDotsRef}>
              <circle style={{ display: 'none' }} fill="none" stroke={GOLD} opacity={0.95} />
              <circle style={{ display: 'none' }} fill="none" stroke={GOLD} opacity={0.95} />
            </g>
          </g>
        )}

        {/* live ink rectangle/circle preview with real dimensions */}
        {activeShape && (() => {
          const s0 = useStore.getState()
          const [p1, p2] = activeShape
          const wpx = (s0.drawWidth === 1 ? 2 : s0.drawWidth === 3 ? 6 : 3.5) / k
          const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y)
          const w2 = Math.abs(p2.x - p1.x), h2 = Math.abs(p2.y - p1.y)
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
          return (
            <g>
              {s0.drawMode === 'ellipse' ? (
                <ellipse cx={mid.x} cy={mid.y} rx={w2 / 2} ry={h2 / 2}
                  fill="none" stroke={s0.lineColor} strokeWidth={wpx} opacity={0.9} />
              ) : (
                <rect x={x} y={y} width={w2} height={h2}
                  fill="none" stroke={s0.lineColor} strokeWidth={wpx} opacity={0.9} />
              )}
              <text x={mid.x} y={y - 10 / k} fontSize={11.5 / k} fontFamily={FONT} fontWeight={700}
                fill="#F3E9CF" textAnchor="middle" transform={`rotate(${-rot} ${mid.x} ${y - 10 / k})`}
                stroke="rgba(9,10,14,0.78)" strokeWidth={3 / k} paintOrder="stroke">
                {metersPerPx
                  ? `${formatLen(w2 * metersPerPx, unit)} × ${formatLen(h2 * metersPerPx, unit)}`
                  : `${Math.round(w2)} u × ${Math.round(h2)} u`}
              </text>
            </g>
          )
        })()}

        {/* zone hit wedges — tap a region of the wheel for its detail card. Rendered FIRST
            so every other hit surface (markers, rooms, strokes, notes) wins over them */}
        {tool === 'select' && closed && center && sceneCompass.id !== 'none' && R > 0 && (() => {
          const RS = R * ((sceneCompass.scalePct ?? 100) / 100)
          return ZONES16.map((_, i) => {
            const a0 = northDeg - 11.25 + i * 22.5
            const p0 = polar(center, a0, RS)
            const p1 = polar(center, a0 + 22.5, RS)
            return <path key={`zone-${i}`} data-zone={i}
              d={`M${center.x} ${center.y}L${p0.x} ${p0.y}A${RS} ${RS} 0 0 1 ${p1.x} ${p1.y}Z`}
              fill="rgba(0,0,0,0.001)" />
          })
        })()}

        {/* stroke hit paths — tap a stroke in Select mode to manage it */}
        {tool === 'select' && !locked && strokes.map((s2) => (
          <path key={`hit-${s2.id}`} data-strokeid={s2.id} d={strokePathD(s2.pts, s2.kind)} fill="none"
            stroke="rgba(0,0,0,0)" strokeWidth={Math.max(s2.width * 2, (COARSE ? 20 : 12) / k)}
            style={{ cursor: 'pointer' }} />
        ))}

        {/* text-note hit areas — tap to manage, drag to move (select tool only) */}
        {tool === 'select' && !locked && texts.map((t) => {
          const lines = (t.text || ' ').split('\n')
          const bw = Math.max(...lines.map((l) => l.length), 1) * t.size * 0.6
          const bh = lines.length * t.size * 1.25
          return <rect key={`hit-${t.id}`} data-txid={t.id} x={t.p.x - t.size * 0.3} y={t.p.y - t.size}
            width={bw + t.size * 0.6} height={bh + t.size * 0.6}
            fill="rgba(0,0,0,0.001)" style={{ cursor: 'grab' }} />
        })}

        {/* room-shape hit areas — the whole room is tappable, not just its border */}
        {(tool === 'select' || tool === 'room') && !locked && roomShapes.map((r) => {
          const [p1, p2] = r.pts
          if (!p1 || !p2) return null
          if (r.shape === 'polygon' && r.pts.length >= 3) {
            const dPath = `M${r.pts.map((p) => `${p.x} ${p.y}`).join('L')}Z`
            return <path key={`hit-${r.id}`} data-rsid={r.id} d={dPath}
              fill="rgba(0,0,0,0.001)" style={{ cursor: 'pointer' }} />
          }
          if (r.shape === 'ellipse') {
            const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
            return <ellipse key={`hit-${r.id}`} data-rsid={r.id} cx={mid.x} cy={mid.y}
              rx={Math.abs(p2.x - p1.x) / 2} ry={Math.abs(p2.y - p1.y) / 2}
              fill="rgba(0,0,0,0.001)" style={{ cursor: 'pointer' }} />
          }
          const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y)
          return <rect key={`hit-${r.id}`} data-rsid={r.id} x={x} y={y}
            width={Math.abs(p2.x - p1.x)} height={Math.abs(p2.y - p1.y)}
            fill="rgba(0,0,0,0.001)" style={{ cursor: 'pointer' }} />
        })}

        {/* free-traced area in progress — corners placed by taps, first corner closes it */}
        {tool === 'room' && roomDraft && roomDraft.length > 0 && (() => {
          const color = markerKindMeta(useStore.getState().roomShapeKind).color
          const closable = roomDraft.length >= 3
          const dPath = `M${roomDraft.map((p) => `${p.x} ${p.y}`).join('L')}`
          return (
            <g>
              {closable && <path d={dPath + 'Z'} fill={color} fillOpacity={0.1} stroke="none" />}
              <path d={dPath} fill="none" stroke={color} strokeWidth={2 / k}
                strokeDasharray={`${7 / k} ${5 / k}`} strokeLinejoin="round" strokeLinecap="round" />
              {roomDraft.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={(i === 0 && closable ? 7 : 4) / k}
                  fill={i === 0 && closable ? color : 'rgba(20,22,28,0.6)'}
                  stroke={color} strokeWidth={1.6 / k} />
              ))}
            </g>
          )
        })()}

        {/* live room-shape preview while dragging out a new rect/ellipse */}
        {activeRoom && (() => {
          const [p1, p2] = activeRoom
          const color = markerKindMeta(useStore.getState().roomShapeKind).color
          const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y)
          const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y)
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
          return (
            <g>
              {roomDrawMode === 'ellipse' ? (
                <ellipse cx={mid.x} cy={mid.y} rx={w / 2} ry={h / 2}
                  fill={color} fillOpacity={0.16} stroke={color} strokeWidth={2 / k} strokeDasharray={`${7 / k} ${5 / k}`} />
              ) : (
                <rect x={x} y={y} width={w} height={h}
                  fill={color} fillOpacity={0.16} stroke={color} strokeWidth={2 / k} strokeDasharray={`${7 / k} ${5 / k}`} />
              )}
              {metersPerPx && (
                <text x={mid.x} y={y - 10 / k} fontSize={11.5 / k} fontFamily={FONT} fontWeight={700}
                  fill="#F3E9CF" textAnchor="middle" transform={`rotate(${-rot} ${mid.x} ${y - 10 / k})`}
                  stroke="rgba(9,10,14,0.78)" strokeWidth={3 / k} paintOrder="stroke">
                  {formatLen(w * metersPerPx, unit)} × {formatLen(h * metersPerPx, unit)}
                </text>
              )}
            </g>
          )
        })()}

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

        {/* live length callout while reshaping — the number stays visible the whole drag, not just while placing new points */}
        {dragIdx && metersPerPx && (() => {
          const n = pts.length
          if (n < 2) return null
          const DragLabel = ({ at, text }: { at: Pt; text: string }) => (
            <text x={at.x} y={at.y} fontSize={12 / k} fontFamily={FONT} fontWeight={700}
              textAnchor="middle" fill="#F3E9CF"
              transform={`rotate(${-rot} ${at.x} ${at.y})`}
              stroke="rgba(9,10,14,0.78)" strokeWidth={3.2 / k} paintOrder="stroke">
              {text}
            </text>
          )
          if (dragIdx.mode === 'vertex') {
            const { idx } = dragIdx
            const prevI = (idx - 1 + n) % n
            const nextI = (idx + 1) % n
            const labels: React.ReactElement[] = []
            if (closed || idx > 0) {
              const p1 = pts[prevI], p2 = pts[idx]
              if (p1 && p2) {
                const mid = edgePoint(p1, p2, bulges[prevI] ?? 0, 0.5)
                labels.push(<DragLabel key="prev" at={{ x: mid.x, y: mid.y - 14 / k }} text={formatLen(edgeLength(p1, p2, bulges[prevI] ?? 0) * metersPerPx, unit)} />)
              }
            }
            if (closed || idx < n - 1) {
              const p1 = pts[idx], p2 = pts[nextI]
              if (p1 && p2 && nextI !== prevI) {
                const mid = edgePoint(p1, p2, bulges[idx] ?? 0, 0.5)
                labels.push(<DragLabel key="next" at={{ x: mid.x, y: mid.y - 14 / k }} text={formatLen(edgeLength(p1, p2, bulges[idx] ?? 0) * metersPerPx, unit)} />)
              }
            }
            return <g>{labels}</g>
          }
          // bulge mode: the chord is fixed while curving it, so the sagitta (bow depth) is the number that actually moves
          const { idx } = dragIdx
          const p1 = pts[idx], p2 = pts[(idx + 1) % n]
          if (!p1 || !p2) return null
          const chord = dist(p1, p2)
          const sagitta = Math.abs(((bulges[idx] ?? 0) * chord) / 2)
          const mid = edgePoint(p1, p2, bulges[idx] ?? 0, 0.5)
          return <DragLabel at={{ x: mid.x, y: mid.y - 14 / k }} text={`bow ${formatLen(sagitta * metersPerPx, unit)}`} />
        })()}

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

        {/* curve (bulge) handles — drag an edge midpoint to bow the wall.
           A dozen-plus of these sit on screen at once in select mode, so the
           resting state stays a quiet outline; only a curved edge (worth
           noticing) or an actively-selected one earns the solid gold fill. */}
        {tool === 'select' && !locked && pts.length >= 2 && (closed ? pts : pts.slice(0, -1)).map((p, i) => {
          const p2 = pts[(i + 1) % pts.length]
          const m = edgePoint(p, p2, bulges[i] ?? 0, 0.5)
          const sel = selectedEdge === i
          const curved = Math.abs(bulges[i] ?? 0) > 1e-4
          const prominent = sel || curved
          const size = ((COARSE ? 6.5 : 5) + (sel ? 1.5 : 0)) / k
          return (
            <g key={`b${i}`} data-bidx={i} style={{ cursor: 'grab' }}>
              <circle cx={m.x} cy={m.y} r={(COARSE ? 17 : 10) / k} fill="rgba(0,0,0,0)" data-bidx={i} />
              {sel && <circle cx={m.x} cy={m.y} r={12 / k} fill="none" stroke={GOLD} strokeWidth={1.3 / k} opacity={0.8} />}
              <rect x={m.x - size} y={m.y - size} width={size * 2} height={size * 2}
                transform={`rotate(45 ${m.x} ${m.y})`}
                fill={prominent ? GOLD : 'rgba(20,22,28,0.5)'}
                stroke={GOLD} strokeWidth={1.5 / k} opacity={prominent ? 0.95 : 0.55} />
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
            {/* hit circle only in the tools that mean to touch markers — drawing/tracing
                near a pin must not silently drag it */}
            {(tool === 'select' || tool === 'marker') && (
              <circle data-mkid={m.id} cx={m.p.x} cy={m.p.y} r={(COARSE ? 20 : 13) / k}
                fill="rgba(0,0,0,0)" style={{ cursor: 'grab' }} />
            )}
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
