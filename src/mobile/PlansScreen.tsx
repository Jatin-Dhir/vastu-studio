import { useEffect, useState } from 'react'
import { Camera, Copy, FileUp, Map as MapIcon, MoreHorizontal, Pencil, PenLine, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { deleteProjectRecord, getProject, listProjects, newProjectId, putProject } from '../db'
import { activateProject, switchToProject } from '../importers/project'
import { loadDemo, startBlank } from '../importFile'
import { ActionSheet } from '../ui/ActionSheet'
import { Dialog } from '../ui/Dialogs'
import { requestFit } from '../canvas/fit'
import { haptic } from '../native'

interface Row { id: string; name: string; updatedAt: number }

function when(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Home: every saved plan, and the one big way to start a new one. */
export function PlansScreen() {
  const currentId = useStore((s) => s.currentProjectId)
  const setTab = useStore((s) => s.setMobileTab)
  const setMapOpen = useStore((s) => s.setMapOpen)
  const [rows, setRows] = useState<Row[]>([])
  const [newOpen, setNewOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<Row | null>(null)
  const [renaming, setRenaming] = useState<Row | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null)

  const refresh = () => { void listProjects().then(setRows).catch(() => setRows([])) }
  useEffect(refresh, [currentId])

  const open = async (id: string) => {
    haptic('light')
    const rec = await switchToProject(id)
    setTab('studio')
    if (rec) setTimeout(requestFit, 160)
  }
  const afterNew = () => { setNewOpen(false); setTab('studio'); setTimeout(requestFit, 200) }

  const duplicate = async (row: Row) => {
    const rec = await getProject(row.id)
    if (!rec) return
    await putProject({ ...rec, id: newProjectId(), name: `${rec.name} (copy)`, updatedAt: Date.now() })
    refresh()
  }
  const rename = async () => {
    const name = renameVal.trim()
    const row = renaming
    setRenaming(null)
    if (!row || !name) return
    const rec = await getProject(row.id)
    if (!rec) return
    await putProject({ ...rec, name })
    const st = useStore.getState()
    if (st.currentProjectId === row.id) st.setProjectMeta({ id: row.id, name })
    else st.renameOpenTab(row.id, name)
    refresh()
  }
  const doDelete = async (row: Row) => {
    setConfirmDelete(null)
    await deleteProjectRecord(row.id)
    const st = useStore.getState()
    const wasCurrent = st.currentProjectId === row.id
    st.removeOpenTab(row.id)
    if (wasCurrent) {
      const remaining = useStore.getState().openTabs
      if (remaining.length > 0) await activateProject(remaining[0].id)
      else window.dispatchEvent(new CustomEvent('vastu:reset'))
    }
    refresh()
  }

  return (
    <div className="m-scroll m-plans">
      <header className="m-head m-brand-head">
        <div className="m-brand"><span className="m-mark" aria-hidden /> Vastu <em>Studio</em></div>
        <p>{rows.length === 0 ? 'Your plans will live here.' : `${rows.length} ${rows.length === 1 ? 'plan' : 'plans'}`}</p>
      </header>

      <button className="btn-primary m-btn m-new" onClick={() => setNewOpen(true)}><Plus size={18} /> New plan</button>

      {rows.length === 0 ? (
        <section className="m-empty">
          <h2>Start with a photo of a plan</h2>
          <p>Take a picture of the floor plan or open a PDF. Trace the boundary, set the scale and north, mark the rooms, and the zones read themselves.</p>
          <button className="btn-ghost m-btn" onClick={() => { void loadDemo(); afterNew() }}><Sparkles size={15} /> Try the sample plan</button>
        </section>
      ) : (
        <ul className="m-list">
          {rows.map((r) => (
            <li key={r.id} className={`m-row ${r.id === currentId ? 'current' : ''}`}>
              <button className="m-row-main" onClick={() => void open(r.id)}>
                <b>{r.name}</b>
                <small>{r.id === currentId ? 'Open now · ' : ''}edited {when(r.updatedAt)}</small>
              </button>
              <button className="icon-btn m-row-more" aria-label={`Options for ${r.name}`} onClick={() => setMenuFor(r)}><MoreHorizontal size={18} /></button>
            </li>
          ))}
        </ul>
      )}

      <ActionSheet open={newOpen} title="New plan" onClose={() => setNewOpen(false)} rows={[
        { icon: Camera, label: 'Take a photo', sub: 'Point the camera at the printed plan', onTap: () => window.dispatchEvent(new CustomEvent('vastu:open-camera')) },
        { icon: FileUp, label: 'Choose a file', sub: 'PDF · photo · DXF · .vastu project', onTap: () => window.dispatchEvent(new CustomEvent('vastu:open-file')) },
        { icon: MapIcon, label: 'From Maps', sub: 'Capture the plot from satellite view', onTap: () => setMapOpen(true) },
        { icon: PenLine, label: 'Blank sheet', sub: 'Draw the plan from scratch on a grid', onTap: () => { startBlank(); afterNew() } },
        { icon: Sparkles, label: 'Sample plan', sub: 'A worked example to explore', onTap: () => { void loadDemo(); afterNew() } },
      ]} />

      <ActionSheet open={!!menuFor} title={menuFor?.name ?? ''} onClose={() => setMenuFor(null)} rows={menuFor ? [
        { icon: Pencil, label: 'Rename', onTap: () => { setRenameVal(menuFor.name); setRenaming(menuFor) } },
        { icon: Copy, label: 'Duplicate', onTap: () => void duplicate(menuFor) },
        { icon: Trash2, label: 'Delete', danger: true, onTap: () => setConfirmDelete(menuFor) },
      ] : []} />

      {renaming && (
        <Dialog title="Rename plan" onClose={() => setRenaming(null)} width={360}>
          <input className="m-input" autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void rename() }} />
          <div className="m-dialog-actions">
            <button className="btn-ghost" onClick={() => setRenaming(null)}>Cancel</button>
            <button className="btn-primary" onClick={() => void rename()}>Save</button>
          </div>
        </Dialog>
      )}
      {confirmDelete && (
        <Dialog title={`Delete “${confirmDelete.name}”?`} onClose={() => setConfirmDelete(null)} width={360}>
          <p className="m-dialog-text">The plan, its rooms and its report go with it. This cannot be undone.</p>
          <div className="m-dialog-actions">
            <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Keep</button>
            <button className="btn-danger" onClick={() => void doDelete(confirmDelete)}>Delete</button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
