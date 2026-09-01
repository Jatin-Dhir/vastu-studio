import { X } from 'lucide-react'
import { useStore } from '../store'
import { requestFit } from '../canvas/fit'
import { closeTab, switchToProject } from '../importers/project'

/** A slim row of currently-open drawings, in normal flow beneath the top bar (never a floating
 *  overlay — this app's floating chrome has repeatedly fought for the same screen space on
 *  phones). Hidden whenever there's nothing to switch between. */
export function TabStrip() {
  const openTabs = useStore((s) => s.openTabs)
  const currentProjectId = useStore((s) => s.currentProjectId)
  // always mounted so the height can transition instead of the canvas jumping 40px;
  // inert keeps the hidden buttons out of the keyboard tab order while collapsed
  const collapsed = openTabs.length <= 1
  return (
    <div className={`tab-strip ${collapsed ? 'collapsed' : ''}`} inert={collapsed}>
      {openTabs.map((t) => (
        <span key={t.id} className={`tab-item ${t.id === currentProjectId ? 'active' : ''}`}>
          <button className="tab-name" onClick={() => { void switchToProject(t.id).then(() => setTimeout(requestFit, 120)) }}>
            {t.name}
          </button>
          <button className="tab-close" aria-label={`Close ${t.name}`}
            onClick={() => { void closeTab(t.id).then(() => setTimeout(requestFit, 120)) }}>
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  )
}
