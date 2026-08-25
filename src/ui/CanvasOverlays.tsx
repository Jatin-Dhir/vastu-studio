import { useEffect, useRef, useState } from 'react'
import { Check, Circle as CircleIcon, Lock, LockOpen, Navigation, Pencil, Plus, RotateCcw, Slash, Spline, Square as SquareIcon, Trash2, X } from 'lucide-react'
import { useStore } from '../store'
import { centroid, edgePoint, sampledPolygon } from '../geometry'
import { placementOf } from '../analysis'
import { NorthDial } from './NorthDial'
import { GATE_QUALITY, MARKER_KINDS, PLACEMENT_RULES } from '../vastu'
import type { MarkerKind } from '../types'

/** Persistent what-do-I-do-now pill — instructions no longer vanish with a toast. */
function ToolHint() {
  const tool = useStore((s) => s.tool)
  const calA = useStore((s) => s.calA)
  const calB = useStore((s) => s.calB)
  const northA = useStore((s) => s.northA)
  const pts = useStore((s) => s.pts.length)
  const closed = useStore((s) => s.closed)
  const bgHint = useStore((s) => s.bgHint)
  const drawMode = useStore((s) => s.drawMode)
  const roomDrawMode = useStore((s) => s.roomDrawMode)

  let text: string | null = null
  if (tool === 'calibrate') {
    if (bgHint === 'map-screenshot') {
      text = !calA ? "Tap ONE END of the screenshot's scale bar"
        : !calB ? 'Now tap the OTHER end of the scale bar'
          : 'Enter the printed distance — e.g. 20 m'
    } else {
      text = !calA ? 'Scale — tap the FIRST end of a length you know (a wall, a printed dimension)'
        : !calB ? 'Now tap the OTHER end of that length'
          : 'Drag the pins to fine-tune, then tap “Enter length”'
    }
  } else if (tool === 'trace') {
    text = closed
      ? 'Outline is closed — tap on an edge to add a point there'
      : pts === 0 ? 'Trace — tap the first corner of the plot'
        : pts < 3 ? `Tap the next corner · ${pts} placed`
          : `Tap corners, then the ✓ to close · ${pts} placed`
  } else if (tool === 'center') {
    text = 'Tap or drag to pin the centre — reset in the panel'
  } else if (tool === 'north') {
    text = !northA ? 'Tap the TAIL of the plan’s north arrow' : 'Now tap the TIP of the arrow'
  } else if (tool === 'marker') {
    text = 'Pick a type, then tap the plan to mark it'
  } else if (tool === 'draw') {
    text = drawMode === 'line'
      ? 'Drag a straight line — ends snap to your outline’s corners & edges'
      : 'Draw freely on the plan — pan with two fingers'
  } else if (tool === 'room') {
    text = roomDrawMode === 'ellipse'
      ? 'Drag out a circle — hold Shift for a perfect circle'
      : 'Drag out a room — hold Shift for a perfect square'
  }
  if (!text) return null
  return <div className="tool-hint">{text}</div>
}

const DRAW_COLORS = ['#F26B57', '#D9B45B', '#5B8DEF', '#63B56F', '#F2F2F2']

