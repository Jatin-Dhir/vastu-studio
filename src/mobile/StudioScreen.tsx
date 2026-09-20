import { useEffect, useMemo } from 'react'
import { Check, ChevronLeft, Crosshair, Eraser, Grid2x2, Lock, LockOpen, MapPin, Maximize2, MoreHorizontal, MousePointer2, Navigation, Pencil, PenLine, Redo2, Ruler, Square, Undo2, Wand2 } from 'lucide-react'
import { useStore } from '../store'
import { CanvasStage } from '../canvas/CanvasStage'
import { requestFit } from '../canvas/fit'
import { CalibrateBar } from '../App'
import { CloseChip, MarkerChips, QuickBar, RoomCloseChip, RoomShapeChips, RotateChip, SelectionChips, StrokeChips, TextChips, ZoneInfoCard } from '../ui/CanvasOverlays'
import { ActionSheet } from '../ui/ActionSheet'
import { ItemsCard } from '../ui/RightPanel'
import { runDetect } from '../ui/TopBar'
import { evaluateVastu } from '../evaluate'
import { centroid, sampledPolygon } from '../geometry'
import { analysisAllowed } from '../auth/gate'
import { COMPASS_META } from '../vastu'
import { formatArea } from '../format'
import { polygonArea } from '../geometry'
import { haptic } from '../native'
import type { CompassId, Tool } from '../types'

type StepId = 'outline' | 'scale' | 'north' | 'rooms' | 'read'

