import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Camera, Loader2, LocateFixed, Search } from 'lucide-react'
import { Dialog } from './Dialogs'
import { useStore } from '../store'
import { requestFit } from '../canvas/fit'

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

/** Optional sharper imagery via the user's own free MapTiler key (stored only on this device). */
const HD = (key: string) => ({
  url: `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${key}`,
  tile: (z: number, x: number, y: number) => `https://api.maptiler.com/tiles/satellite-v2/${z}/${x}/${y}.jpg?key=${key}`,
  credit: '© MapTiler © Maxar',
})
const getMtKey = () => { try { return localStorage.getItem('vastu.maptilerKey') ?? '' } catch { return '' } }
const setMtKey = (k: string) => { try { localStorage.setItem('vastu.maptilerKey', k.trim()) } catch { /* private mode */ } }

interface Hit { name: string; lat: number; lon: number }

/** Query Nominatim and Photon in parallel and merge — better coverage for partial and local names.
 *  `near` biases results toward the current map view, which is what "places around me" needs. */
async function geocode(text: string, near?: { lat: number; lon: number }): Promise<Hit[]> {
  const q = encodeURIComponent(text.trim())
  const box = near
    ? `&viewbox=${near.lon - 0.4},${near.lat + 0.4},${near.lon + 0.4},${near.lat - 0.4}`
    : ''
  const prox = near ? `&lat=${near.lat}&lon=${near.lon}` : ''
  const nominatim = fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=8${box}&q=${q}`)
    .then(async (r) => (r.ok ? await r.json() : []))
    .then((j: any[]) => (Array.isArray(j) ? j : []).map((h) => ({
      name: String(h.display_name ?? ''), lat: parseFloat(h.lat), lon: parseFloat(h.lon),
    })))
    .catch(() => [] as Hit[])
  const photon = fetch(`https://photon.komoot.io/api/?limit=8${prox}&q=${q}`)
    .then(async (r) => (r.ok ? await r.json() : { features: [] }))
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
  return merged
}

