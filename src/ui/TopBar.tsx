import { useState } from 'react'
import {
  Check, Download, FileText, FolderOpen, HelpCircle, Lock, LockOpen, Map as MapIcon,
  Maximize2, MoreHorizontal, Redo2, Ruler, Save, Trash2, Undo2, Upload,
} from 'lucide-react'
import { useStore } from '../store'
import { requestFit } from '../canvas/fit'
import { exportPng } from '../export'
import { saveProjectFile } from '../importers/project'
import { ActionSheet, type SheetRow } from './ActionSheet'
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
  const { track, active } = useGuide()
  const [moreOpen, setMoreOpen] = useState(false)

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
      right: (
        <span className="seg" onClick={(e) => e.stopPropagation()}>
          <button className={unit === 'ft' ? 'on' : ''} onClick={() => setUnit('ft')}>ft</button>
          <button className={unit === 'm' ? 'on' : ''} onClick={() => setUnit('m')}>m</button>
        </span>
      ),
    },
    { icon: Maximize2, label: 'Fit to screen', sub: 'Bring the whole plan into view', onTap: requestFit },
    { icon: Upload, label: 'Import a plan', sub: 'PDF · DXF · photo · .vastu project', onTap: () => window.dispatchEvent(new CustomEvent('vastu:open-file')) },
    { icon: MapIcon, label: 'From Maps', sub: 'Capture the plot from satellite view', onTap: () => useStore.getState().setMapOpen(true) },
    { icon: FolderOpen, label: 'Projects', sub: 'Open, rename, back up', onTap: () => useStore.getState().setProjectsOpen(true) },
    { icon: Save, label: 'Save project file', sub: 'A portable .vastu file of everything', onTap: saveProjectFile },
    { icon: HelpCircle, label: 'Help & gestures', sub: 'How the whole flow works', onTap: () => useStore.getState().setShortcutsOpen(true) },
    {
      icon: Trash2, label: 'Start fresh', sub: 'Clear the plan, outline and scale', danger: true,
      onTap: () => {
        useStore.getState().toast('Clear the plan, outline and scale?', 'warn', 'Clear everything', () => {
          window.dispatchEvent(new CustomEvent('vastu:reset'))
        })
      },
    },
  ]

  return (
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
          if (active === -1) goToStep('report')
          else window.dispatchEvent(new CustomEvent('vastu:show-guide'))
        }}
      >
        <span className="step-num">{active === -1 ? <Check size={11} strokeWidth={3.5} /> : active + 1}</span>
        {active === -1 ? 'Ready' : `Next: ${track[active].label}`}
      </button>

      <div className="topbar-right">
        <button className={`icon-btn lock-btn hide-mobile ${locked ? 'locked' : ''}`} onClick={() => setLocked(!locked)}
          data-tip={locked ? 'Unlock editing' : 'Lock outline, scale & centre'}>
          {locked ? <Lock size={15} /> : <LockOpen size={15} />}
        </button>
        <div className="seg hide-mobile">
          <button className={unit === 'ft' ? 'on' : ''} onClick={() => setUnit('ft')}>ft</button>
          <button className={unit === 'm' ? 'on' : ''} onClick={() => setUnit('m')}>m</button>
        </div>
        <button className="icon-btn hide-mobile" disabled={undoLen === 0} onClick={undo} data-tip="Undo (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button className="icon-btn hide-mobile" disabled={redoLen === 0} onClick={redo} data-tip="Redo (Ctrl+Y)">
          <Redo2 size={16} />
        </button>
        <button className="icon-btn hide-mobile" onClick={requestFit} data-tip="Fit view (F)">
          <Maximize2 size={16} />
        </button>
        <div className="vsep hide-mobile" />
        <button className="icon-btn hide-mobile" onClick={() => useStore.getState().setProjectsOpen(true)}
          data-tip="Projects — open, rename, back up">
          <FolderOpen size={16} />
        </button>
        <button className="icon-btn hide-mobile" onClick={saveProjectFile} data-tip="Save project (.vastu)">
          <Save size={16} />
        </button>
        <button className="icon-btn hide-mobile" onClick={() => useStore.getState().setShortcutsOpen(true)}
          data-tip="Help & shortcuts (?)">
          <HelpCircle size={16} />
        </button>
        <button className="icon-btn" disabled={!closed} onClick={() => useStore.getState().setReportOpen(true)}
          data-tip={closed ? 'Client report — print / share' : 'Close the outline to build a report'}>
          <FileText size={16} />
        </button>
        <button className="btn-primary" onClick={() => void exportPng()}>
          <Download size={15} /> <span className="hide-mobile">Export PNG</span>
        </button>
        <button className="icon-btn show-mobile" aria-label="More" onClick={() => setMoreOpen(true)}>
          <MoreHorizontal size={18} />
        </button>
      </div>

      <ActionSheet open={moreOpen} title="Vastu Studio" rows={moreRows} onClose={() => setMoreOpen(false)} />
    </header>
  )
}
