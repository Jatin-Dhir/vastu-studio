import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './map.css'
import {
  AlertTriangle, Camera, Check, Clock, ImagePlus, Link2, Loader2, LocateFixed,
  RefreshCw, RotateCcw, Search, WifiOff, X, ZoomIn,
} from 'lucide-react'
import { Dialog } from './Dialogs'
import { useStore } from '../store'
import { requestFit } from '../canvas/fit'
import { importMapsScreenshot } from '../importFile'
import { M_PER_FT } from '../format'

const SAT = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  tile: (z: number, x: number, y: number) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  credit: 'Imagery © Esri — Maxar, Earthstar Geographics',
}
/** Label + road overlays shown on top of satellite imagery in the interactive map (not baked into captures). */
const SAT_OVERLAYS = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
]
const OSM = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tile: (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  credit: '© OpenStreetMap contributors',
}

/** Coordinates pasted directly, or inside a Google/Apple Maps link — the precision bridge:
 *  find the plot in the app you like, copy the link or coordinates, paste here. */
function parseCoords(text: string): { lat: number; lon: number } | null {
  const t = text.trim()
  const m =
    t.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/) ??
    t.match(/[?&](?:q|query|ll|center)=(-?\d{1,2}(?:\.\d+)?)(?:%2C|,)\s*(-?\d{1,3}(?:\.\d+)?)/i) ??
    t.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = parseFloat(m[1]), lon = parseFloat(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0) ? { lat, lon } : null
}

/** Google/Apple's short share links carry no coordinates in the text at all — they can't be
 *  expanded client-side (their redirect blocks CORS), so this is purely a guidance problem. */
const SHORT_MAPS_LINK_RE = /(maps\.app\.goo\.gl|goo\.gl\/maps|apple\.co\/|maps\.apple\.com)/i
function isShortMapsLink(text: string): boolean {
  return SHORT_MAPS_LINK_RE.test(text.trim())
}

interface Hit { name: string; lat: number; lon: number }

/* the map remembers where you work — no more starting from all of India every time */
interface MapMemory { lat: number; lng: number; z: number; style: 'sat' | 'osm' }
const MEM_KEY = 'vastu.map.state'
const RECENTS_KEY = 'vastu.map.recents'

function loadMem(): MapMemory | null {
  try { return JSON.parse(localStorage.getItem(MEM_KEY) ?? 'null') } catch { return null }
}
function saveMem(m: MapMemory) {
  try { localStorage.setItem(MEM_KEY, JSON.stringify(m)) } catch { /* private mode */ }
}
function loadRecents(): Hit[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') } catch { return [] }
}
function pushRecent(h: Hit) {
  try {
    const list = loadRecents().filter((r) => Math.abs(r.lat - h.lat) > 0.001 || Math.abs(r.lon - h.lon) > 0.001)
    list.unshift(h)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 6)))
  } catch { /* private mode */ }
}

/** Capture sharpness by zoom — tells the user when they've zoomed enough. */
function sharpness(z: number): { stars: string; note: string; good: boolean } {
  if (z >= 18) return { stars: '★★★★', note: 'sharp capture', good: true }
  if (z >= 17) return { stars: '★★★☆', note: 'good capture', good: true }
  if (z >= 15) return { stars: '★★☆☆', note: 'zoom in for detail', good: false }
  return { stars: '★☆☆☆', note: 'too far out to trace', good: false }
}

/** Rough straight-line distance in metres — plenty accurate for a "same place?" ~500 m check. */
function approxMetersBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const meanLat = ((lat1 + lat2) / 2) * (Math.PI / 180)
  const x = dLon * Math.cos(meanLat)
  return Math.sqrt(x * x + dLat * dLat) * R
}

function resolutionLabel(metersPerPx: number): string {
  const cm = metersPerPx * 100
  return cm < 100 ? `≈ ${cm.toFixed(1)} cm/px` : `≈ ${metersPerPx.toFixed(2)} m/px`
}

