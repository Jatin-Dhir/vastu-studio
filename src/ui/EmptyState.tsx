import { FileUp, Map as MapIcon, Sparkles } from 'lucide-react'
import { useStore } from '../store'
import { importFromUrl, loadDemo } from '../importFile'

export function EmptyState() {
  const setMapOpen = useStore((s) => s.setMapOpen)

  const sample = (url: string, name: string) => {
    importFromUrl(url, name).catch(() =>
      useStore.getState().toast('Could not load the sample file', 'warn'),
    )
  }

  return (
    <div className="empty-wrap">
      <div className="empty-card">
        <svg className="empty-mark" width="64" height="64" viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="32" r="29" fill="none" stroke="#D9B45B" strokeWidth="1" opacity="0.35" />
          <rect x="15.5" y="15.5" width="33" height="33" rx="2" transform="rotate(45 32 32)"
            fill="none" stroke="#D9B45B" strokeWidth="1.8" />
          <rect x="22.5" y="22.5" width="19" height="19" rx="1.5"
            fill="none" stroke="#D9B45B" strokeWidth="1" opacity="0.55" />
          <circle cx="32" cy="32" r="3.4" fill="#D9B45B" />
        </svg>
        <h1>Vastu Studio</h1>
        <p className="empty-tag">
          Import a floor plan, trace the boundary, and the Brahmasthan, zones and
          entrances are located for you — measured, centred, and to scale.
        </p>

        <div className="empty-drop" onClick={() => window.dispatchEvent(new CustomEvent('vastu:open-file'))}>
          <FileUp size={20} />
          <div>
            <b>{typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
              ? 'Tap to choose a file'
              : 'Drop a file here or click to browse'}</b>
            <span>PDF · DXF (AutoCAD) · PNG / JPG · .vastu project</span>
          </div>
        </div>

        <div className="empty-actions">
          <button className="btn-ghost" onClick={() => setMapOpen(true)}>
            <MapIcon size={15} /> From Maps
          </button>
          <button className="btn-ghost" onClick={loadDemo}>
            <Sparkles size={15} /> Sample plan
          </button>
        </div>

        <div className="empty-foot">
          <span>Paste a screenshot any time with <kbd>Ctrl</kbd>+<kbd>V</kbd></span>
          <span className="dot">·</span>
          <button className="linkish" onClick={() => sample(`${import.meta.env.BASE_URL}samples/sample-plan.dxf`, 'sample-plan.dxf')}>
            try a DXF
          </button>
          <span className="dot">·</span>
          <button className="linkish" onClick={() => sample(`${import.meta.env.BASE_URL}samples/sample-plan.pdf`, 'sample-plan.pdf')}>
            try a PDF
          </button>
        </div>
        <div className="empty-foot dim">
          Using AutoCAD .dwg? Save it as .dxf first (SAVEAS → DXF).
        </div>
      </div>
    </div>
  )
}
