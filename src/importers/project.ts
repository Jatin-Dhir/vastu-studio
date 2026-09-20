import type { ProjectFile } from '../types'
import { serializeProject, useStore } from '../store'
import { newProjectId, putProject, getProject, type ProjectRecord } from '../db'
import { shareBlobNative } from '../native'

export function downloadBlob(blob: Blob, filename: string) {
  // dev-only: scripted checks read the generated file back instead of chasing the download
  if (import.meta.env.DEV) (window as unknown as { __lastDownload?: { blob: Blob; filename: string } }).__lastDownload = { blob, filename }
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

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPt = (q: unknown): q is { x: number; y: number } =>
  !!q && typeof q === 'object' && finite((q as { x: unknown }).x) && finite((q as { y: unknown }).y)
const ptList = (v: unknown) => (Array.isArray(v) ? v.filter(isPt) : [])
/** Embedded images must be images the app itself produced — never a remote URL the
 *  renderer would fetch (tracking) or that would taint the export canvas. */
const isDataImage = (v: unknown) => typeof v === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(v)

export function parseProject(text: string): ProjectFile {
  let p: any
  try { p = JSON.parse(text) } catch { throw new Error('This .vastu file is damaged or incomplete — re-export it and try again') }
  if (p?.app !== 'vastu-studio' || !Array.isArray(p.pts) || typeof p.bg?.kind !== 'string') throw new Error('Not a Vastu Studio project file')
  // > 1 rather than !== 1 so legacy files without a numeric version keep loading
  if (typeof p.version === 'number' && p.version > 1) throw new Error('Saved by a newer Vastu Studio — update the app to open it')

  // every number the renderer divides by or indexes with is checked here, once, so a
  // hand-edited or truncated file degrades to "empty" rather than a blank screen
  p.pts = ptList(p.pts)
  p.bulges = Array.isArray(p.bulges) && p.bulges.length === p.pts.length ? p.bulges.map((b: unknown) => (finite(b) ? b : 0)) : undefined
  p.closed = !!p.closed && p.pts.length >= 3
  p.centerOverride = isPt(p.centerOverride) ? p.centerOverride : null
  p.northDeg = finite(p.northDeg) ? ((p.northDeg % 360) + 360) % 360 : 0
  p.metersPerPx = finite(p.metersPerPx) && p.metersPerPx > 0 ? p.metersPerPx : null
  p.unit = p.unit === 'm' ? 'm' : 'ft'
  p.compass = p.compass && typeof p.compass === 'object' ? p.compass : {}
  if (p.compass.customUrl != null && !isDataImage(p.compass.customUrl)) delete p.compass.customUrl
  for (const k of ['scalePct', 'opacity', 'fillPct', 'brahmaPct', 'customRotDeg', 'customAspect'] as const) {
    if (p.compass[k] != null && !finite(p.compass[k])) delete p.compass[k]
  }
  if (p.bg.dataUrl != null && !isDataImage(p.bg.dataUrl)) { p.bg = { ...p.bg, kind: 'none', dataUrl: undefined } }
  if (!finite(p.bg.w) || !finite(p.bg.h)) { p.bg.w = 0; p.bg.h = 0 }
  p.markers = Array.isArray(p.markers) ? p.markers.filter((m: any) => m && typeof m.kind === 'string' && isPt(m.p)) : []
  p.roomShapes = Array.isArray(p.roomShapes)
    ? p.roomShapes.map((r: any) => (r && typeof r.kind === 'string' ? { ...r, pts: ptList(r.pts) } : null)).filter((r: any) => r && r.pts.length >= 2)
    : []
  p.strokes = Array.isArray(p.strokes) ? p.strokes.map((st: any) => (st ? { ...st, pts: ptList(st.pts) } : null)).filter((st: any) => st && st.pts.length >= 1) : []
  p.texts = Array.isArray(p.texts) ? p.texts.filter((t: any) => t && isPt(t.p) && typeof t.text === 'string').map((t: any) => ({ ...t, size: finite(t.size) && t.size > 0 ? t.size : 16 })) : []
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