/** A bottom sheet of the studio's own — scrim, grabber, scrollable body. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="m-sheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="m-sheet" role="dialog" aria-label={title}>
        <div className="m-grab" aria-hidden />
        <div className="m-sheet-head"><h2>{title}</h2><button className="btn-ghost m-sheet-done" onClick={onClose}>Done</button></div>
        {children}
      </div>
    </div>
  )
}

/** The editor, phone-sized: the canvas in the middle, one clear next step at the bottom. */
export function StudioScreen() {
  const hasContent = useStore((s) => s.bg.kind !== 'none' || s.pts.length > 0)
  const projectName = useStore((s) => s.projectName)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const pts = useStore((s) => s.pts)
  const bulges = useStore((s) => s.bulges)
  const closed = useStore((s) => s.closed)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const unit = useStore((s) => s.unit)
  const scaleSkipped = useStore((s) => s.scaleSkipped)
  const northSource = useStore((s) => s.northSource)
  const northDeg = useStore((s) => s.northDeg)
  const nItems = useStore((s) => s.markers.length + s.roomShapes.length)
  const reportOpened = useStore((s) => s.reportOpened)
  const calA = useStore((s) => s.calA)
  const calB = useStore((s) => s.calB)
  const locked = useStore((s) => s.locked)
  const undoLen = useStore((s) => s.undoStack.length)
  const redoLen = useStore((s) => s.redoStack.length)
  const setTab = useStore((s) => s.setMobileTab)
  const sheet = useStore((s) => s.mobileSheet)
  const setSheet = useStore((s) => s.setMobileSheet)

  // the stage is a different size from wherever the view was last fitted (another tab, the
  // desktop) — bring the whole plan into view every time the studio appears
  useEffect(() => { const t = window.setTimeout(requestFit, 80); return () => window.clearTimeout(t) }, [hasContent])

  const st = useStore.getState
  const scaled = metersPerPx != null
  const steps: { id: StepId; label: string; done: boolean }[] = [
    { id: 'outline', label: 'Outline', done: closed },
    { id: 'scale', label: 'Scale', done: scaled || scaleSkipped },
    { id: 'north', label: 'North', done: northSource != null },
    { id: 'rooms', label: 'Rooms', done: nItems > 0 },
    { id: 'read', label: 'Read', done: reportOpened },
  ]
  const active: StepId = steps.find((s) => !s.done)?.id ?? 'read'

  const area = useMemo(() => {
    if (!closed || pts.length < 3 || !metersPerPx) return null
    return formatArea(polygonArea(sampledPolygon(pts, bulges, true)) * metersPerPx * metersPerPx, unit)
  }, [closed, pts, bulges, metersPerPx, unit])

  const status = !hasContent ? 'No plan open'
    : tool === 'trace' ? (closed ? 'Outline closed' : `Tracing · ${pts.length} ${pts.length === 1 ? 'corner' : 'corners'}`)
      : [area, `N ${northDeg}°`].filter(Boolean).join(' · ')

  const arm = (t: Tool) => { haptic('light'); setTool(t); setSheet(null) }
  const jump = (id: StepId) => {
    if (id === 'outline') arm('trace')
    else if (id === 'scale') arm('calibrate')
    else if (id === 'north') arm('north')
    else if (id === 'rooms') arm('room')
    else setSheet('analysis')
  }

  /* the action bar: what the current tool needs, else the next step */
  let hint = ''
  let actions: React.ReactNode = null
  if (tool === 'trace' && !closed) {
    hint = pts.length === 0 ? 'Tap each corner of the plot, in order.' : pts.length < 3 ? `${pts.length} placed — keep going round the boundary.` : 'Close the outline when the last corner is placed.'
    actions = (
      <>
        <button className="btn-ghost" disabled={pts.length === 0} onClick={() => st().popPoint()}>Undo corner</button>
        <button className="btn-primary" disabled={pts.length < 3} onClick={() => { st().closePolygon(); setTool('select'); haptic('success') }}>Close outline</button>
      </>
    )
  } else if (tool === 'trace') {
    hint = 'Tap an edge to add a corner, drag corners to adjust.'
    actions = <button className="btn-primary" onClick={() => setTool('select')}>Done</button>
  } else if (tool === 'calibrate') {
    hint = calA && calB ? 'Enter the real length of that line.' : calA ? 'Now tap the other end.' : 'Tap both ends of something with a known length — a wall or a door.'
    actions = calA && calB ? null : (
      <>
        <button className="btn-ghost" onClick={() => { st().setScaleSkipped(true); setTool('select') }}>Skip scale</button>
        <button className="btn-ghost" onClick={() => setTool('select')}>Cancel</button>
      </>
    )
  } else if (tool === 'north') {
    hint = 'Tap the tail, then the tip, of the north arrow printed on the plan.'
    actions = (
      <>
        <button className="btn-ghost" onClick={() => { st().setNorth(northDeg, 'manual'); setTool('select'); haptic('success') }}>Up is north</button>
        <button className="btn-ghost" onClick={() => setTool('select')}>Cancel</button>
      </>
    )
  } else if (tool === 'room') {
    hint = 'Pick the kind above, then drag a box over the room.'
    actions = <button className="btn-primary" onClick={() => setTool('select')}>Done</button>
  } else if (tool === 'marker') {
    hint = 'Pick the kind above, then tap where it is on the plan.'
    actions = <button className="btn-primary" onClick={() => setTool('select')}>Done</button>
  } else if (tool === 'draw') {
    hint = 'Draw notes, lines and arrows on the plan.'
    actions = <button className="btn-primary" onClick={() => setTool('select')}>Done</button>
  } else if (tool === 'center') {
    hint = 'Drag the centre only if the automatic one looks wrong.'
    actions = <button className="btn-primary" onClick={() => setTool('select')}>Done</button>
  } else if (active === 'outline') {
    hint = pts.length > 0 ? 'The outline is not closed yet.' : 'Start by tracing the boundary of the plot.'
    actions = <button className="btn-primary" onClick={() => arm('trace')}><PenLine size={16} /> {pts.length > 0 ? 'Continue tracing' : 'Trace the outline'}</button>
  } else if (active === 'scale') {
    hint = 'Give the plan a real size so areas and distances are true.'
    actions = (
      <>
        <button className="btn-ghost" onClick={() => { st().setScaleSkipped(true) }}>Skip</button>
        <button className="btn-primary" onClick={() => arm('calibrate')}><Ruler size={16} /> Set the scale</button>
      </>
    )
  } else if (active === 'north') {
    hint = 'Which way is north on this plan?'
    actions = (
      <>
        <button className="btn-ghost" onClick={() => { st().setNorth(northDeg, 'manual'); haptic('success') }}>Up is north</button>
        <button className="btn-primary" onClick={() => arm('north')}><Navigation size={16} /> Tap the arrow</button>
      </>
    )
  } else if (active === 'rooms') {
    hint = 'Mark the rooms, the main door and what matters — each gets a verdict.'
    actions = (
      <>
        <button className="btn-ghost" onClick={() => arm('marker')}><MapPin size={16} /> Mark</button>
        <button className="btn-primary" onClick={() => arm('room')}><Square size={16} /> Add a room</button>
      </>
    )
  } else {
    hint = 'Every marked room is read against the 16 zones.'
    actions = (
      <>
        <button className="btn-ghost" onClick={() => setSheet('analysis')}>Read the zones</button>
        <button className="btn-primary" onClick={() => setTab('report')}>Report</button>
      </>
    )
  }

  return (
    <div className="m-studio">
      <header className="m-bar">
        <button className="icon-btn" aria-label="Plans" onClick={() => setTab('plans')}><ChevronLeft size={22} /></button>
        <div className="m-bar-title"><b>{projectName}</b><small>{status}</small></div>
        <button className="icon-btn" aria-label="Undo" disabled={undoLen === 0 || locked} onClick={() => st().undo()}><Undo2 size={18} /></button>
        <button className="icon-btn" aria-label="Redo" disabled={redoLen === 0 || locked} onClick={() => st().redo()}><Redo2 size={18} /></button>
        <button className="icon-btn" aria-label="More" onClick={() => setSheet('tools')}><MoreHorizontal size={20} /></button>
      </header>

      <div className="stage-wrap m-stage">
        <CanvasStage />
        <QuickBar />
        <RotateChip />
        <CloseChip />
        <SelectionChips />
        <MarkerChips />
        <StrokeChips />
        <RoomShapeChips />
        <TextChips />
        <RoomCloseChip />
        <CalibrateBar />
        {!hasContent && (
          <div className="m-stage-empty">
            <p>No plan is open.</p>
            <button className="btn-primary m-btn" onClick={() => setTab('plans')}>Choose or start a plan</button>
          </div>
        )}
      </div>
      <ZoneInfoCard />

      {hasContent && (
        <footer className="m-steps">
          <div className="m-stepstrip" role="tablist" aria-label="Steps">
            {steps.map((s) => (
              <button key={s.id} role="tab" aria-selected={s.id === active}
                className={`m-step ${s.done ? 'done' : ''} ${s.id === active ? 'active' : ''}`} onClick={() => jump(s.id)}>
                {s.done && s.id !== active && <Check size={12} strokeWidth={3} />}{s.label}
              </button>
            ))}
          </div>
          <p className="m-hint">{hint}</p>
          {actions && <div className="m-actions">{actions}</div>}
        </footer>
      )}

      <ActionSheet open={sheet === 'tools'} title="Tools" onClose={() => setSheet(null)} rows={[
        { icon: MousePointer2, label: 'Select and pan', sub: 'Move rooms, adjust corners', onTap: () => arm('select') },
        { icon: PenLine, label: 'Trace the outline', sub: closed ? 'Add or move corners' : 'Tap the corners of the plot', onTap: () => arm('trace') },
        { icon: Ruler, label: 'Set the scale', sub: scaled ? 'Scale is set' : 'Mark a known length', onTap: () => arm('calibrate') },
        { icon: Navigation, label: 'Align north', sub: `North is ${northDeg}°`, onTap: () => arm('north') },
        { icon: Square, label: 'Draw a room', sub: 'Rectangle, circle or traced shape', onTap: () => arm('room') },
        { icon: MapPin, label: 'Mark a door or object', sub: 'Entrance, bed, safe, water…', onTap: () => arm('marker') },
        { icon: Pencil, label: 'Draw on the plan', sub: 'Pen, lines, arrows, notes', onTap: () => arm('draw') },
        { icon: Wand2, label: 'Auto-detect rooms', sub: 'Read room labels printed on the plan', onTap: () => { setSheet(null); void runDetect() } },
        { icon: Crosshair, label: 'Move the centre', sub: 'Only if the automatic centre looks off', onTap: () => arm('center') },
        { icon: Grid2x2, label: 'Compass style', sub: 'Zones, gates, grid · size and labels', onTap: () => setSheet('compass') },
        { icon: Maximize2, label: 'Fit to screen', onTap: () => { setSheet(null); requestFit() } },
        { icon: locked ? LockOpen : Lock, label: locked ? 'Unlock editing' : 'Lock the outline', sub: 'Keeps the boundary, scale and centre from moving', onTap: () => st().setLocked(!locked) },
        { icon: Eraser, label: 'Clear this plan', sub: 'Start the drawing again', danger: true, onTap: () => { st().toast('Clear the plan, outline and rooms?', 'warn', 'Clear everything', () => window.dispatchEvent(new CustomEvent('vastu:reset'))) } },
      ]} />

      {sheet === 'analysis' && <Sheet title="Zones read" onClose={() => setSheet(null)}><AnalysisBody /></Sheet>}
      {sheet === 'compass' && <Sheet title="Compass style" onClose={() => setSheet(null)}><CompassBody /></Sheet>}
    </div>
  )
}