/** Pen/line, colour and width options while the Draw tool is armed. */
function DrawOptionsRow() {
  const drawMode = useStore((s) => s.drawMode)
  const drawColor = useStore((s) => (s.drawMode === 'line' ? s.lineColor : s.penColor))
  const drawWidth = useStore((s) => s.drawWidth)
  const hasStrokes = useStore((s) => s.strokes.length > 0)
  const st = useStore.getState()
  return (
    <div className="quickbar-row kinds">
      <button className={`qpill ${drawMode === 'pen' ? 'on' : ''}`} onClick={() => st.setDrawMode('pen')}>
        <Pencil size={12} /> Pen
      </button>
      <button className={`qpill ${drawMode === 'line' ? 'on' : ''}`} onClick={() => st.setDrawMode('line')}>
        <Slash size={12} /> Line
      </button>
      <span className="qsep" />
      {DRAW_COLORS.map((c) => (
        <button key={c} className={`draw-swatch ${drawColor === c ? 'on' : ''}`} aria-label={`Draw colour ${c}`}
          style={{ background: c }} onClick={() => st.setDrawColor(c)} />
      ))}
      <span className="qsep" />
      {[1, 2, 3].map((w) => (
        <button key={w} className={`draw-width ${drawWidth === w ? 'on' : ''}`} aria-label={`Line width ${w}`} onClick={() => st.setDrawWidth(w)}>
          <span style={{ height: w === 1 ? 2 : w === 2 ? 3.5 : 6 }} />
        </button>
      ))}
      {hasStrokes && (
        <>
          <span className="qsep" />
          <button className="qpill" aria-label="Clear all drawings" onClick={() => {
            st.toast('Remove all drawings from the plan?', 'warn', 'Clear all', () => useStore.getState().clearStrokes())
          }}>
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  )
}

/** Shape + kind picker while the Room tool is armed. */
function RoomOptionsRow() {
  const roomDrawMode = useStore((s) => s.roomDrawMode)
  const roomShapeKind = useStore((s) => s.roomShapeKind)
  const st = useStore.getState()
  return (
    <div className="quickbar-row kinds">
      <button className={`qpill ${roomDrawMode === 'rect' ? 'on' : ''}`} onClick={() => st.setRoomDrawMode('rect')}>
        <SquareIcon size={12} /> Rectangle
      </button>
      <button className={`qpill ${roomDrawMode === 'ellipse' ? 'on' : ''}`} onClick={() => st.setRoomDrawMode('ellipse')}>
        <CircleIcon size={12} /> Circle
      </button>
      <span className="qsep" />
      {MARKER_KINDS.filter((m) => m.kind !== 'entrance').map((m) => (
        <button key={m.kind} className={`qpill kind ${roomShapeKind === m.kind ? 'on' : ''}`}
          onClick={() => st.setRoomShapeKind(m.kind as MarkerKind)}>
          <span className="kind-dot" style={{ background: m.color }} />
          {m.name}
        </button>
      ))}
    </div>
  )
}

/** Edit / delete chips for a tapped room shape. */
export function RoomShapeChips() {
  const selectedRoomShape = useStore((s) => s.selectedRoomShape)
  const roomShapes = useStore((s) => s.roomShapes)
  const view = useStore((s) => s.view)
  const locked = useStore((s) => s.locked)
  const editing = useStore((s) => s.roomShapeEditing)
  const r = roomShapes.find((x) => x.id === selectedRoomShape)
  if (!r || locked || editing) return null
  // bbox midpoint, not pts[0]/pts[1] — polygon shapes carry more than two points
  const xs = r.pts.map((p) => p.x), ys = r.pts.map((p) => p.y)
  const mid = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  }
  const rad = (view.rot * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const sx = view.tx + view.k * (mid.x * cos - mid.y * sin)
  const sy = view.ty + view.k * (mid.x * sin + mid.y * cos)
  const st = useStore.getState()
  return (
    <div className="sel-chips" style={{
      left: `max(8px, min(${sx - 60}px, calc(100vw - 220px)))`,
      top: Math.max(60, sy - 30),
    }}>
      <button className="chip" onClick={() => st.setRoomShapeEditing(true)}>
        <Pencil size={12} /> {r.label}
      </button>
      <button className="chip danger" aria-label="Delete" onClick={() => st.deleteRoomShape(r.id)}>
        <Trash2 size={12} />
      </button>
      <button className="chip" aria-label="Deselect" onClick={() => st.setSelectedRoomShape(null)}><X size={12} /></button>
    </div>
  )
}

/** Delete chip for a tapped ink stroke. */
export function StrokeChips() {
  const selectedStroke = useStore((s) => s.selectedStroke)
  const strokes = useStore((s) => s.strokes)
  const view = useStore((s) => s.view)
  const locked = useStore((s) => s.locked)
  const s2 = strokes.find((x) => x.id === selectedStroke)
  if (!s2 || locked) return null
  const mid = s2.pts[Math.floor(s2.pts.length / 2)]
  const rad = (view.rot * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const sx = view.tx + view.k * (mid.x * cos - mid.y * sin)
  const sy = view.ty + view.k * (mid.x * sin + mid.y * cos)
  const st = useStore.getState()
  return (
    <div className="sel-chips" style={{
      left: `max(8px, min(${sx - 40}px, calc(100vw - 160px)))`,
      top: Math.max(60, sy - 52),
    }}>
      <button className="chip danger" onClick={() => st.deleteStroke(s2.id)}>
        <Trash2 size={12} /> Delete
      </button>
      <button className="chip" aria-label="Deselect" onClick={() => st.setSelectedStroke(null)}><X size={12} /></button>
    </div>
  )
}

/** Marker type palette shown while the marker tool is armed. */
function MarkerKindRow() {
  const markerKind = useStore((s) => s.markerKind)
  const setMarkerKind = useStore((s) => s.setMarkerKind)
  return (
    <div className="quickbar-row kinds">
      {MARKER_KINDS.map((m) => (
        <button key={m.kind} className={`qpill kind ${markerKind === m.kind ? 'on' : ''}`}
          onClick={() => setMarkerKind(m.kind as MarkerKind)}>
          <span className="kind-dot" style={{ background: m.color }} />
          {m.name}
        </button>
      ))}
    </div>
  )
}

/**
 * Floating degree readout + lock, top-centre of the canvas — quick access to the
 * two things worth checking mid-edit. Compass TYPE lives only in the Compass card
 * in the side panel/sheet now: a row of terse number pills (16/32/8/Grid/Dial)
 * floating over the drawing read as unexplained clutter, not a control.
 */
export function QuickBar() {
  const closed = useStore((s) => s.closed)
  const hasBg = useStore((s) => s.bg.kind !== 'none')
  const tool = useStore((s) => s.tool)
  const northDeg = useStore((s) => s.northDeg)
  const setNorth = useStore((s) => s.setNorth)
  const locked = useStore((s) => s.locked)
  const setLocked = useStore((s) => s.setLocked)
  const setTool = useStore((s) => s.setTool)
  const [degOpen, setDegOpen] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!degOpen) return
    const onDown = (e: PointerEvent) => {
      if (popRef.current?.contains(e.target as Node)) return
      // capture phase: a canvas tap should only dismiss, not also fire the armed tool
      if ((e.target as Element).closest?.('[data-canvas]')) e.stopPropagation()
      setDegOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [degOpen])

  const armed = tool === 'calibrate' || tool === 'trace' || tool === 'center' || tool === 'north' || tool === 'marker' || tool === 'draw' || tool === 'room'
  if (!hasBg || (!closed && !armed)) return null

  return (
    <div className="quickbar" ref={popRef}>
      {closed && (
      <div className="quickbar-row compact">
        <button className={`qpill deg ${degOpen ? 'on' : ''}`} onClick={() => setDegOpen(!degOpen)}>
          N{northDeg}°
        </button>
        <button className={`qpill lockpill ${locked ? 'on' : ''}`}
          title={locked ? 'Unlock editing' : 'Lock outline, scale & centre'}
          onClick={() => setLocked(!locked)}>
          {locked ? <Lock size={13} /> : <LockOpen size={13} />}
        </button>
      </div>
      )}

      {tool === 'marker' && !locked && <MarkerKindRow />}
      {tool === 'draw' && !locked && <DrawOptionsRow />}
      {tool === 'room' && !locked && <RoomOptionsRow />}
      <ToolHint />

      {degOpen && closed && (
        <div className="deg-pop">
          <NorthDial size={96} />
          <div className="deg-steppers">
            {[-5, -0.5, 0.5, 5].map((d) => (
              <button key={d} className="chip"
                onClick={() => setNorth(useStore.getState().northDeg + d)}>
                {d > 0 ? `+${d}` : d}°
              </button>
            ))}
          </div>
          <div className="deg-steppers">
            <button className="chip" onClick={() => { setDegOpen(false); setTool('north') }}>
              <Navigation size={11} /> From plan arrow
            </button>
            <button className="chip" onClick={() => setNorth(0)}>0°</button>
            <button className="chip" onClick={() => setDegOpen(false)}><X size={11} /> Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** View rotation control — twist with two fingers, or use these buttons. */
export function RotateChip() {
  const hasBg = useStore((s) => s.bg.kind !== 'none')
  const rot = useStore((s) => s.view.rot)
  const tool = useStore((s) => s.tool)
  const calA = useStore((s) => s.calA)
  const calB = useStore((s) => s.calB)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      // capture phase: a canvas tap should only dismiss, not also fire the armed tool
      if ((e.target as Element).closest?.('[data-canvas]')) e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [open])

  // the cal-bar takes this exact spot on mobile once both pins are down
  if (!hasBg || (tool === 'calibrate' && calA && calB)) return null
  const send = (detail: { delta?: number; set?: number }) =>
    window.dispatchEvent(new CustomEvent('vastu:rotate', { detail }))
  const shown = Math.round((((rot % 360) + 540) % 360 - 180) * 10) / 10

  return (
    <div className="rotate-chip" ref={ref}>
      <button className={`qpill ${shown !== 0 ? 'on' : ''}`} onClick={() => setOpen(!open)}
        title="Rotate the view (or twist with two fingers)">
        <RotateCcw size={12} /> {shown}°
      </button>
      {open && (
        <div className="rotate-pop">
          {[-90, -15, 15, 90].map((d) => (
            <button key={d} className="chip" onClick={() => send({ delta: d })}>
              {d > 0 ? `+${d}` : d}°
            </button>
          ))}
          <button className="chip" onClick={() => { send({ set: 0 }); setOpen(false) }}>Straighten</button>
        </div>
      )}
    </div>
  )
}

/** One-tap close button while tracing — no need to hit the first point precisely. */
export function CloseChip() {
  const tool = useStore((s) => s.tool)
  const closed = useStore((s) => s.closed)
  const n = useStore((s) => s.pts.length)
  const locked = useStore((s) => s.locked)
  if (locked || closed || tool !== 'trace' || n < 3) return null
  return (
    <button className="close-chip" onClick={() => useStore.getState().closePolygon()}>
      <Check size={15} /> Close outline · {n} points
    </button>
  )
}

/** Contextual actions for a tapped marker — with its computed zone & pada. */
export function MarkerChips() {
  const selectedMarker = useStore((s) => s.selectedMarker)
  const markers = useStore((s) => s.markers)
  const pts = useStore((s) => s.pts)
  const bulges = useStore((s) => s.bulges)
  const closed = useStore((s) => s.closed)
  const centerOverride = useStore((s) => s.centerOverride)
  const northDeg = useStore((s) => s.northDeg)
  const view = useStore((s) => s.view)
  const locked = useStore((s) => s.locked)
  const editing = useStore((s) => s.markerEditing)

  const m = markers.find((x) => x.id === selectedMarker)
  if (!m || editing) return null

  const st = useStore.getState()
  let place: string | null = null
  if (closed && pts.length >= 3) {
    const c = centerOverride ?? centroid(sampledPolygon(pts, bulges, true))
    const pl = placementOf(m.p, c, northDeg)
    if (m.kind === 'entrance') {
      const q = GATE_QUALITY[pl.pada.code]
      const mark = q?.v === 'good' ? '✓ ' : q?.v === 'caution' ? '! ' : ''
      place = `${mark}${pl.pada.code} ${pl.pada.devta} · ${pl.bearing.toFixed(1)}°`
    } else {
      const rule = PLACEMENT_RULES[m.kind]
      const key = pl.zone.key
      const verdict = !rule ? ''
        : rule.ideal.includes(key) ? '✓ ideal · '
          : rule.good.includes(key) ? '✓ good · '
            : rule.avoid.includes(key) ? '✕ avoid · '
              : rule.caution.includes(key) ? '! caution · ' : ''
      place = `${verdict}${key} — ${pl.zone.name}`
    }
  }

  const rad = (view.rot * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const sx = view.tx + view.k * (m.p.x * cos - m.p.y * sin)
  const sy = view.ty + view.k * (m.p.x * sin + m.p.y * cos)

  return (
    <div className="sel-chips" style={{
      left: `max(8px, min(${sx - 60}px, calc(100vw - 250px)))`,
      top: Math.max(60, sy - 58),
    }}>
      {place && <span className="chip place">{place}</span>}
      {!locked && (
        <>
          <button className="chip" aria-label="Edit" onClick={() => st.setMarkerEditing(true)}>
            <Pencil size={12} />
          </button>
          <button className="chip danger" aria-label="Delete" onClick={() => { st.deleteMarker(m.id) }}>
            <Trash2 size={12} />
          </button>
        </>
      )}
      <button className="chip" aria-label="Deselect" onClick={() => st.setSelectedMarker(null)}><X size={12} /></button>
    </div>
  )
}

/** Contextual actions for a tapped vertex or edge handle. */
export function SelectionChips() {
  const selectedVertex = useStore((s) => s.selectedVertex)
  const selectedEdge = useStore((s) => s.selectedEdge)
  const pts = useStore((s) => s.pts)
  const bulges = useStore((s) => s.bulges)
  const view = useStore((s) => s.view)
  const locked = useStore((s) => s.locked)

  if (locked) return null
  const st = useStore.getState()

  let world = null as { x: number; y: number } | null
  if (selectedVertex != null && pts[selectedVertex]) world = pts[selectedVertex]
  else if (selectedEdge != null && pts.length >= 2) {
    const p1 = pts[selectedEdge], p2 = pts[(selectedEdge + 1) % pts.length]
    if (p1 && p2) world = edgePoint(p1, p2, bulges[selectedEdge] ?? 0, 0.5)
  }
  if (!world) return null

  const rad = (view.rot * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const sx = view.tx + view.k * (world.x * cos - world.y * sin)
  const sy = view.ty + view.k * (world.x * sin + world.y * cos)
  const clear = () => st.setSelection({ vertex: null, edge: null })

  return (
    <div className="sel-chips" style={{
      left: `max(8px, min(${sx}px, calc(100vw - 180px)))`,
      top: Math.max(60, sy - 54),
    }}>
      {selectedVertex != null && (
        <button className="chip danger" onClick={() => {
          st.deletePoint(selectedVertex)
          clear()
        }}>
          <Trash2 size={12} /> Delete point
        </button>
      )}
      {selectedEdge != null && (
        <>
          <button className="chip" onClick={() => {
            const p1 = st.pts[selectedEdge], p2 = st.pts[(selectedEdge + 1) % st.pts.length]
            st.insertPointOnEdge(selectedEdge, edgePoint(p1, p2, st.bulges[selectedEdge] ?? 0, 0.5), 0.5)
            clear()
          }}>
            <Plus size={12} /> Add point
          </button>
          {Math.abs(bulges[selectedEdge] ?? 0) > 1e-4 && (
            <button className="chip" onClick={() => {
              st.pushHistory()
              st.setBulge(selectedEdge, 0)
              clear()
            }}>
              <Spline size={12} /> Straighten
            </button>
          )}
        </>
      )}
      <button className="chip" aria-label="Deselect" onClick={clear}><X size={12} /></button>
    </div>
  )
}
