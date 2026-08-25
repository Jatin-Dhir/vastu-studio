import {
  Check, Download, Eraser, FileText, FolderOpen, HelpCircle, Image, Lock, LockOpen, Map as MapIcon,
  MapPin, Maximize2, MoreHorizontal, Palette, PenLine, Redo2, Ruler, Save, Square as SquareIcon, Trash2, Undo2, Upload,
} from 'lucide-react'
import { useStore } from '../store'
import { requestFit } from '../canvas/fit'
import { exportPng } from '../export'
import { saveProjectFile } from '../importers/project'
import { ActionSheet, type SheetRow } from './ActionSheet'
import { AppearanceSheet } from './AppearanceSheet'
import { goToStep, useGuide } from './steps'

export function TopBar() {
  const unit = useStore((s) => s.unit)
  const setUnit = useStore((s) => s.setUnit)
  const undoLen = useStore((s) => s.undoStack.length)
  const redoLen = useStore((s) => s.redoStack.length)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const locked = useStore((s) => s.locked)
  const setLocked = useStore((s) => s.setLocked)
  const closed = useStore((s) => s.closed)
  const hasBg = useStore((s) => s.bg.kind !== 'none')
  const hasMarkers = useStore((s) => s.markers.length > 0)
  const hasStrokes = useStore((s) => s.strokes.length > 0)
  const hasRoomShapes = useStore((s) => s.roomShapes.length > 0)
  const hasOutline = useStore((s) => s.pts.length > 0)
  const { track, active } = useGuide()
  const moreOpen = useStore((s) => s.moreOpen)
  const setMoreOpen = useStore((s) => s.setMoreOpen)
  const clearOpen = useStore((s) => s.clearOpen)
  const setClearOpen = useStore((s) => s.setClearOpen)
  const appearanceOpen = useStore((s) => s.appearanceOpen)
  const setAppearanceOpen = useStore((s) => s.setAppearanceOpen)

  const clearRows: SheetRow[] = [
    {
      icon: Image, label: 'Remove background image', disabled: !hasBg,
      sub: 'Keeps your outline, scale, markers and drawings',
      onTap: () => useStore.getState().clearBackground(),
    },
    {
      icon: MapPin, label: 'Remove all markers', disabled: !hasMarkers,
      sub: 'Doors, rooms, objects — everything else stays',
      onTap: () => useStore.getState().clearMarkers(),
    },
    {
      icon: PenLine, label: 'Remove all drawings', disabled: !hasStrokes,
      sub: 'Pen and line annotations only',
      onTap: () => useStore.getState().clearStrokes(),
    },
    {
      icon: SquareIcon, label: 'Remove all room shapes', disabled: !hasRoomShapes,
      sub: 'Drawn rectangles and circles only',
      onTap: () => useStore.getState().clearRoomShapes(),
    },
    {
      icon: Eraser, label: 'Clear the outline', disabled: !hasOutline,
      sub: 'Keeps the background image and scale',
      onTap: () => useStore.getState().clearOutline(),
    },
    {
      icon: Trash2, label: 'Clear everything', danger: true,
      sub: 'Plan, outline, scale, markers and drawings',
      onTap: () => {
        useStore.getState().toast('Clear the plan, outline and scale?', 'warn', 'Clear everything', () => {
          window.dispatchEvent(new CustomEvent('vastu:reset'))
        })
      },
    },
  ]

  const moreRows: SheetRow[] = [
    {
      icon: locked ? Lock : LockOpen,
      label: locked ? 'Unlock editing' : 'Lock the plan',
      sub: locked ? 'Outline, scale and centre are frozen' : 'Freeze outline, scale & centre against stray taps',
      onTap: () => setLocked(!locked),
    },
    {
      icon: Ruler,
      label: 'Units',
      sub: unit === 'ft' ? 'Feet & inches' : 'Metres',
      keepOpen: true,
      onTap: () => setUnit(unit === 'ft' ? 'm' : 'ft'),
      right: (
        <span className="seg" onClick={(e) => e.stopPropagation()}>
          <button className={unit === 'ft' ? 'on' : ''} onClick={() => setUnit('ft')}>ft</button>
          <button className={unit === 'm' ? 'on' : ''} onClick={() => setUnit('m')}>m</button>
        </span>
      ),
    },
    { icon: Palette, label: 'Appearance', sub: 'Theme and accent colour', onTap: () => setAppearanceOpen(true) },
    { icon: Maximize2, label: 'Fit to screen', sub: 'Bring the whole plan into view', onTap: requestFit },
    { icon: Upload, label: 'Import a plan', sub: 'PDF · DXF · photo · .vastu project', onTap: () => window.dispatchEvent(new CustomEvent('vastu:open-file')) },
    { icon: MapIcon, label: 'From Maps', sub: 'Capture the plot from satellite view', onTap: () => useStore.getState().setMapOpen(true) },
    { icon: FolderOpen, label: 'Projects', sub: 'Open, rename, back up', onTap: () => useStore.getState().setProjectsOpen(true) },
    { icon: Save, label: 'Save project file', sub: 'A portable .vastu file of everything', onTap: saveProjectFile },
    { icon: HelpCircle, label: 'Help & gestures', sub: 'How the whole flow works', onTap: () => useStore.getState().setShortcutsOpen(true) },
    { icon: Eraser, label: 'Clear…', sub: 'Remove just the background, markers, drawings or outline', onTap: () => setClearOpen(true) },
  ]

  return (
    <>
    <header className="topbar">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
          <rect x="8.2" y="8.2" width="15.6" height="15.6" rx="1.5" transform="rotate(45 16 16)"
            fill="none" stroke="#D9B45B" strokeWidth="2" />
          <circle cx="16" cy="16" r="2.6" fill="#D9B45B" />
        </svg>
        <span className="brand-name hide-mobile">Vastu <em>Studio</em></span>
      </div>

      <nav className="steps">
        {track.map((t, i) => (
          <button
            key={t.id}
            className={`step ${t.done ? 'done' : ''} ${t.skipped ? 'skipped' : ''} ${i === active ? 'active' : ''}`}
            disabled={!hasBg && t.id !== 'import'}
            onClick={() => goToStep(t.id)}
          >
            <span className="step-num">{t.done ? <Check size={11} strokeWidth={3.5} /> : t.skipped ? '–' : i + 1}</span>
            <span className="step-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* mobile: one labelled chip for the current step — tapping it summons the guide */}
      <button
        className="step-now"
        onClick={() => {
          if (active === -1) { goToStep('report'); return }
          // the guide only renders with the select tool armed and the sheet at peek —
          // clear both so the summon can't silently no-op
          const st = useStore.getState()
          st.setTool('select')
          if (window.innerWidth <= 760) st.setSheetPos('peek')
          window.dispatchEvent(new CustomEvent('vastu:show-guide'))
        }}
      >
        <span className="step-num">{active === -1 ? <Check size={11} strokeWidth={3.5} /> : active + 1}</span>
        {active === -1 ? 'Ready' : `Next: ${track[active].label}`}
      </button>

      <div className="topbar-right">
        <button className={`icon-btn lock-btn hide-mobile ${locked ? 'locked' : ''}`} onClick={() => setLocked(!locked)}
          aria-label={locked ? 'Unlock editing' : 'Lock outline, scale & centre'}
          data-tip={locked ? 'Unlock editing' : 'Lock outline, scale & centre'}>
          {locked ? <Lock size={15} /> : <LockOpen size={15} />}
        </button>
        <div className="seg hide-mobile">
          <button className={unit === 'ft' ? 'on' : ''} onClick={() => setUnit('ft')}>ft</button>
          <button className={unit === 'm' ? 'on' : ''} onClick={() => setUnit('m')}>m</button>
        </div>
        <button className="icon-btn hide-mobile" disabled={undoLen === 0 || locked} onClick={undo}
          aria-label="Undo" data-tip="Undo (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button className="icon-btn hide-mobile" disabled={redoLen === 0 || locked} onClick={redo}
          aria-label="Redo" data-tip="Redo (Ctrl+Y)">
          <Redo2 size={16} />
        </button>
        <button className="icon-btn hide-mobile" onClick={requestFit} aria-label="Fit view" data-tip="Fit view (F)">
          <Maximize2 size={16} />
        </button>
        <div className="vsep hide-mobile" />
        <button className="icon-btn hide-mobile" onClick={() => useStore.getState().setProjectsOpen(true)}
          aria-label="Projects" data-tip="Projects — open, rename, back up">
          <FolderOpen size={16} />
        </button>
        <button className="icon-btn hide-mobile" onClick={saveProjectFile}
          aria-label="Save project file" data-tip="Save project (.vastu)">
          <Save size={16} />
        </button>
        <button className="icon-btn hide-mobile" onClick={() => useStore.getState().setShortcutsOpen(true)}
          aria-label="Help & shortcuts" data-tip="Help & shortcuts (?)">
          <HelpCircle size={16} />
        </button>
        <button className="icon-btn" disabled={!closed} onClick={() => useStore.getState().setReportOpen(true)}
          aria-label="Client report"
          data-tip={closed ? 'Client report — print / share' : 'Close the outline to build a report'}>
          <FileText size={16} />
        </button>
        <button className="btn-primary" aria-label="Export PNG" onClick={() => void exportPng()}>
          <Download size={15} /> <span className="hide-mobile">Export PNG</span>
        </button>
        <button className="icon-btn" aria-label="More" onClick={() => setMoreOpen(true)}>
          <MoreHorizontal size={18} />
        </button>
      </div>
    </header>
    {/* rendered OUTSIDE the header: .topbar's backdrop-filter creates a containing
        block for position:fixed descendants, which was confining this sheet's
        scrim to the 54px topbar strip instead of the real viewport */}
    <ActionSheet open={moreOpen} title="Vastu Studio" rows={moreRows} onClose={() => setMoreOpen(false)} />
    <ActionSheet open={clearOpen} title="Clear…" rows={clearRows} onClose={() => setClearOpen(false)} />
    <AppearanceSheet open={appearanceOpen} onClose={() => setAppearanceOpen(false)} />
    </>
  )
}
