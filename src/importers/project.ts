import type { ProjectFile } from '../types'
import { serializeProject, useStore } from '../store'
import { newProjectId, putProject } from '../db'

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export function saveProjectFile() {
  const s = useStore.getState()
  const data = JSON.stringify(serializeProject(s))
  const name = (s.bg.name?.replace(/\.[^.]+$/, '') || 'plan') + '.vastu'
  downloadBlob(new Blob([data], { type: 'application/json' }), name)
}

export function parseProject(text: string): ProjectFile {
  const p = JSON.parse(text)
  if (p?.app !== 'vastu-studio' || !Array.isArray(p.pts)) throw new Error('Not a Vastu Studio project file')
  return p as ProjectFile
}

const AUTOSAVE_KEY = 'vastu-studio.autosave.v1'

let warnedQuota = false

/** Autosave into the projects library (IndexedDB — no localStorage size limits). */
export function autosave() {
  const s = useStore.getState()
  if (s.bg.kind === 'none' && s.pts.length === 0) return
  let id = s.currentProjectId
  let name = s.projectName
  if (!id) {
    id = newProjectId()
    name = s.bg.name?.replace(/\.[^.]+$/, '') || 'Untitled plan'
    s.setProjectMeta({ id, name })
  }
  putProject({ id, name, updatedAt: Date.now(), data: serializeProject(s) }).catch(() => {
    if (!warnedQuota) {
      warnedQuota = true
      useStore.getState().toast(
        'Autosave failed — browser storage refused the write. Use Save project (.vastu) to keep your work safe',
        'warn',
      )
    }
  })
}

export function loadAutosave(): ProjectFile | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    return parseProject(raw)
  } catch {
    return null
  }
}

export function clearAutosave() {
  try { localStorage.removeItem(AUTOSAVE_KEY) } catch { /* ignore */ }
}
