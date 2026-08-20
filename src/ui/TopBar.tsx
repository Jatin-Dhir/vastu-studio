import { Check, Download, FolderOpen, Lock, LockOpen, Maximize2, Redo2, Save, Undo2 } from 'lucide-react'
import { useStore } from '../store'
import { requestFit } from '../canvas/fit'
import { exportPng } from '../export'
import { saveProjectFile } from '../importers/project'

const STEPS = ['Import', 'Scale', 'Outline', 'Analyse']

export function TopBar() {
  const bg = useStore((s) => s.bg)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const closed = useStore((s) => s.closed)
  const compassId = useStore((s) => s.compass.id)
  const unit = useStore((s) => s.unit)
  const setUnit = useStore((s) => s.setUnit)
  const undoLen = useStore((s) => s.undoStack.length)
  const redoLen = useStore((s) => s.redoStack.length)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const setTool = useStore((s) => s.setTool)
  const locked = useStore((s) => s.locked)
  const setLocked = useStore((s) => s.setLocked)

  const done = [bg.kind !== 'none', metersPerPx != null, closed, closed && compassId !== 'none']
  const active = done.findIndex((d) => !d)

  const onStep = (i: number) => {
    if (i === 0) window.dispatchEvent(new CustomEvent('vastu:open-file'))
    else if (i === 1) setTool('calibrate')
    else if (i === 2) setTool('trace')
    else if (i === 3 && closed) useStore.getState().setCompass({ id: 'zones16' })
  }

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
        {STEPS.map((label, i) => (
          <button
            key={label}
            className={`step ${done[i] ? 'done' : ''} ${i === active ? 'active' : ''}`}
            onClick={() => onStep(i)}
          >
            <span className="step-num">{done[i] ? <Check size={11} strokeWidth={3.5} /> : i + 1}</span>
            <span className="step-label">{label}</span>
          </button>
        ))}
      </nav>

      {/* mobile: one labelled chip for the current step instead of four dots */}
      <button
        className="step-now"
        onClick={() => onStep(active === -1 ? 3 : active)}
      >
        <span className="step-num">{active === -1 ? <Check size={11} strokeWidth={3.5} /> : active + 1}</span>
        {active === -1 ? 'Ready' : `Next: ${STEPS[active]}`}
      </button>

      <div className="topbar-right">
        <button className={`icon-btn lock-btn ${locked ? 'locked' : ''}`} onClick={() => setLocked(!locked)}
          data-tip={locked ? 'Unlock editing' : 'Lock outline, scale & centre'}>
          {locked ? <Lock size={15} /> : <LockOpen size={15} />}
        </button>
        <div className="seg">
          <button className={unit === 'ft' ? 'on' : ''} onClick={() => setUnit('ft')}>ft</button>
          <button className={unit === 'm' ? 'on' : ''} onClick={() => setUnit('m')}>m</button>
        </div>
        <button className="icon-btn" disabled={undoLen === 0} onClick={undo} data-tip="Undo (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" disabled={redoLen === 0} onClick={redo} data-tip="Redo (Ctrl+Y)">
          <Redo2 size={16} />
        </button>
        <button className="icon-btn hide-mobile" onClick={requestFit} data-tip="Fit view (F)">
          <Maximize2 size={16} />
        </button>
        <div className="vsep hide-mobile" />
        <button className="icon-btn hide-mobile" onClick={() => window.dispatchEvent(new CustomEvent('vastu:open-file'))}
          data-tip="Open file / project">
          <FolderOpen size={16} />
        </button>
        <button className="icon-btn hide-mobile" onClick={saveProjectFile} data-tip="Save project (.vastu)">
          <Save size={16} />
        </button>
        <button className="btn-primary" onClick={() => void exportPng()}>
          <Download size={15} /> <span className="hide-mobile">Export PNG</span>
        </button>
      </div>
    </header>
  )
}
