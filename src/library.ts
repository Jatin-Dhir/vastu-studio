import { getProject, listProjects, newProjectId, putProject } from './db'
import { autosave, downloadBlob, sanitizeProject } from './importers/project'

/** A library backup is an ordinary .vastu file whose body is this shape — so every way of
 *  opening a project (the button, drag and drop, the phone's file picker) restores one. */
export const LIBRARY_FORMAT = 'vastu-studio-library'

export interface LibraryFile {
  format: typeof LIBRARY_FORMAT
  version: 1
  exportedAt: string
  projects: { name: string; updatedAt: number; data: unknown }[]
}

export function isLibraryFile(v: unknown): v is LibraryFile {
  return !!v && typeof v === 'object' && (v as { format?: unknown }).format === LIBRARY_FORMAT
    && Array.isArray((v as { projects?: unknown }).projects)
}

/** Lists that show the library re-read it when a restore adds to it. */
export const LIBRARY_CHANGED = 'vastu:library-changed'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Every saved project in one file, to move them to another device or keep them safe from a
 *  cleared browser. Written as parts, one project at a time, so a library of large scans never
 *  has to become one giant string. Resolves with how many projects went in. */
export async function backupLibrary(): Promise<number> {
  // the open plan's latest edit, not the version from before the autosave debounce: this
  // write is queued ahead of the reads below, and IndexedDB runs them in that order
  autosave()
  const rows = await listProjects()
  const parts: BlobPart[] = [`{"format":"${LIBRARY_FORMAT}","version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"projects":[`]
  let n = 0
  for (const row of rows) {
    const rec = await getProject(row.id)
    if (!rec) continue
    parts.push((n ? ',' : '') + JSON.stringify({ name: rec.name, updatedAt: rec.updatedAt, data: rec.data }))
    n++
  }
  parts.push(']}')
  if (n > 0) downloadBlob(new Blob(parts, { type: 'application/json' }), `vastu-projects-${today()}.vastu`)
  return n
}

export interface RestoreResult { added: number; skipped: number; failed: number }

/** Adds a backup's projects to this library, each under a fresh id, so a backup can never
 *  overwrite a newer version of the same plan. One already here (same name, same last edit)
 *  is skipped, so opening the same backup twice does not double the list. */
export async function restoreLibrary(file: LibraryFile): Promise<RestoreResult> {
  const key = (name: string, at: number) => `${name}\u0000${at}`
  const here = new Set((await listProjects()).map((r) => key(r.name, r.updatedAt)))
  const out: RestoreResult = { added: 0, skipped: 0, failed: 0 }
  for (const entry of file.projects) {
    try {
      const e = entry as { name?: unknown; updatedAt?: unknown; data?: unknown }
      const name = typeof e.name === 'string' && e.name.trim() ? e.name.trim().slice(0, 120) : 'Restored plan'
      const updatedAt = typeof e.updatedAt === 'number' && Number.isFinite(e.updatedAt) && e.updatedAt > 0 ? e.updatedAt : Date.now()
      if (here.has(key(name, updatedAt))) { out.skipped++; continue }
      const data = sanitizeProject(e.data)
      await putProject({ id: newProjectId(), name, updatedAt, data })
      here.add(key(name, updatedAt))
      out.added++
    } catch {
      out.failed++
    }
  }
  if (out.added) window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED))
  return out
}

export function restoreSummary(r: RestoreResult): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const parts = [r.added ? `Restored ${plural(r.added, 'project', 'projects')}` : 'Nothing new to restore']
  if (r.skipped) parts.push(`${plural(r.skipped, 'was', 'were')} already here`)
  if (r.failed) parts.push(`${r.failed} could not be read`)
  return parts.join(' · ')
}
