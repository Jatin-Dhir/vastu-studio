import { useEffect, useState } from 'react'
import { Copy, Download, FilePlus2, FolderOpen, Pencil, Trash2, X } from 'lucide-react'
import { Dialog } from './Dialogs'
import { useStore } from '../store'
import { deleteProjectRecord, getProject, listProjects, newProjectId, putProject } from '../db'
import { activateProject, closeTab, prepareForNewContent, saveProjectFile, switchToProject } from '../importers/project'
import { requestFit } from '../canvas/fit'

interface Row { id: string; name: string; updatedAt: number }

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function ProjectsModal() {
  const setProjectsOpen = useStore((s) => s.setProjectsOpen)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const openTabs = useStore((s) => s.openTabs)
  const [rows, setRows] = useState<Row[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)

  const refresh = () => { void listProjects().then(setRows).catch(() => setRows([])) }
  useEffect(refresh, [])

  const open = async (id: string) => {
    const rec = await switchToProject(id)
    useStore.getState().setProjectsOpen(false)
    if (!rec) return // already the open tab — nothing else to do
    setTimeout(requestFit, 120)
    useStore.getState().toast(`Opened “${rec.name}”`, 'ok')
  }

  const duplicate = async (id: string) => {
    const rec = await getProject(id)
    if (!rec) return
    const copy = { ...rec, id: newProjectId(), name: `${rec.name} (copy)`, updatedAt: Date.now() }
    await putProject(copy)
    refresh()
  }

  // confirmation lives INLINE in the row (a toast confirm sat top-right, far from the
  // action, and auto-dismissed — easy to miss entirely)
  const doDelete = (id: string) => {
    setConfirming(null)
    // delete from IDB FIRST — closeTab/switchToProject both flush the live drawing back to
    // IDB under its own id, which would silently resurrect it if run before the delete
    void deleteProjectRecord(id).then(async () => {
      const st = useStore.getState()
      const wasCurrent = st.currentProjectId === id
      st.removeOpenTab(id)
      if (wasCurrent) {
        const remaining = useStore.getState().openTabs
        if (remaining.length > 0) await activateProject(remaining[0].id)
        else window.dispatchEvent(new CustomEvent('vastu:reset'))
      }
      refresh()
    })
  }

  const rename = async (id: string) => {
    const name = renameVal.trim()
    setRenaming(null)
    if (!name) return
    const rec = await getProject(id)
    if (!rec) return
    await putProject({ ...rec, name })
    const st = useStore.getState()
    if (st.currentProjectId === id) st.setProjectMeta({ id, name })
    else st.renameOpenTab(id, name)
    refresh()
  }

  return (
    <Dialog title="Projects" onClose={() => setProjectsOpen(false)} width={460}>
      <div className="proj-toolbar">
        <button className="btn-ghost" onClick={() => {
          prepareForNewContent()
          window.dispatchEvent(new CustomEvent('vastu:reset'))
          setProjectsOpen(false)
        }}>
          <FilePlus2 size={14} /> New
        </button>
        <button className="btn-ghost" onClick={() => { saveProjectFile(); }}>
          <Download size={14} /> Save .vastu file
        </button>
        <button className="btn-ghost" onClick={() => {
          setProjectsOpen(false)
          window.dispatchEvent(new CustomEvent('vastu:open-file'))
        }}>
          <FolderOpen size={14} /> Open .vastu file
        </button>
      </div>

      <div className="proj-list">
        {rows.length === 0 && <div className="lbl dim proj-empty">No saved projects yet — everything you work on lands here automatically.</div>}
        {rows.map((r) => {
          const isCurrent = r.id === currentProjectId
          const isOpen = isCurrent || openTabs.some((t) => t.id === r.id)
          if (confirming === r.id) {
            return (
              <div key={r.id} className="proj-row proj-confirm" role="alertdialog" aria-label={`Delete ${r.name}?`}>
                <span className="proj-confirm-q">Delete <b>{r.name}</b> permanently?</span>
                <button className="btn-ghost" autoFocus
                  onClick={() => setConfirming(null)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setConfirming(null) } }}>
                  Cancel
                </button>
                <button className="btn-danger" onClick={() => doDelete(r.id)}>
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            )
          }
          return (
            <div key={r.id} className={`proj-row ${isCurrent ? 'current' : ''}`}>
              {renaming === r.id ? (
                <input autoFocus className="proj-rename" value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={() => void rename(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void rename(r.id)
                    // stop Escape here or the Dialog's window listener closes the whole modal
                    if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null) }
                  }} />
              ) : (
                <button className="proj-name" onClick={() => void open(r.id)}>
                  <b>{r.name}</b>
                  <span>{isCurrent ? 'open now · ' : isOpen ? 'open · ' : ''}{ago(r.updatedAt)}</span>
                </button>
              )}
              {isOpen && (
                <button className="icon-btn" aria-label="Close tab" data-tip="Close tab — keeps it saved"
                  onClick={() => void closeTab(r.id)}><X size={13} /></button>
              )}
              <button className="icon-btn" aria-label="Rename" data-tip="Rename"
                onClick={() => { setRenaming(r.id); setRenameVal(r.name) }}><Pencil size={13} /></button>
              <button className="icon-btn" aria-label="Duplicate" data-tip="Duplicate" onClick={() => void duplicate(r.id)}><Copy size={13} /></button>
              <button className="icon-btn danger" aria-label="Delete" data-tip="Delete" onClick={() => { setRenaming(null); setConfirming(r.id) }}><Trash2 size={13} /></button>
            </div>
          )
        })}
      </div>
      <div className="zone-note">Projects live in this browser. For backups or moving devices, use Save .vastu file.</div>
    </Dialog>
  )
}