/** The reading: every marked room and object, then the findings. */
function AnalysisBody() {
  const pts = useStore((s) => s.pts)
  const bulges = useStore((s) => s.bulges)
  const closed = useStore((s) => s.closed)
  const centerOverride = useStore((s) => s.centerOverride)
  const northDeg = useStore((s) => s.northDeg)
  const markers = useStore((s) => s.markers)
  const roomShapes = useStore((s) => s.roomShapes)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const unit = useStore((s) => s.unit)
  const brahmaPct = useStore((s) => s.compass.brahmaPct)
  const ok = analysisAllowed(useStore((s) => s.auth), useStore((s) => s.chartsReady))
  const sampled = useMemo(() => sampledPolygon(pts, bulges, closed), [pts, bulges, closed])
  const center = useMemo(() => (closed && pts.length >= 3 ? centerOverride ?? centroid(sampled) : null), [closed, pts.length, centerOverride, sampled])
  if (!closed || !center) return <p className="m-dialog-text">Close the outline first — the zones are drawn from the boundary.</p>
  if (!ok) return <p className="m-dialog-text">The reading needs your account's charts. Sign in on the Account tab.</p>
  const ev = evaluateVastu({ sampled, center, northDeg, markers, roomShapes, metersPerPx, unit, brahmaPct })
  return (
    <div className="m-analysis">
      {markers.length + roomShapes.length === 0
        ? <p className="m-dialog-text">Nothing is marked yet. Add rooms and the main door to get verdicts.</p>
        : <ItemsCard markers={markers} roomShapes={roomShapes} center={center} northDeg={northDeg} />}
      {ev.findings.length > 0 && (
        <section className="card">
          <header className="card-head"><h2>Findings</h2></header>
          <div className="finding-list">
            {ev.findings.map((f, i) => (
              <div key={i} className={`finding-row sev-${f.severity}`}><b>{f.title}</b><span>{f.detail}</span></div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** Compass overlay settings, the few that matter on a phone. */
function CompassBody() {
  const compass = useStore((s) => s.compass)
  const setCompass = useStore((s) => s.setCompass)
  return (
    <div className="m-compass-opts">
      <div className="m-grid2">
        {COMPASS_META.filter((c) => c.id !== 'custom').map((c) => (
          <button key={c.id} className={`m-choice ${compass.id === c.id ? 'on' : ''}`} onClick={() => setCompass({ id: c.id as CompassId })}>
            <b>{c.label}</b><small>{c.sub}</small>
          </button>
        ))}
      </div>
      <label className="m-range"><span>Size <b>{compass.scalePct}%</b></span>
        <input type="range" min={40} max={400} step={5} value={compass.scalePct} onChange={(e) => setCompass({ scalePct: Number(e.target.value) })} /></label>
      <label className="m-range"><span>Zone fill <b>{compass.fillPct}%</b></span>
        <input type="range" min={0} max={100} step={2} value={compass.fillPct} onChange={(e) => setCompass({ fillPct: Number(e.target.value) })} /></label>
      <div className="m-toggles">
        {([['labels', 'Labels'], ['clip', 'Clip to plot'], ['brahmasthan', 'Brahmasthan'], ['degreeRing', 'Degrees'], ['devtas', 'Devtas']] as const).map(([k, label]) => (
          <button key={k} className={`m-toggle ${compass[k] ? 'on' : ''}`} aria-pressed={compass[k]} onClick={() => setCompass({ [k]: !compass[k] })}>{label}</button>
        ))}
      </div>
    </div>
  )
}
