import type { BgState, ProjectFile } from './types'
import { uid } from './uid'

export interface ProjectRecord {
  id: string
  name: string
  updatedAt: number
  data: ProjectFile
}

const DB_NAME = 'vastu-studio'
const STORE = 'projects'
const PRESETS = 'compassPresets'
/** id, name and updatedAt only — what the library lists and "most recent" needs. Listing used
 *  to deserialise every project whole, background included: 15 plans with 4 MB scans took
 *  three ~300 ms tasks and 70 MB of heap on a phone just to show their names. */
const META = 'projectMeta'
/** A project's heavy background (raster data URL or DXF text), kept apart from the project
 *  record so an edit rewrites a few KB, not the whole scan: autosave used to put() a 12 MB
 *  record 900 ms after every marker. Written only when the background actually changes. */
const BGS = 'projectBackgrounds'
const VERSION = 3

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      const up = req.transaction!
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(PRESETS)) db.createObjectStore(PRESETS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(BGS)) db.createObjectStore(BGS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(META)) {
        const meta = db.createObjectStore(META, { keyPath: 'id' })
        // one pass over the existing library, inside the upgrade itself. Nothing is moved or
        // deleted: old records keep their inline background and are split on their next save.
        up.objectStore(STORE).openCursor().onsuccess = (e) => {
          const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result
          if (!cur) return
          const { id, name, updatedAt } = cur.value as ProjectRecord
          meta.put({ id, name, updatedAt })
          cur.continue()
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Run requests in one transaction and settle only when the TRANSACTION settles. A write can
 *  succeed as a request and still be rolled back: a full disk or quota arrives as a
 *  transaction abort after the request's success event. Resolving on the request made
 *  autosave report success while nothing was stored; the connection closes on every outcome. */
function txRun<T>(stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction, done: (v: T) => void) => void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let t: IDBTransaction
        try { t = db.transaction(stores, mode) } catch (e) { db.close(); reject(e); return }
        let result: T
        t.oncomplete = () => { db.close(); resolve(result) }
        t.onabort = () => { db.close(); reject(t.error ?? new Error('Storage refused the write')) }
        t.onerror = () => { /* the abort that follows settles the promise */ }
        try { run(t, (v) => { result = v }) } catch (e) { try { t.abort() } catch { /* already done */ } db.close(); reject(e) }
      }),
  )
}

function txStore<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return txRun<T>([store], mode, (t, done) => {
    const req = run(t.objectStore(store))
    req.onsuccess = () => done(req.result)
  })
}

type StoredBg = BgState & { stored?: boolean }
interface BgRecord { id: string; dataUrl?: string; dxfText?: string }

const heavyOf = (bg: BgState) => bg.dataUrl ?? bg.dxfText ?? null
/** The background last written (or read) per project. The store keeps that same string, so
 *  the check is a pointer comparison on every autosave except the first after a load. */
const lastBg = new Map<string, string>()

export function putProject(rec: ProjectRecord): Promise<void> {
  const bg = rec.data.bg
  const heavy = heavyOf(bg)
  const writeBg = heavy != null && lastBg.get(rec.id) !== heavy
  const slimBg: StoredBg = heavy != null ? { ...bg, dataUrl: undefined, dxfText: undefined, stored: true } : bg
  const slim: ProjectRecord = { ...rec, data: { ...rec.data, bg: slimBg } }
  return txRun<void>([STORE, META, BGS], 'readwrite', (t) => {
    t.objectStore(STORE).put(slim)
    t.objectStore(META).put({ id: rec.id, name: rec.name, updatedAt: rec.updatedAt })
    if (writeBg) t.objectStore(BGS).put({ id: rec.id, dataUrl: bg.dataUrl, dxfText: bg.dxfText } satisfies BgRecord)
    else if (heavy == null) t.objectStore(BGS).delete(rec.id)
  }).then(() => {
    if (heavy != null) lastBg.set(rec.id, heavy)
    else lastBg.delete(rec.id)
  })
}

export function getProject(id: string): Promise<ProjectRecord | undefined> {
  return txRun<{ rec: ProjectRecord | undefined; fromBgStore: boolean }>([STORE, BGS], 'readonly', (t, done) => {
    const req = t.objectStore(STORE).get(id)
    req.onsuccess = () => {
      const rec = req.result as ProjectRecord | undefined
      const bg = rec?.data?.bg as StoredBg | undefined
      // a record from before the split still carries its background inline
      if (!rec || !bg?.stored) { done({ rec, fromBgStore: false }); return }
      const bgReq = t.objectStore(BGS).get(id)
      bgReq.onsuccess = () => {
        const heavy = bgReq.result as BgRecord | undefined
        const { stored: _stored, ...rest } = bg
        const full: BgState = heavy ? { ...rest, dataUrl: heavy.dataUrl, dxfText: heavy.dxfText } : { ...rest, kind: 'none' }
        done({ rec: { ...rec, data: { ...rec.data, bg: full } }, fromBgStore: !!heavy })
      }
    }
  }).then(({ rec, fromBgStore }) => {
    // only a background that already sits in the background store counts as written — an
    // inline one from an old record must be written there at its first save, not skipped
    const heavy = rec ? heavyOf(rec.data.bg) : null
    if (rec && heavy != null && fromBgStore) lastBg.set(rec.id, heavy)
    else if (rec) lastBg.delete(rec.id)
    return rec
  })
}

export function deleteProjectRecord(id: string): Promise<void> {
  lastBg.delete(id)
  return txRun<void>([STORE, META, BGS], 'readwrite', (t) => {
    t.objectStore(STORE).delete(id)
    t.objectStore(META).delete(id)
    t.objectStore(BGS).delete(id)
  })
}

export const listProjects = () =>
  txStore<{ id: string; name: string; updatedAt: number }[]>(META, 'readonly', (s) => s.getAll()).then((all) =>
    all.sort((a, b) => b.updatedAt - a.updatedAt),
  )

export const getMostRecent = () =>
  listProjects().then((all) => (all[0] ? getProject(all[0].id).then((r) => r ?? null) : null))

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
  return uid('pj')
}

/** Ask the browser not to evict our storage under pressure (best effort). Chrome, Edge and
 *  Safari decide silently; Firefox answers persist() with a permission prompt, which at boot
 *  would greet a first visit with a question about storage. There, only a grant the person
 *  already gave (from the site's permissions) is renewed. */
export function requestPersistence() {
  try {
    const storage = navigator.storage
    if (!storage?.persist) return
    if (!/\bFirefox\//.test(navigator.userAgent)) { void storage.persist().catch(() => {}); return }
    void navigator.permissions?.query({ name: 'persistent-storage' as PermissionName })
      .then((st) => { if (st.state === 'granted') void storage.persist().catch(() => {}) })
      .catch(() => {})
  } catch { /* unsupported */ }
}
