import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Camera, Loader2, Search } from 'lucide-react'
import { Dialog } from './Dialogs'
import { useStore } from '../store'
import { requestFit } from '../canvas/fit'

const SAT = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  tile: (z: number, x: number, y: number) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  credit: 'Imagery © Esri — Maxar, Earthstar Geographics',
}
const OSM = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tile: (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  credit: '© OpenStreetMap contributors',
}

interface Hit { name: string; lat: number; lon: number }

async function geocode(text: string): Promise<Hit[]> {
  const q = encodeURIComponent(text.trim())
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${q}`)
    if (r.ok) {
      const j = await r.json()
      const hits = (Array.isArray(j) ? j : []).map((h: any) => ({
        name: String(h.display_name ?? ''), lat: parseFloat(h.lat), lon: parseFloat(h.lon),
      })).filter((h: Hit) => h.name && isFinite(h.lat))
      if (hits.length) return hits
    }
  } catch { /* fall through to Photon */ }
  try {
    const r = await fetch(`https://photon.komoot.io/api/?limit=6&q=${q}`)
    if (r.ok) {
      const j = await r.json()
      return (j.features ?? []).map((f: any) => ({
        name: [f.properties?.name, f.properties?.city, f.properties?.state, f.properties?.country]
          .filter(Boolean).join(', '),
        lat: f.geometry?.coordinates?.[1], lon: f.geometry?.coordinates?.[0],
      })).filter((h: Hit) => h.name && isFinite(h.lat))
    }
  } catch { /* no results */ }
  return []
}

export function MapModal() {
  const setMapOpen = useStore((s) => s.setMapOpen)
  const mapDiv = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.TileLayer | null>(null)
  const [style, setStyle] = useState<'sat' | 'osm'>('sat')
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
      maxZoom: 19,
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
    const cfg = style === 'sat' ? SAT : OSM
    layerRef.current = L.tileLayer(cfg.url, { maxZoom: 19, crossOrigin: 'anonymous' }).addTo(map)
  }, [style])

  const runSearch = async (text: string) => {
    const seq = ++searchSeq.current
    setSearching(true)
    try {
      const found = await geocode(text)
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
    mapRef.current?.setView([h.lat, h.lon], 18)
  }

  const capture = async () => {
    const map = mapRef.current
    if (!map || capturing) return
    setCapturing(true)
    try {
      const cfg = style === 'sat' ? SAT : OSM
      const z = Math.round(map.getZoom())
      const b = map.getBounds()
      let tz = Math.min(19, z + 2)
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
      s.setNorth(0) // satellite/street tiles are true-north-up
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

  return (
    <Dialog title="Import from Maps" onClose={() => setMapOpen(false)} width={780}>
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
        <div className="map-cross" aria-hidden>
          <span /><span />
        </div>
      </div>

      <div className="map-foot">
        <div className="seg">
          <button className={style === 'sat' ? 'on' : ''} onClick={() => setStyle('sat')}>Satellite</button>
          <button className={style === 'osm' ? 'on' : ''} onClick={() => setStyle('osm')}>Street</button>
        </div>
        <span className="lbl dim">Zoom right into your plot — the capture inherits real-world scale.</span>
        <button className="btn-primary" onClick={() => void capture()} disabled={capturing}>
          {capturing ? <Loader2 size={15} className="spin" /> : <Camera size={15} />}
          {capturing ? 'Capturing…' : 'Capture view'}
        </button>
      </div>
      <div className="map-credit">{style === 'sat' ? SAT.credit : OSM.credit} · Search © OpenStreetMap Nominatim</div>
    </Dialog>
  )
}