export function MapModal() {
  const setMapOpen = useStore((s) => s.setMapOpen)
  const mapDiv = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.TileLayer | null>(null)
  const overlayRefs = useRef<L.TileLayer[]>([])
  const markerRef = useRef<L.CircleMarker | null>(null)
  const [style, setStyle] = useState<'sat' | 'osm' | 'hd'>('sat')
  const [hdAsk, setHdAsk] = useState(false)
  const [hdKeyInput, setHdKeyInput] = useState('')
  const provider = (st = style) =>
    st === 'hd' && getMtKey() ? { ...HD(getMtKey()), native: 20 }
      : st === 'osm' ? { ...OSM, native: 19 }
        : { ...SAT, native: 19 }
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [noResults, setNoResults] = useState(false)
  const [searching, setSearching] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const debounceRef = useRef<number>(0)
  const searchSeq = useRef(0)

  useEffect(() => {
    if (!mapDiv.current) return
    const map = L.map(mapDiv.current, {
      center: [20.59, 78.96],
      zoom: 5,
      maxZoom: 21,
      attributionControl: false,
    })
    mapRef.current = map
    if (import.meta.env.DEV) (window as any).__vastuMap = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

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

  const runSearch = async (text: string) => {
    const seq = ++searchSeq.current
    setSearching(true)
    try {
      const c = mapRef.current?.getCenter()
      const zoomedIn = (mapRef.current?.getZoom() ?? 0) >= 8
      const found = await geocode(text, c && zoomedIn ? { lat: c.lat, lon: c.lng } : undefined)
      if (seq !== searchSeq.current) return // a newer search superseded this one
      setHits(found)
      setNoResults(found.length === 0)
    } finally {
      if (seq === searchSeq.current) setSearching(false)
    }
  }

  const search = (text: string) => {
    setQ(text)
    setNoResults(false)
    window.clearTimeout(debounceRef.current)
    if (text.trim().length < 3) { setHits([]); return }
    debounceRef.current = window.setTimeout(() => void runSearch(text), 450)
  }

  const goto = (h: Hit) => {
    setHits([])
    setNoResults(false)
    setQ(h.name.split(',').slice(0, 2).join(','))
    const map = mapRef.current
    if (!map) return
    map.setView([h.lat, h.lon], 18)
    markerRef.current?.remove()
    markerRef.current = L.circleMarker([h.lat, h.lon], {
      radius: 9, color: '#D9B45B', weight: 2.5, fillColor: '#D9B45B', fillOpacity: 0.25,
    }).addTo(map)
  }

  const capture = async () => {
    const map = mapRef.current
    if (!map || capturing) return
    setCapturing(true)
    try {
      const cfg = provider()
      const z = Math.round(map.getZoom())
      const b = map.getBounds()
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
      const jobs: Promise<boolean>[] = []
      for (let tx = x0; tx <= x1; tx++) {
        for (let ty = y0; ty <= y1; ty++) {
          jobs.push(new Promise((resolve) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
              try {
                ctx.drawImage(img, Math.round(tx * 256 - nw.x), Math.round(ty * 256 - nw.y))
                resolve(true)
              } catch { resolve(false) }
            }
            img.onerror = () => resolve(false)
            img.src = cfg.tile(tz, tx, ty)
          }))
        }
      }
      const results = await Promise.all(jobs)
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

      const lat = map.getCenter().lat
      const metersPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, tz)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      const s = useStore.getState()
      s.replaceBg(
        {
          kind: 'raster', name: 'Map capture.jpg', dataUrl, w, h,
          opacity: 1, grayscale: false, invert: false,
        },
        metersPerPx, 'map',
      )
      s.setNorth(0, 'map') // satellite/street tiles are true-north-up
      s.setTool('trace')
      s.setMapOpen(false)
      requestFit()
      s.toast('Map captured — scale and north set automatically. Trace the plot boundary', 'ok')
    } catch (err) {
      useStore.getState().toast(err instanceof Error ? err.message : 'Capture failed', 'warn')
    } finally {
      setCapturing(false)
    }
  }

  const locateMe = () => {
    if (!navigator.geolocation) { useStore.getState().toast('Location is not available in this browser', 'warn'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapRef.current
        if (!map) return
        map.setView([pos.coords.latitude, pos.coords.longitude], 18)
        markerRef.current?.remove()
        markerRef.current = L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
          radius: 7, color: '#6FC7CE', weight: 3, fillColor: '#6FC7CE', fillOpacity: 0.4,
        }).addTo(map)
      },
      () => useStore.getState().toast('Could not get your location — allow location access and retry', 'warn'),
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  return (
    <Dialog title="Import from Maps" onClose={() => setMapOpen(false)} width={780} className="map-dialog">
      <div className="map-search">
        <Search size={15} />
        <input
          placeholder="Search a place, address or landmark…"
          value={q}
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim().length >= 3) {
              window.clearTimeout(debounceRef.current)
              void runSearch(q)
            }
          }}
        />
        {searching && <Loader2 size={15} className="spin" />}
        {(hits.length > 0 || (noResults && q.trim().length >= 3 && !searching)) && (
          <div className="map-results">
            {hits.map((h, i) => (
              <button key={i} onClick={() => goto(h)}>{h.name}</button>
            ))}
            {hits.length === 0 && <div className="map-noresults">No places found — try a broader search</div>}
          </div>
        )}
      </div>

      <div className="map-holder">
        <div ref={mapDiv} className="map-container" />
        <button className="map-locate" onClick={locateMe} title="Go to my location">
          <LocateFixed size={17} />
        </button>
        <div className="map-cross" aria-hidden>
          <span /><span />
        </div>
      </div>

      <div className="map-foot">
        <div className="seg">
          <button className={style === 'sat' ? 'on' : ''} onClick={() => setStyle('sat')}>Satellite</button>
          <button className={style === 'osm' ? 'on' : ''} onClick={() => setStyle('osm')}>Street</button>
          <button className={style === 'hd' ? 'on' : ''}
            title="Sharper imagery with your own free MapTiler key"
            onClick={() => { if (getMtKey()) setStyle('hd'); else setHdAsk(true) }}>
            HD
          </button>
        </div>
        <span className="lbl dim">Zoom right into your plot — capture inherits scale & north automatically.</span>
        <button className="btn-primary" onClick={() => void capture()} disabled={capturing}>
          {capturing ? <Loader2 size={15} className="spin" /> : <Camera size={15} />}
          {capturing ? 'Capturing…' : 'Capture view'}
        </button>
      </div>
      {hdAsk && (
        <div className="hd-key-row">
          <span>Free key from <b>maptiler.com</b> → paste it here (stays on this device):</span>
          <div className="hd-key-input">
            <input value={hdKeyInput} placeholder="MapTiler API key"
              onChange={(e) => setHdKeyInput(e.target.value)} />
            <button className="btn-ghost" onClick={() => setHdAsk(false)}>Cancel</button>
            <button className="btn-primary" disabled={hdKeyInput.trim().length < 8}
              onClick={() => { setMtKey(hdKeyInput); setHdAsk(false); setStyle('hd') }}>
              Use HD
            </button>
          </div>
        </div>
      )}
      <div className="map-credit">{provider().credit} · Search © OpenStreetMap Nominatim</div>
    </Dialog>
  )
}