/** A rectangle sized like a typical plot, drawn over the crosshair so the current zoom reads as
 *  real-world size rather than an abstract number. */
const FOOTPRINT: Record<'ft' | 'm', { wM: number; hM: number; label: string }> = {
  ft: { wM: 30 * M_PER_FT, hM: 40 * M_PER_FT, label: '30 × 40 ft — a typical plot' },
  m: { wM: 9, hM: 12, label: '9 × 12 m — a typical plot' },
}

/** Query Nominatim and Photon in parallel and merge — better coverage for partial and local names.
 *  `near` biases results toward the current map view, which is what "places around me" needs. */
async function geocode(text: string, near?: { lat: number; lon: number }): Promise<{ hits: Hit[]; ok: boolean }> {
  const q = encodeURIComponent(text.trim())
  const box = near
    ? `&viewbox=${near.lon - 0.4},${near.lat + 0.4},${near.lon + 0.4},${near.lat - 0.4}`
    : ''
  const prox = near ? `&lat=${near.lat}&lon=${near.lon}` : ''
  const lang = `&accept-language=${encodeURIComponent(typeof navigator !== 'undefined' ? navigator.language || 'en' : 'en')}`
  let nomOk = false, phoOk = false
  const nominatim = fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=8${box}${lang}&q=${q}`)
    .then(async (r) => { if (!r.ok) return []; nomOk = true; return await r.json() })
    .then((j: any[]) => (Array.isArray(j) ? j : []).map((h) => ({
      name: String(h.display_name ?? ''), lat: parseFloat(h.lat), lon: parseFloat(h.lon),
    })))
    .catch(() => [] as Hit[])
  const photon = fetch(`https://photon.komoot.io/api/?limit=8${prox}&q=${q}`)
    .then(async (r) => { if (!r.ok) return { features: [] }; phoOk = true; return await r.json() })
    .then((j: any) => (j.features ?? []).map((f: any) => ({
      name: [f.properties?.name, f.properties?.district, f.properties?.city, f.properties?.state, f.properties?.country]
        .filter(Boolean).join(', '),
      lat: f.geometry?.coordinates?.[1], lon: f.geometry?.coordinates?.[0],
    })))
    .catch(() => [] as Hit[])
  const [a, b] = await Promise.all([nominatim, photon])
  const merged: Hit[] = []
  for (const h of [...a, ...b]) {
    if (!h.name || !isFinite(h.lat) || !isFinite(h.lon)) continue
    const dup = merged.some((m) =>
      Math.abs(m.lat - h.lat) < 0.002 && Math.abs(m.lon - h.lon) < 0.002)
    if (!dup) merged.push(h)
    if (merged.length >= 9) break
  }
  return { hits: merged, ok: nomOk || phoOk }
}

interface CapturePreview {
  dataUrl: string
  w: number
  h: number
  metersPerPx: number
  okCount: number
  total: number
  mime: 'image/jpeg' | 'image/png'
  center: { lat: number; lon: number }
  zoomAtCapture: number
  styleAtCapture: 'sat' | 'osm'
}

