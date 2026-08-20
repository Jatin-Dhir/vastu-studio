import { useEffect, useState } from 'react'
import { Copy, Download, FilePlus2, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import { Dialog } from './Dialogs'
import { useStore } from '../store'
import { deleteProjectRecord, getProject, listProjects, newProjectId, putProject } from '../db'
import { saveProjectFile } from '../importers/project'
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
  const [rows, setRows] = useState<Row[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')

  const refresh = () => { void listProjects().then(setRows).catch(() => setRows([])) }
  useEffect(refresh, [])

  const open = async (id: string) => {
    const rec = await getProject(id)
    if (!rec) return
    const st = useStore.getState()
    st.loadProject(rec.data)
    st.setProjectMeta({ id: rec.id, name: rec.name })
    st.setProjectsOpen(false)
    setTimeout(requestFit, 120)
    st.toast(`Opened “${rec.name}”`, 'ok')
  }

  const duplicate = async (id: string) => {
    const rec = await getProject(id)
    if (!rec) return
    const copy = { ...rec, id: newProjectId(), name: `${rec.name} (copy)`, updatedAt: Date.now() }
    await putProject(copy)
    refresh()
  }

  const remove = (id: string, name: string) => {
    useStore.getState().toast(`Delete “${name}” permanently?`, 'warn', 'Delete', () => {
      void deleteProjectRecord(id).then(() => {
        if (useStore.getState().currentProjectId === id) {
          useStore.getState().setProjectMeta({ id: null })
        }
        refresh()
      })
    })
  }

  const rename = async (id: string) => {
    const name = renameVal.trim()
    setRenaming(null)
    if (!name) return
    const rec = await getProject(id)
    if (!rec) return
    await putProject({ ...rec, name })
    if (useStore.getState().currentProjectId === id) useStore.getState().setProjectMeta({ id, name })
    refresh()
  }

  return (
    <Dialog title="Projects" onClose={() => setProjectsOpen(false)} width={460}>
      <div className="proj-toolbar">
        <button className="btn-ghost" onClick={() => {
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
        {rows.map((r) => (
          <div key={r.id} className={`proj-row ${r.id === currentProjectId ? 'current' : ''}`}>
            {renaming === r.id ? (
              <input autoFocus className="proj-rename" value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => void rename(r.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') void rename(r.id); if (e.key === 'Escape') setRenaming(null) }} />
            ) : (
              <button className="proj-name" onClick={() => void open(r.id)}>
                <b>{r.name}</b>
                <span>{r.id === currentProjectId ? 'open now · ' : ''}{ago(r.updatedAt)}</span>
              </button>
            )}
            <button className="icon-btn" data-tip="Rename"
              onClick={() => { setRenaming(r.id); setRenameVal(r.name) }}><Pencil size={13} /></button>
            <button className="icon-btn" data-tip="Duplicate" onClick={() => void duplicate(r.id)}><Copy size={13} /></button>
            <button className="icon-btn danger" data-tip="Delete" onClick={() => remove(r.id, r.name)}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <div className="zone-note">Projects live in this browser. For backups or moving devices, use Save .vastu file.</div>
    </Dialog>
  )
}
