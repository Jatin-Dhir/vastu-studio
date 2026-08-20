import type { ProjectFile } from './types'

export interface ProjectRecord {
  id: string
  name: string
  updatedAt: number
  data: ProjectFile
}

const DB_NAME = 'vastu-studio'
const STORE = 'projects'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        t.oncomplete = () => db.close()
      }),
  )
}

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

export function newProjectId(): string {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `pj${Math.floor(performance.now() * 1000)}`
}

/** Ask the browser not to evict our storage under pressure (best effort). */
export function requestPersistence() {
  try { void navigator.storage?.persist?.() } catch { /* unsupported */ }
}
