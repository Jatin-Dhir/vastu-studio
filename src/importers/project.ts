import type { ProjectFile } from '../types'
import { serializeProject, useStore } from '../store'
import { newProjectId, putProject, getProject, type ProjectRecord } from '../db'
import { shareBlobNative } from '../native'

export function downloadBlob(blob: Blob, filename: string) {
  // inside the Android/iOS shell an anchor download silently does nothing —
  // route through the native share sheet there; the web keeps the download
  void shareBlobNative(blob, filename).then((handled) => {
    if (handled) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  })
}

export function saveProjectFile() {
  const s = useStore.getState()
  const data = JSON.stringify(serializeProject(s))
  const name = (s.bg.name?.replace(/\.[^.]+$/, '') || 'plan') + '.vastu'
  downloadBlob(new Blob([data], { type: 'application/json' }), name)
}

export function parseProject(text: string): ProjectFile {
  let p: any
  try { p = JSON.parse(text) } catch { throw new Error('This .vastu file is damaged or incomplete — re-export it and try again') }
  if (p?.app !== 'vastu-studio' || !Array.isArray(p.pts) || typeof p.bg?.kind !== 'string') throw new Error('Not a Vastu Studio project file')
  // > 1 rather than !== 1 so legacy files without a numeric version keep loading
  if (typeof p.version === 'number' && p.version > 1) throw new Error('Saved by a newer Vastu Studio — update the app to open it')
  return p as ProjectFile
}

const AUTOSAVE_KEY = 'vastu-studio.autosave.v1'

let warnedQuota = false

export function isEmptyDrawing(s: Pick<ReturnType<typeof useStore.getState>, 'bg' | 'pts' | 'markers' | 'strokes' | 'roomShapes' | 'texts'>): boolean {
  return s.bg.kind === 'none' && s.pts.length === 0 && s.markers.length === 0 && s.strokes.length === 0 && s.roomShapes.length === 0 && s.texts.length === 0
}

/** Autosave into the projects library (IndexedDB — no localStorage size limits). */
export function autosave() {
  const s = useStore.getState()
  if (isEmptyDrawing(s)) return
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

/** Loads a saved project into the workspace with NO flush of whatever's currently live —
 *  only safe to use when the caller has already made sure there's nothing worth keeping
 *  (e.g. right after deleting the record that's currently active). Everything else should
 *  go through switchToProject/closeTab instead. */
export async function activateProject(id: string): Promise<ProjectRecord | null> {
  const rec = await getProject(id)
  if (!rec) return null
  useStore.getState().loadProject(rec.data)
  useStore.getState().setProjectMeta({ id: rec.id, name: rec.name })
  return rec
}

/** Switches the active tab to a different saved project, flushing the outgoing one first
 *  so a quick switch never drops an edit still sitting in the 900ms autosave debounce. */
export async function switchToProject(id: string): Promise<ProjectRecord | null> {
  if (useStore.getState().currentProjectId === id) return null
  autosave()
  return activateProject(id)
}

/** Called once new content (an import, a map capture) is validated and about to replace the
 *  workspace. A truly empty tab is reused in place (today's behavior). A tab with real content
 *  is flushed to IDB and detached instead — it stays open in openTabs, just no longer active,
 *  so nothing already on screen is ever destroyed by opening something else. */
export function prepareForNewContent() {
  const s = useStore.getState()
  if (isEmptyDrawing(s)) return
  autosave()
  s.setProjectMeta({ id: null, name: 'Untitled plan' })
}

/** Closes a tab (removes it from the open list) without deleting the saved project — it stays
 *  reachable from the Projects library. If it was active, flushes it first, then activates a
 *  neighboring tab, or falls back to a blank canvas if it was the last one open. */
export async function closeTab(id: string): Promise<void> {
  const wasCurrent = useStore.getState().currentProjectId === id
  if (wasCurrent) autosave()
  const before = useStore.getState().openTabs
  const idx = before.findIndex((t) => t.id === id)
  useStore.getState().removeOpenTab(id)
  if (!wasCurrent) return
  const after = useStore.getState().openTabs
  if (after.length === 0) { window.dispatchEvent(new CustomEvent('vastu:reset')); return }
  await activateProject(after[Math.min(idx, after.length - 1)].id)
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
