import type { ProjectFile } from './types'

export interface ProjectRecord {
  id: string
  name: string
  updatedAt: number
  data: ProjectFile
}

const DB_NAME = 'vastu-studio'
const STORE = 'projects'
const PRESETS = 'compassPresets'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      if (!req.result.objectStoreNames.contains(PRESETS)) {
        req.result.createObjectStore(PRESETS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Run one request in its own transaction and settle only when the TRANSACTION settles.
 *  A write can succeed as a request and still be rolled back: a full disk or quota arrives
 *  as a transaction abort after the request's success event. Resolving on the request made
 *  autosave report success while nothing was stored (and the "autosave failed" warning
 *  never fired); the connection is closed on every outcome. */
function txStore<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let t: IDBTransaction
        try { t = db.transaction(store, mode) } catch (e) { db.close(); reject(e); return }
        let result: T
        const req = run(t.objectStore(store))
        req.onsuccess = () => { result = req.result }
        t.oncomplete = () => { db.close(); resolve(result) }
        t.onabort = () => { db.close(); reject(t.error ?? req.error ?? new Error('Storage refused the write')) }
        t.onerror = () => { /* the abort that follows settles the promise */ }
      }),
  )
}

const tx = <T,>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => txStore(STORE, mode, run)

export const putProject = (rec: ProjectRecord) => tx('readwrite', (s) => s.put(rec)).then(() => undefined)
export const getProject = (id: string) => tx<ProjectRecord | undefined>('readonly', (s) => s.get(id))
export const deleteProjectRecord = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined)
export const listProjects = () =>
  tx<ProjectRecord[]>('readonly', (s) => s.getAll()).then((all) =>
    all
      .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  )
export const getMostRecent = () =>
  tx<ProjectRecord[]>('readonly', (s) => s.getAll()).then((all) =>
    all.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null,
  )

export interface CompassPreset {
  id: string
  name: string
  dataUrl: string
  aspect: number
  createdAt: number
}

export const putPreset = (p: CompassPreset) => txStore(PRESETS, 'readwrite', (s) => s.put(p)).then(() => undefined)
export const deletePreset = (id: string) => txStore(PRESETS, 'readwrite', (s) => s.delete(id)).then(() => undefined)
export const listPresets = () =>
  txStore<CompassPreset[]>(PRESETS, 'readonly', (s) => s.getAll()).then((all) =>
    all.sort((a, b) => a.createdAt - b.createdAt),
  )

export function newProjectId(): string {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `pj${Math.floor(performance.now() * 1000)}`
}

/** Ask the browser not to evict our storage under pressure (best effort). */
export function requestPersistence() {
  try { void navigator.storage?.persist?.() } catch { /* unsupported */ }
}