export function MapModal() {
  const setMapOpen = useStore((s) => s.setMapOpen)
  const unit = useStore((s) => s.unit)
  const mapDiv = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.TileLayer | null>(null)
  const overlayRefs = useRef<L.TileLayer[]>([])
  const markerRef = useRef<L.CircleMarker | null>(null)
  const accuracyRef = useRef<L.Circle | null>(null)
  const footprintRef = useRef<HTMLDivElement>(null)
  const footprintLabelRef = useRef<HTMLSpanElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [style, setStyle] = useState<'sat' | 'osm'>(() => loadMem()?.style ?? 'sat')
  const [zoomNow, setZoomNow] = useState<number>(() => loadMem()?.z ?? 5)
  const [recents, setRecents] = useState<Hit[]>(loadRecents)
  const provider = (st = style) => (st === 'osm' ? { ...OSM, native: 19 } : { ...SAT, native: 19 })
  const shotRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [noResults, setNoResults] = useState(false)
  const [linkHint, setLinkHint] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [captureProgress, setCaptureProgress] = useState<{ done: number; total: number } | null>(null)
  const [preview, setPreview] = useState<CapturePreview | null>(null)
  const debounceRef = useRef<number>(0)
  const searchSeq = useRef(0)
  const cancelledRef = useRef(false)
  /** capture generation — stragglers from a cancelled run must not touch a newer run's state */
  const capSeq = useRef(0)
  const mountedRef = useRef(true)
  /** the last place the user deliberately navigated to (search hit or GPS) — lets a capture's
   *  recent-chip carry a real name instead of mislabeling a panned-away location. */
  const lastPlaceRef = useRef<{ name: string; lat: number; lon: number } | null>(null)

  const sh = sharpness(zoomNow)

  const updateFootprint = () => {
    const map = mapRef.current
    const box = footprintRef.current
    if (!map || !box) return
    const z = map.getZoom()
    const lat = map.getCenter().lat
    const mPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z)
    const cfg = FOOTPRINT[useStore.getState().unit]
    box.style.width = `${cfg.wM / mPerPx}px`
    box.style.height = `${cfg.hM / mPerPx}px`
    const label = footprintLabelRef.current
    if (label) label.style.opacity = cfg.wM / mPerPx > 46 && cfg.hM / mPerPx > 26 ? '1' : '0'
  }

  useEffect(() => {
    mountedRef.current = true // StrictMode's setup→cleanup→setup leaves the ref false otherwise
    if (!mapDiv.current) return
    const mem = loadMem()
    const map = L.map(mapDiv.current, {
      center: mem ? [mem.lat, mem.lng] : [20.59, 78.96],
      zoom: mem?.z ?? 5,
      maxZoom: 21,
      attributionControl: false,
    })
    mapRef.current = map
    L.control.scale({ position: 'bottomleft', metric: true, imperial: true, maxWidth: 110 }).addTo(map)
    map.on('zoomend', () => { setZoomNow(map.getZoom()); updateFootprint() })
    map.on('dragstart zoomstart', () => { searchSeq.current++; setSearching(false); setHits([]); setNoResults(false); setLinkHint(false); setSearchFailed(false) })
    updateFootprint()
    if (import.meta.env.DEV) (window as any).__vastuMap = map
    return () => {
      const c = map.getCenter()
      saveMem({ lat: c.lat, lng: c.lng, z: map.getZoom(), style: styleRef.current })
      mountedRef.current = false
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const styleRef = useRef(style)
  useEffect(() => { styleRef.current = style }, [style])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { updateFootprint() }, [unit])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layerRef.current?.remove()
    overlayRefs.current.forEach((l) => l.remove())
    overlayRefs.current = []
    const cfg = provider()
    const opts = { maxZoom: 21, maxNativeZoom: cfg.native, crossOrigin: 'anonymous' as const }
    layerRef.current = L.tileLayer(cfg.url, opts).addTo(map)
    if (style !== 'osm') {
      const ovOpts = { maxZoom: 21, maxNativeZoom: 19, crossOrigin: 'anonymous' as const }
      overlayRefs.current = SAT_OVERLAYS.map((url) => L.tileLayer(url, ovOpts).addTo(map))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style])

  // Escape dismisses the most local thing first (a stitch-in-progress, a review, a dropdown) —
  // only falling through to close the whole modal when none of those are open.
  useEffect(() => {
    const dropdownOpen = hits.length > 0 || noResults || linkHint || searchFailed
    const onKeyCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (capturing) {
        e.stopPropagation()
        cancelledRef.current = true
        capSeq.current++
        setCapturing(false)
        setCaptureProgress(null)
        return
      }
      if (preview) { e.stopPropagation(); setPreview(null); return }
      if (dropdownOpen) {
        e.stopPropagation()
        setHits([]); setNoResults(false); setLinkHint(false); setSearchFailed(false); setActiveIndex(-1)
      }
    }
    window.addEventListener('keydown', onKeyCapture, true)
    return () => window.removeEventListener('keydown', onKeyCapture, true)
  }, [capturing, preview, hits.length, noResults, linkHint, searchFailed])

  const runSearch = async (text: string) => {
    const seq = ++searchSeq.current
    setSearching(true)
    try {
      const c = mapRef.current?.getCenter()
      const zoomedIn = (mapRef.current?.getZoom() ?? 0) >= 8
      const { hits: found, ok } = await geocode(text, c && zoomedIn ? { lat: c.lat, lon: c.lng } : undefined)
      if (seq !== searchSeq.current) return // a newer search superseded this one
      setActiveIndex(-1)
      if (!ok) {
        setHits([]); setNoResults(false); setSearchFailed(true)
      } else {
        setSearchFailed(false)
        setHits(found)
        setNoResults(found.length === 0)
      }
    } finally {
      if (seq === searchSeq.current) setSearching(false)
    }
  }

  const search = (text: string) => {
    setQ(text)
    setNoResults(false)
    setLinkHint(false)
    setSearchFailed(false)
    setActiveIndex(-1)
    window.clearTimeout(debounceRef.current)
    searchSeq.current++ // orphan any in-flight request so it can't repopulate the dropdown
    setSearching(false)
    // pasted coordinates or a Google/Apple Maps link jump straight there
    const co = parseCoords(text)
    if (co) {
      setHits([])
      goto({ name: `${co.lat.toFixed(5)}, ${co.lon.toFixed(5)}`, lat: co.lat, lon: co.lon })
      useStore.getState().toast('Jumped to the pasted location', 'ok')
      return
    }
    if (isShortMapsLink(text)) { setHits([]); setLinkHint(true); return }
    if (text.trim().length < 3) { setHits([]); return }
    setHits([]) // clear stale hits from the previous query while this one is in flight
    debounceRef.current = window.setTimeout(() => void runSearch(text), 450)
  }

  const clearSearch = () => {
    setQ(''); setHits([]); setNoResults(false); setLinkHint(false); setSearchFailed(false); setActiveIndex(-1)
    window.clearTimeout(debounceRef.current)
    searchSeq.current++
    setSearching(false)
    searchInputRef.current?.focus()
  }

  const goto = (h: Hit) => {
    setHits([])
    setNoResults(false)
    setLinkHint(false)
    setSearchFailed(false)
    setActiveIndex(-1)
    setQ(h.name.split(',').slice(0, 2).join(','))
    const shortName = h.name.split(',').slice(0, 2).join(', ')
    pushRecent({ ...h, name: shortName })
    setRecents(loadRecents())
    lastPlaceRef.current = { name: shortName, lat: h.lat, lon: h.lon }
    const map = mapRef.current
    if (!map) return
    map.setView([h.lat, h.lon], 18)
    accuracyRef.current?.remove()
    accuracyRef.current = null
    markerRef.current?.remove()
    markerRef.current = L.circleMarker([h.lat, h.lon], {
      radius: 9, color: '#D9B45B', weight: 2.5, fillColor: '#D9B45B', fillOpacity: 0.25,
    }).addTo(map)
  }

  const removeRecent = (i: number) => {
    const list = recents.filter((_, j) => j !== i)
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)) } catch { /* private mode */ }
    setRecents(list)
  }

  const zoomToSharp = () => { mapRef.current?.setZoom(18) }

  const cancelCapture = () => {
    cancelledRef.current = true
    capSeq.current++
    setCapturing(false)
    setCaptureProgress(null)
  }

  const beginCapture = async () => {
    const map = mapRef.current
    if (!map || capturing) return
    cancelledRef.current = false
    const gen = ++capSeq.current
    setCapturing(true)
    setCaptureProgress(null)
    try {
      const captureStyle = style
      const cfg = provider(captureStyle)
      const z = Math.round(map.getZoom())
      const b = map.getBounds()
      // freeze alongside the bounds — the map can still be navigated mid-stitch (search, locate)
      const centerAtCapture = map.getCenter()
      const zoomAtCapture = map.getZoom()
      let tz = Math.min(cfg.native, z + 2)
      let nw = map.project(b.getNorthWest(), tz)
      let se = map.project(b.getSouthEast(), tz)
      while (Math.max(se.x - nw.x, se.y - nw.y) > 4200 && tz > z) {
        tz--
        nw = map.project(b.getNorthWest(), tz)
        se = map.project(b.getSouthEast(), tz)
      }
      const w = Math.round(se.x - nw.x), h = Math.round(se.y - nw.y)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#101318'
      ctx.fillRect(0, 0, w, h)

      const x0 = Math.floor(nw.x / 256), x1 = Math.floor(se.x / 256)
      const y0 = Math.floor(nw.y / 256), y1 = Math.floor(se.y / 256)
      const total = (x1 - x0 + 1) * (y1 - y0 + 1)
      let done = 0
      setCaptureProgress({ done: 0, total })
      const TILE_TIMEOUT_MS = 15000
      const jobs: Promise<boolean>[] = []
      for (let tx = x0; tx <= x1; tx++) {
        for (let ty = y0; ty <= y1; ty++) {
          jobs.push(new Promise((resolve) => {
            let settled = false
            const finish = (ok: boolean) => {
              if (settled) return
              settled = true
              done++
              if (gen === capSeq.current) setCaptureProgress({ done, total })
              resolve(ok)
            }
            // a stalled connection must never hang the capture forever
            const timer = window.setTimeout(() => finish(false), TILE_TIMEOUT_MS)
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
              window.clearTimeout(timer)
              try {
                ctx.drawImage(img, Math.round(tx * 256 - nw.x), Math.round(ty * 256 - nw.y))
                finish(true)
              } catch { finish(false) }
            }
            img.onerror = () => { window.clearTimeout(timer); finish(false) }
            img.src = cfg.tile(tz, tx, ty)
          }))
        }
      }
      const results = await Promise.all(jobs)
      if (cancelledRef.current || gen !== capSeq.current || !mountedRef.current) return
      const okCount = results.filter(Boolean).length
      if (okCount === 0) throw new Error('Tiles could not be fetched — check the connection, or screenshot the map and paste it instead')

      // attribution baked into the capture
      ctx.font = '600 13px system-ui, sans-serif'
      const credit = cfg.credit
      const tw = ctx.measureText(credit).width
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(w - tw - 18, h - 26, tw + 18, 26)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fillText(credit, w - tw - 9, h - 8)

      const metersPerPx = (156543.03392 * Math.cos((centerAtCapture.lat * Math.PI) / 180)) / Math.pow(2, tz)
      // street tiles are crisp text/lines (PNG suits them); imagery stays JPEG for size
      const mime: 'image/jpeg' | 'image/png' = captureStyle === 'osm' ? 'image/png' : 'image/jpeg'
      const dataUrl = mime === 'image/jpeg' ? canvas.toDataURL(mime, 0.9) : canvas.toDataURL(mime)
      setPreview({
        dataUrl, w, h, metersPerPx, okCount, total: jobs.length, mime,
        center: { lat: centerAtCapture.lat, lon: centerAtCapture.lng },
        zoomAtCapture, styleAtCapture: captureStyle,
      })
    } catch (err) {
      if (!cancelledRef.current && gen === capSeq.current && mountedRef.current) {
        useStore.getState().toast(err instanceof Error ? err.message : 'Capture failed', 'warn')
      }
    } finally {
      // a cancelled/superseded run's state was already reset, or is owned by the newer run
      if (gen === capSeq.current && mountedRef.current) { setCapturing(false); setCaptureProgress(null) }
    }
  }

  /** The guard rail: never let a tap silently destroy a traced outline, a locked plan, or an
   *  unreadable capture. Each concern is a toast-with-action the user must actively confirm. */
  const attemptCapture = (opts?: { skipReplace?: boolean; skipZoom?: boolean }) => {
    if (capturing || preview) return
    // toast actions fire against a stale render's closure — read zoom from the live map
    const shNow = sharpness(mapRef.current?.getZoom() ?? zoomNow)
    const s = useStore.getState()
    if (s.locked) { s.toast('Plan is locked — tap the padlock to edit', 'warn'); return }
    if (!opts?.skipReplace && s.pts.length >= 3) {
      s.toast('Capturing replaces the current plan, outline and scale', 'warn', 'Replace',
        () => attemptCapture({ skipReplace: true }))
      return
    }
    if (!opts?.skipZoom && !shNow.good) {
      s.toast('Zoomed out too far for a sharp trace — capture anyway?', 'warn', 'Capture anyway',
        () => attemptCapture({ skipReplace: true, skipZoom: true }))
      return
    }
    void beginCapture()
  }

  const confirmCapture = () => {
    if (!preview) return
    const s = useStore.getState()
    const ext = preview.mime === 'image/png' ? 'png' : 'jpg'
    s.replaceBg(
      {
        kind: 'raster', name: `Map capture.${ext}`, dataUrl: preview.dataUrl, w: preview.w, h: preview.h,
        opacity: 1, grayscale: false, invert: false,
      },
      preview.metersPerPx, 'map',
    )
    s.setNorth(0, 'map') // satellite/street tiles are true-north-up
    const last = lastPlaceRef.current
    const near = !!last && approxMetersBetween(last.lat, last.lon, preview.center.lat, preview.center.lon) < 500
    const name = near && last ? (q.trim() || last.name) : `${preview.center.lat.toFixed(4)}, ${preview.center.lon.toFixed(4)}`
    pushRecent({ name, lat: preview.center.lat, lon: preview.center.lon })
    setRecents(loadRecents())
    saveMem({ lat: preview.center.lat, lng: preview.center.lon, z: preview.zoomAtCapture, style: preview.styleAtCapture })
    setPreview(null)
    s.setTool('trace')
    s.setMapOpen(false)
    requestFit()
    s.toast('Map captured — scale and north set automatically. Trace the plot boundary', 'ok')
  }

  const retakeCapture = () => setPreview(null)

  const locateMe = () => {
    if (!navigator.geolocation) { useStore.getState().toast('Location is not available in this browser', 'warn'); return }
    if (locating) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const map = mapRef.current
        if (!map) return
        const acc = pos.coords.accuracy
        const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        lastPlaceRef.current = { name: 'My location', lat: pos.coords.latitude, lon: pos.coords.longitude }
        markerRef.current?.remove()
        markerRef.current = L.circleMarker(ll, {
          radius: 7, color: '#6FC7CE', weight: 3, fillColor: '#6FC7CE', fillOpacity: 0.4,
        }).addTo(map)
        accuracyRef.current?.remove()
        if (isFinite(acc) && acc > 30) {
          accuracyRef.current = L.circle(ll, {
            radius: acc, color: '#6FC7CE', weight: 1, fillColor: '#6FC7CE', fillOpacity: 0.08, dashArray: '4 4',
          }).addTo(map)
          map.fitBounds(accuracyRef.current.getBounds(), { maxZoom: 18, padding: [40, 40] })
        } else {
          accuracyRef.current = null
          map.setView(ll, 18)
        }
        if (isFinite(acc) && acc > 100) {
          useStore.getState().toast(
            `Location is approximate to ±${Math.round(acc)} m — search or paste coordinates for the exact plot`, 'warn',
          )
        }
      },
      (err) => {
        setLocating(false)
        const msg =
          err.code === err.PERMISSION_DENIED ? 'Location access is blocked — allow it in your browser or device settings and retry'
          : err.code === err.TIMEOUT ? 'Location took too long to respond — try again with a clear view of the sky'
          : 'Could not determine your location — search or paste coordinates instead'
        useStore.getState().toast(msg, 'warn')
      },
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  return (
    <Dialog title={preview ? 'Review capture' : 'Import from Maps'} onClose={() => setMapOpen(false)} width={1080} className="map-dialog">
      {!preview && (
        <div className="map-search">
          <Search size={15} />
          <input
            ref={searchInputRef}
            placeholder="Search, or paste a Google Maps link / lat, long…"
            value={q}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && hits.length > 0) {
                e.preventDefault()
                setActiveIndex((i) => (i + 1) % hits.length)
              } else if (e.key === 'ArrowUp' && hits.length > 0) {
                e.preventDefault()
                setActiveIndex((i) => (i <= 0 ? hits.length - 1 : i - 1))
              } else if (e.key === 'Enter') {
                if (hits.length > 0) { goto(hits[activeIndex >= 0 ? activeIndex : 0]) }
                else if (q.trim().length >= 3) { window.clearTimeout(debounceRef.current); void runSearch(q) }
              }
            }}
          />
          {searching && <Loader2 size={15} className="spin" />}
          {!searching && q.length > 0 && (
            <button className="map-search-clear" onClick={clearSearch} aria-label="Clear search"><X size={13} /></button>
          )}
          {(hits.length > 0 || linkHint || searchFailed || (noResults && q.trim().length >= 3 && !searching)) && (
            <div className="map-results">
              {linkHint && (
                <div className="map-linkhint">
                  <Link2 size={13} />
                  <span>
                    Short links don't contain the location. Open the link, then copy the full URL from the
                    browser bar (it has @lat,long), or long-press the spot in Maps and paste the coordinates shown.
                  </span>
                </div>
              )}
              {!linkHint && searchFailed && (
                <div className="map-failhint">
                  <WifiOff size={13} />
                  <span>Couldn't reach the search service — check your connection.</span>
                  <button onClick={() => void runSearch(q)}><RefreshCw size={12} /> Retry</button>
                </div>
              )}
              {!linkHint && !searchFailed && hits.map((h, i) => {
                const [primary, ...rest] = h.name.split(',')
                return (
                  <button key={i} className={i === activeIndex ? 'active' : ''}
                    onMouseEnter={() => setActiveIndex(i)} onClick={() => goto(h)}>
                    <b>{primary.trim()}</b>
                    {rest.length > 0 && <span>{rest.join(',').trim()}</span>}
                  </button>
                )
              })}
              {!linkHint && !searchFailed && hits.length === 0 && noResults && (
                <div className="map-noresults">No places found — try a broader search, or paste a Google Maps link</div>
              )}
            </div>
          )}
        </div>
      )}

      {!preview && recents.length > 0 && q.trim().length === 0 && (
        <div className="map-recents">
          <span className="map-recents-label"><Clock size={11} aria-hidden /> Recent</span>
          {recents.map((r, i) => (
            <span key={i} className="chip map-recent-chip">
              <button className="map-recent-name" onClick={() => goto(r)}>{r.name}</button>
              <button className="map-recent-x" onClick={(e) => { e.stopPropagation(); removeRecent(i) }}
                aria-label={`Remove ${r.name} from recents`}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="map-holder">
        <div ref={mapDiv} className="map-container" />
        {!preview && <div className="map-attrib">{provider().credit}</div>}
        {!preview && !capturing && (
          <button className="map-locate" onClick={locateMe} disabled={locating} aria-label="Locate me" title="Go to my location">
            {locating ? <Loader2 size={17} className="spin" /> : <LocateFixed size={17} />}
          </button>
        )}
        {!preview && (
          <div className="map-footprint" ref={footprintRef} aria-hidden>
            <span className="map-footprint-label" ref={footprintLabelRef}>{FOOTPRINT[unit].label}</span>
          </div>
        )}
        {!preview && (
          <div className="map-cross" aria-hidden>
            <span /><span />
          </div>
        )}
        {capturing && (
          <div className="map-capturing-overlay">
            <Loader2 size={22} className="spin" />
            <span>{captureProgress ? `Capturing… ${captureProgress.done} / ${captureProgress.total} tiles` : 'Capturing…'}</span>
            <button className="btn-ghost" onClick={cancelCapture}>Cancel</button>
          </div>
        )}
        {preview && (
          <div className="map-preview">
            <div className="map-preview-imgwrap">
              <img src={preview.dataUrl} alt="Captured map, ready to review" />
            </div>
            <div className="map-preview-bar">
              <div className="map-preview-info">
                <b>{resolutionLabel(preview.metersPerPx)}</b>
                {preview.styleAtCapture === 'sat' && (
                  <span className="dim">Road &amp; place labels are left out so tracing stays clean.</span>
                )}
                {preview.okCount < preview.total && (
                  <span className="map-preview-warn">
                    <AlertTriangle size={12} /> {preview.total - preview.okCount} of {preview.total} tiles failed — the capture may have gaps
                  </span>
                )}
              </div>
              <div className="map-preview-actions">
                <button className="btn-ghost" onClick={retakeCapture}><RotateCcw size={15} /> Back to map</button>
                <button className="btn-primary" onClick={confirmCapture}><Check size={15} /> Use this capture</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!preview && (
        <div className="map-foot">
          <div className="seg">
            <button className={style === 'sat' ? 'on' : ''} onClick={() => setStyle('sat')} disabled={capturing}>Satellite</button>
            <button className={style === 'osm' ? 'on' : ''} onClick={() => setStyle('osm')} disabled={capturing}>Street</button>
          </div>
          <button
            type="button"
            className={`map-quality ${sh.good ? 'good' : 'tappable'}`}
            aria-label={`Capture sharpness: ${sh.note}`}
            tabIndex={sh.good ? -1 : 0}
            onClick={() => { if (!sh.good) zoomToSharp() }}
            title={sh.good ? undefined : 'Zoom in for a sharper capture'}
          >
            <span aria-hidden>{sh.stars}</span> <em>{sh.note}</em>
            {!sh.good && <ZoomIn size={11} aria-hidden />}
          </button>
          <span className="lbl dim">Scale &amp; north are set automatically from the capture.</span>
          <button className="btn-ghost" onClick={() => shotRef.current?.click()}
            title="Screenshot your plot in Google/Apple Maps, keep it north-up and include the scale bar, then tap the two ends of the scale bar and type the printed distance">
            <ImagePlus size={15} /> Import screenshot
          </button>
          <button className={`btn-primary${!capturing && !sh.good ? ' muted' : ''}`} onClick={() => attemptCapture()} disabled={capturing}>
            {capturing ? <Loader2 size={15} className="spin" /> : <Camera size={15} />}
            {capturing
              ? (captureProgress ? `Capturing… ${captureProgress.done}/${captureProgress.total}` : 'Capturing…')
              : (sh.good ? 'Capture view' : 'Zoom in to capture')}
          </button>
        </div>
      )}
      {!preview && (
        <div className="map-alt">
          Prefer Google-quality imagery? Screenshot your plot in Google/Apple Maps (keep it north-up,
          include the scale bar), then
          <button className="linkish" onClick={() => shotRef.current?.click()}> import the screenshot</button> —
          tap the two ends of its scale bar and type the printed distance.
          <input ref={shotRef} type="file" accept="image/*" hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setMapOpen(false)
                void importMapsScreenshot(f)
              }
              e.target.value = ''
            }} />
        </div>
      )}
      {!preview && <div className="map-credit">{provider().credit} · Search © OpenStreetMap Nominatim</div>}
    </Dialog>
  )
}
