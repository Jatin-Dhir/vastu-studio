import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ImagePlus, Info, LocateFixed, Navigation, RotateCcw, XCircle } from 'lucide-react'
import { useStore } from '../store'
import { centroid, perimeter, polygonArea, sampledPolygon } from '../geometry'
import { placementOf, zoneRows } from '../analysis'
import { ANALYSIS_DISCLAIMER, markerKindMeta } from '../vastu'
import { evaluateVastu, roomShapeAnchor } from '../evaluate'
import { processCompassImage } from '../imageTools'
import { deletePreset, listPresets, putPreset, type CompassPreset } from '../db'
import { formatArea, formatLen, formatScale } from '../format'
import { COMPASS_META, ZONES16 } from '../vastu'
import type { CompassId, Marker, Pt, Tool } from '../types'
import { detectPdfScaleRatio, hasPdfOpen, renderPdfPage } from '../importers/pdf'
import { blobToDataUrl, loadImage } from '../importers/raster'
import { NorthDial } from './NorthDial'

/* ---------- small controls ---------- */

function Slider(props: {
  label: string; value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; fmt?: (v: number) => string
}) {
  const { label, value, min, max, step = 1, onChange, fmt } = props
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{label}</span>
        <b>{fmt ? fmt(value) : `${Math.round(value)}%`}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function Toggle(props: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle ${props.on ? 'on' : ''}`} aria-pressed={props.on} onClick={() => props.onChange(!props.on)}>
      <span className="knob" />
      {props.label}
    </button>
  )
}

/* ---------- compass mini previews ---------- */

function preview(id: string) {
  const c = 20, R = 16
  const wedge = (a0: number, a1: number, r: number) => {
    const p = (a: number) => ({ x: c + r * Math.sin((a * Math.PI) / 180), y: c - r * Math.cos((a * Math.PI) / 180) })
    const q0 = p(a0), q1 = p(a1)
    return `M${c} ${c} L${q0.x} ${q0.y} A${r} ${r} 0 0 1 ${q1.x} ${q1.y} Z`
  }
  switch (id) {
    case 'zones16':
      return (
        <svg viewBox="0 0 40 40">
          {ZONES16.map((z, i) => (
            <path key={z.key} d={wedge(-11.25 + i * 22.5, 11.25 + i * 22.5, R)} fill={z.color} opacity={0.85} />
          ))}
          <circle cx={c} cy={c} r={R} fill="none" stroke="#D9B45B" strokeWidth="1" />
        </svg>
      )
    case 'gates32':
      return (
        <svg viewBox="0 0 40 40">
          <circle cx={c} cy={c} r={R} fill="none" stroke="#D9B45B" strokeWidth="1.2" />
          <circle cx={c} cy={c} r={R * 0.62} fill="none" stroke="#D9B45B" strokeWidth="0.7" opacity="0.6" />
          {Array.from({ length: 32 }, (_, i) => {
            const a = (i * 11.25 * Math.PI) / 180
            return <line key={i} x1={c + Math.sin(a) * R * 0.62} y1={c - Math.cos(a) * R * 0.62}
              x2={c + Math.sin(a) * R} y2={c - Math.cos(a) * R} stroke="#C9CFDD" strokeWidth="0.7" opacity="0.8" />
          })}
        </svg>
      )
    case 'chakra8':
      return (
        <svg viewBox="0 0 40 40">
          <circle cx={c} cy={c} r={R} fill="none" stroke="#D9B45B" strokeWidth="1.2" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * 45 * Math.PI) / 180
            return <line key={i} x1={c} y1={c} x2={c + Math.sin(a) * R} y2={c - Math.cos(a) * R}
              stroke="#C9CFDD" strokeWidth="0.9" opacity="0.85" />
          })}
        </svg>
      )
    case 'grid9':
      return (
        <svg viewBox="0 0 40 40">
          {[0, 1, 2].map((r) => [0, 1, 2].map((col) => (
            <rect key={`${r}${col}`} x={7 + col * 9} y={7 + r * 9} width={8} height={8}
              fill={r === 1 && col === 1 ? '#D9B45B' : 'none'}
              fillOpacity={0.5} stroke="#C9CFDD" strokeWidth="0.8" opacity="0.85" />
          )))}
        </svg>
      )
    case 'dial':
      return (
        <svg viewBox="0 0 40 40">
          <circle cx={c} cy={c} r={R} fill="none" stroke="#D9B45B" strokeWidth="1.2" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * 30 * Math.PI) / 180
            return <line key={i} x1={c + Math.sin(a) * R * 0.78} y1={c - Math.cos(a) * R * 0.78}
              x2={c + Math.sin(a) * R} y2={c - Math.cos(a) * R} stroke="#C9CFDD" strokeWidth="1" />
          })}
          <path d={`M${c} ${c - R} l3 6 h-6 Z`} fill="#F26B57" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 40 40">
          <circle cx={c} cy={c} r={R} fill="none" stroke="#C9CFDD" strokeWidth="1" strokeDasharray="3 3" />
          <path d="M20 13v10m0 0l-4-4m4 4l4-4" stroke="#C9CFDD" strokeWidth="1.6" fill="none"
            strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 20 18)" />
        </svg>
      )
  }
}

function NorthSourceLine() {
  const src = useStore((s) => s.northSource)
  const deg = useStore((s) => s.northDeg)
  const label =
    src === 'map' ? 'auto · from map'
      : src === 'plan' ? 'from plan arrow'
        : src === 'manual' ? 'set manually' : 'assumed up'
  return (
    <div className="row-between">
      <span className="lbl">North {deg}°</span>
      <span className="badge">{label}</span>
    </div>
  )
}

/* ---------- north row ---------- */

function NorthRow() {
  const northDeg = useStore((s) => s.northDeg)
  const setNorth = useStore((s) => s.setNorth)
  // string draft while typing, so clearing / '-' / '315.' doesn't commit 0 and snap the compass
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <div className="north-row">
      <NorthDial />
      <div className="north-fields">
        <label className="field">
          <span>North</span>
          <div className="num-wrap">
            <input type="number" value={draft ?? northDeg} step={0.5}
              onChange={(e) => {
                const v = e.target.value
                setDraft(v)
                const n = parseFloat(v)
                if (Number.isFinite(n)) setNorth(n)
              }}
              onBlur={() => setDraft(null)} />
            <em>°</em>
          </div>
        </label>
        <div className="north-quick">
          <button className="chip" onClick={() => setNorth(useStore.getState().northDeg - 45)}>−45°</button>
          <button className="chip" onClick={() => setNorth(useStore.getState().northDeg + 45)}>+45°</button>
          <button className="chip" onClick={() => setNorth(0)}>Reset</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- zone balance chart ---------- */

function ZoneChart({ pts, center, northDeg }: { pts: Pt[]; center: Pt; northDeg: number }) {
  const unit = useStore((s) => s.unit)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const open = useStore((s) => s.highlightZone)
  const setOpen = useStore((s) => s.setHighlightZone)

  // leaving the panel clears the on-plan highlight
  useEffect(() => () => useStore.getState().setHighlightZone(null), [])

  const rows = useMemo(() => zoneRows(pts, center, northDeg), [pts, center, northDeg])

  if (!rows) return null
  const maxPct = Math.max(...rows.map((r) => r.pct), 0.001)
  const evenX = Math.min(100, (6.25 / maxPct) * 100)
  const strongest = rows.reduce((a, b) => (b.pct > a.pct ? b : a))
  const weakest = rows.reduce((a, b) => (b.pct < a.pct ? b : a))

  return (
    <div className="zone-chart">
      {rows.map((r, i) => {
        const isOpen = open === i
        const delta = r.pct - 6.25
        return (
          <div key={r.key} className={`zone-row-wrap ${isOpen ? 'open' : ''}`}>
            <button className="zone-row" onClick={() => {
              setOpen(isOpen ? null : i)
              // on phones, drop the sheet to half so the highlighted wedge is actually visible
              if (!isOpen && window.innerWidth <= 760 && useStore.getState().sheetPos === 'full') {
                useStore.getState().setSheetPos('half')
              }
            }}>
              <span className="zone-chip" style={{ background: r.color }} />
              <span className="zone-key">{r.key}</span>
              <span className="zone-track">
                <span className="zone-even" style={{ left: `${evenX}%` }} />
                <span className="zone-bar" style={{ width: `${(r.pct / maxPct) * 100}%`, background: r.color }} />
              </span>
              <span className="zone-val">{r.pct.toFixed(1)}%</span>
            </button>
            {isOpen && (
              <div className="zone-detail">
                <div className="zone-detail-head">
                  <b>{r.name}</b>
                  <span className={`zone-delta ${delta >= 0 ? 'pos' : 'neg'}`}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs even share
                  </span>
                </div>
                <div className="zone-detail-theme">{r.theme}</div>
                <div className="zone-detail-stats">
                  {metersPerPx
                    ? <>Area <b>{formatArea(r.areaPx * metersPerPx * metersPerPx, unit)}</b> · {r.pct.toFixed(2)}% of the plot</>
                    : <>{r.pct.toFixed(2)}% of the plot — set the scale for real areas</>}
                </div>
              </div>
            )}
          </div>
        )
      })}
      <div className="zone-summary">
        <span>Strongest <b style={{ color: strongest.color }}>{strongest.key}</b> {strongest.pct.toFixed(1)}%</span>
        <span>Weakest <b style={{ color: weakest.color }}>{weakest.key}</b> {weakest.pct.toFixed(1)}%</span>
      </div>
      <div className="zone-note">Tap a zone to see it highlighted on the plan. Tick = even share (6.25%).</div>
    </div>
  )
}

/* ---------- main panel ---------- */

export function RightPanel() {
  const bg = useStore((s) => s.bg)
  const setBg = useStore((s) => s.setBg)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const scaleSource = useStore((s) => s.scaleSource)
  const unit = useStore((s) => s.unit)
  const pts = useStore((s) => s.pts)
  const bulges = useStore((s) => s.bulges)
  const closed = useStore((s) => s.closed)
  const centerOverride = useStore((s) => s.centerOverride)
  const northDeg = useStore((s) => s.northDeg)
  const compass = useStore((s) => s.compass)
  const setCompass = useStore((s) => s.setCompass)
  const setTool = useStore((s) => s.setTool)
  // arming a canvas tool from a sheet button must get the sheet OUT of the way —
  // otherwise the thing the user is told to tap is hidden behind the sheet.
  // setTool refuses while locked (with its own toast), so report whether it armed
  const armTool = (t: Tool) => {
    setTool(t)
    const armed = useStore.getState().tool === t
    if (armed && window.innerWidth <= 760) useStore.getState().setSheetPos('peek')
    return armed
  }
  const angleSnap = useStore((s) => s.angleSnap)
  const setAngleSnap = useStore((s) => s.setAngleSnap)
  const markers = useStore((s) => s.markers)
  const roomShapes = useStore((s) => s.roomShapes)
  const showEdgeLabels = useStore((s) => s.showEdgeLabels)
  const setShowEdgeLabels = useStore((s) => s.setShowEdgeLabels)
  const customFileRef = useRef<HTMLInputElement>(null)
  const [pageBusy, setPageBusy] = useState(false)

  // drawn rooms join the marker analysis as pseudo-markers at their bbox centre,
  // the exact verdict types.ts promises an area
  const items = useMemo<Marker[]>(
    () => [...markers, ...roomShapes.flatMap((r) => {
      const p = roomShapeAnchor(r)
      return p ? [{ id: r.id, kind: r.kind, label: r.label, note: r.note, p }] : []
    })],
    [markers, roomShapes],
  )
  // panel list rows may carry a room-shape id — route selection to the right store slice
  const selectItem = (id: string) => {
    const st = useStore.getState()
    if (st.roomShapes.some((r) => r.id === id)) st.setSelectedRoomShape(id)
    else st.setSelectedMarker(id)
  }

  const sampled = useMemo(() => sampledPolygon(pts, bulges, closed), [pts, bulges, closed])
  const center = useMemo<Pt | null>(
    () => centerOverride ?? (pts.length >= 3 ? centroid(sampled) : null),
    [pts.length, sampled, centerOverride],
  )
  const areaM2 = useMemo(() => {
    if (!closed || pts.length < 3 || !metersPerPx) return null
    return polygonArea(sampled) * metersPerPx * metersPerPx
  }, [sampled, pts.length, closed, metersPerPx])
  const perimM = useMemo(() => {
    if (pts.length < 2 || !metersPerPx) return null
    return perimeter(sampled, closed) * metersPerPx
  }, [sampled, pts.length, closed, metersPerPx])

  const setPdfPage = async (delta: number) => {
    if (!bg.pdfPages || !hasPdfOpen() || pageBusy) return
    const next = Math.min(bg.pdfPages, Math.max(1, (bg.pdfPage ?? 1) + delta))
    if (next === bg.pdfPage) return
    setPageBusy(true)
    try {
      const { dataUrl, w, h, pxPerPt } = await renderPdfPage(next)
      setBg({ dataUrl, w, h, pdfPage: next })
      const st = useStore.getState()
      if (st.pts.length >= 3 || st.metersPerPx) {
        st.toast('Page changed — the outline and scale came from the previous page. Verify before measuring', 'warn')
      }
      // this page may state its own printed scale
      const ratio = await detectPdfScaleRatio(next)
      if (ratio) {
        const mpp = (ratio * 0.0254) / 72 / pxPerPt
        if (!st.metersPerPx || Math.abs(mpp - st.metersPerPx) / mpp > 0.01) {
          useStore.getState().toast(`This page states 1 : ${ratio}`, 'info', 'Apply scale', () => {
            const s2 = useStore.getState()
            s2.setMetersPerPx(mpp, 'pdf')
            s2.toast(`Scale set from page ${next}'s printed 1 : ${ratio}`, 'ok')
          })
        }
      }
    } catch {
      useStore.getState().toast('Could not render that page', 'warn')
    } finally {
      setPageBusy(false)
    }
  }

  const pickCustom = async (file: File) => {
    try {
      const raw = await blobToDataUrl(file)
      const processed = await processCompassImage(raw)
      setCompass({ id: 'custom', customUrl: processed.dataUrl, customAspect: processed.aspect })
      useStore.getState().toast(
        processed.removedBg
          ? 'Background removed & wheel centred — save it as a preset to keep it'
          : 'Compass placed — save it as a preset to keep it',
        'ok',
      )
    } catch {
      useStore.getState().toast('Could not read that image', 'warn')
    }
  }

  const [presets, setPresets] = useState<CompassPreset[]>([])
  useEffect(() => { void listPresets().then(setPresets).catch(() => {}) }, [])
  const saveAsPreset = async () => {
    const cs = useStore.getState().compass
    if (!cs.customUrl) return
    try {
      const id = (crypto as any).randomUUID ? crypto.randomUUID() : `cp${Math.floor(performance.now() * 1000)}`
      await putPreset({ id, name: `My chakra ${presets.length + 1}`, dataUrl: cs.customUrl, aspect: cs.customAspect ?? 1, createdAt: Date.now() })
      setPresets(await listPresets())
      useStore.getState().toast('Saved — it now lives in your compass picker on this device', 'ok')
    } catch {
      useStore.getState().toast('Could not save the preset on this device — storage may be full or blocked', 'warn')
    }
  }
  const removePreset = (id: string) => {
    useStore.getState().toast('Delete this chakra preset?', 'warn', 'Delete', () => {
      void deletePreset(id)
        .then(async () => setPresets(await listPresets()))
        .catch(() => useStore.getState().toast('Could not delete the preset', 'warn'))
    })
  }

  const scaleBadge =
    scaleSource === 'dxf' ? 'from CAD units'
      : scaleSource === 'map' ? 'from map zoom'
        : scaleSource === 'pdf' ? 'from printed scale'
          : scaleSource === 'demo' ? 'sample preset'
            : scaleSource === 'manual' ? 'calibrated' : null

  const sheetPos = useStore((s) => s.sheetPos)
  const setSheetPos = useStore((s) => s.setSheetPos)
  const asideRef = useRef<HTMLElement>(null)
  const swipe = useRef<{ startY: number; startOff: number; moved: boolean; lastY: number; lastT: number; vel: number } | null>(null)

  /* three-detent bottom sheet: peek (54px) · half (~42vh) · full — mobile only */
  const sheetH = () => asideRef.current?.getBoundingClientRect().height ?? 0
  const offsetFor = (pos: 'peek' | 'half' | 'full') => {
    const h = sheetH()
    if (pos === 'full') return 0
    if (pos === 'half') return Math.max(0, h - Math.min(h, window.innerHeight * 0.42))
    // CSS rests peek at translateY(calc(100% - 54px - env(safe-area-inset-bottom))); the mobile
    // sheet's padding-bottom is calc(10px + env(...)) (index.css .panel), so recover the inset from it
    const safe = asideRef.current ? Math.max(0, parseFloat(getComputedStyle(asideRef.current).paddingBottom || '0') - 10) : 0
    return Math.max(0, h - 54 - safe)
  }
  const onHandleDown = (e: React.PointerEvent) => {
    if (window.innerWidth > 760) return
    try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch { /* synthetic */ }
    swipe.current = { startY: e.clientY, startOff: offsetFor(sheetPos), moved: false, lastY: e.clientY, lastT: performance.now(), vel: 0 }
    if (asideRef.current) asideRef.current.style.transition = 'none'
  }
  const onHandleMove = (e: React.PointerEvent) => {
    const sw = swipe.current
    const el = asideRef.current
    if (!sw || !el) return
    const now = performance.now()
    const dt = now - sw.lastT
    if (dt > 0) sw.vel = 0.6 * sw.vel + 0.4 * ((e.clientY - sw.lastY) / dt)
    sw.lastY = e.clientY; sw.lastT = now
    const dy = e.clientY - sw.startY
    if (Math.abs(dy) > 6) sw.moved = true
    const off = Math.min(offsetFor('peek'), Math.max(0, sw.startOff + dy))
    el.style.transform = `translateY(${off}px)`
  }
  const onHandleUp = (e: React.PointerEvent) => {
    const sw = swipe.current
    const el = asideRef.current
    swipe.current = null
    if (!sw || !el) { return }
    const dy = e.clientY - sw.startY
    el.style.transition = ''
    el.style.transform = ''
    if (!sw.moved) {
      // tap cycles: peek → full → peek (half is reached by swiping or zone taps)
      setSheetPos(sheetPos === 'peek' ? 'full' : 'peek')
      return
    }
    const off = Math.min(offsetFor('peek'), Math.max(0, sw.startOff + dy))
    // a decisive flick jumps a detent in its direction
    if (Math.abs(sw.vel) > 0.45) {
      const order: ('full' | 'half' | 'peek')[] = ['full', 'half', 'peek']
      const idx = order.indexOf(sheetPos)
      setSheetPos(order[Math.min(2, Math.max(0, idx + (sw.vel > 0 ? 1 : -1)))])
      return
    }
    // otherwise snap to the nearest detent
    const detents: ('peek' | 'half' | 'full')[] = ['peek', 'half', 'full']
    let best: 'peek' | 'half' | 'full' = 'peek', bestD = Infinity
    for (const d of detents) {
      const dd = Math.abs(offsetFor(d) - off)
      if (dd < bestD) { bestD = dd; best = d }
    }
    setSheetPos(best)
  }

  return (
    <aside ref={asideRef} className={`panel pos-${sheetPos}`}>
      <button
        className="sheet-handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
      >
        <span className="grip" />
        <span>{sheetPos === 'peek' ? 'Controls & analysis' : 'Hide controls'}</span>
        {sheetPos === 'peek' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {/* -------- Plan -------- */}
      <section className="card">
        <header className="card-head">
          <h2>Plan</h2>
          {bg.name && <span className="file-chip" title={bg.name}>{bg.name}</span>}
        </header>

        {bg.kind !== 'none' && (
          <>
            <Slider label="Background" value={bg.opacity * 100} min={10} max={100}
              onChange={(v) => setBg({ opacity: v / 100 })} />
            <div className="toggle-row">
              <Toggle label="Grayscale" on={bg.grayscale} onChange={(v) => setBg({ grayscale: v })} />
              <Toggle label="Invert" on={bg.invert} onChange={(v) => setBg({ invert: v })} />
            </div>
            {bg.pdfPages && bg.pdfPages > 1 && (
              <div className="row-between pdf-pager">
                <span className="lbl">PDF page</span>
                {hasPdfOpen() ? (
                  <span className="pager">
                    <button className="icon-btn" disabled={pageBusy || (bg.pdfPage ?? 1) <= 1}
                      onClick={() => void setPdfPage(-1)}><ChevronLeft size={14} /></button>
                    <b>{bg.pdfPage} / {bg.pdfPages}</b>
                    <button className="icon-btn" disabled={pageBusy || (bg.pdfPage ?? 1) >= bg.pdfPages}
                      onClick={() => void setPdfPage(1)}><ChevronRight size={14} /></button>
                  </span>
                ) : (
                  <span className="lbl dim">re-import to switch</span>
                )}
              </div>
            )}
          </>
        )}

        <div className="row-between">
          <span className="lbl">Scale</span>
          <span className="scale-val">
            {formatScale(metersPerPx, unit)}
            {scaleBadge && <em className="badge">{scaleBadge}</em>}
          </span>
        </div>
        <button className="btn-ghost wide" onClick={() => armTool('calibrate')}>
          {metersPerPx ? 'Recalibrate scale' : 'Set scale — draw a known length'}
        </button>

        <div className="stat-row">
          <div className="stat">
            <span>Area</span>
            <b>{areaM2 != null ? formatArea(areaM2, unit) : '—'}</b>
          </div>
          <div className="stat">
            <span>Perimeter</span>
            <b>{perimM != null ? formatLen(perimM, unit) : '—'}</b>
          </div>
          <div className="stat">
            <span>Points</span>
            <b>{pts.length}</b>
          </div>
        </div>

        <div className="toggle-row">
          <Toggle label="Angle snap" on={angleSnap} onChange={setAngleSnap} />
          <Toggle label="Lengths" on={showEdgeLabels} onChange={(v) => {
            setShowEdgeLabels(v)
            if (v && !metersPerPx) useStore.getState().toast('Set the scale to see edge lengths', 'info')
          }} />
        </div>

        <div className="btn-row">
          {closed ? (
            <button className="btn-ghost" onClick={() => useStore.getState().reopenPolygon()}>Reopen outline</button>
          ) : (
            <button className="btn-ghost" disabled={pts.length < 3}
              onClick={() => useStore.getState().closePolygon()}>Close outline</button>
          )}
          <button className="btn-ghost danger" disabled={pts.length === 0}
            onClick={() => useStore.getState().clearOutline()}>Clear</button>
        </div>
      </section>

      {/* -------- Compass -------- */}
      <section className="card">
        <header className="card-head"><h2>Vastu compass</h2></header>

        {!closed && (
          <p className="hint">Close the outline to unlock the compasses — the centre and size are
            worked out from your boundary.</p>
        )}

        <div className={`compass-grid ${!closed ? 'locked' : ''}`}>
          {COMPASS_META.map((m) => (
            <button
              key={m.id}
              className={`compass-card ${compass.id === m.id ? 'on' : ''}`}
              aria-pressed={compass.id === m.id}
              disabled={!closed}
              onClick={() => {
                if (m.id === 'custom' && !compass.customUrl) customFileRef.current?.click()
                else setCompass({ id: compass.id === m.id ? 'none' : (m.id as CompassId) })
              }}
              title={m.sub}
            >
              <span className="compass-thumb">{preview(m.id)}</span>
              <span className="compass-label">{m.label}</span>
            </button>
          ))}
        </div>
        <input ref={customFileRef} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickCustom(f); e.target.value = '' }} />

        {presets.length > 0 && (
          <>
            <div className="subhead">My chakras</div>
            <div className="compass-grid">
              {presets.map((p) => (
                <div key={p.id} className="compass-card-wrap">
                  <button
                    className={`compass-card preset ${compass.id === 'custom' && compass.customUrl === p.dataUrl ? 'on' : ''}`}
                    aria-pressed={compass.id === 'custom' && compass.customUrl === p.dataUrl}
                    disabled={!closed}
                    onClick={() => setCompass({ id: 'custom', customUrl: p.dataUrl, customAspect: p.aspect })}>
                    <span className="compass-thumb"><img src={p.dataUrl} alt={p.name} /></span>
                    <span className="compass-label">{p.name}</span>
                  </button>
                  <button className="preset-del" aria-label={`Delete ${p.name}`}
                    onClick={(e) => { e.stopPropagation(); removePreset(p.id) }}>×</button>
                </div>
              ))}
            </div>
          </>
        )}

        {closed && compass.id !== 'none' && (
          <>
            <Slider label="Size" value={compass.scalePct} min={40} max={400}
              onChange={(v) => setCompass({ scalePct: v })} />
            <Slider label="Opacity" value={compass.opacity * 100} min={15} max={100}
              onChange={(v) => setCompass({ opacity: v / 100 })} />
            {compass.id === 'zones16' && (
              <Slider label="Zone fill" value={compass.fillPct} min={0} max={70}
                onChange={(v) => setCompass({ fillPct: v })} />
            )}
            <div className="toggle-row wrap">
              {compass.id === 'zones16' && (
                <Toggle label="Clip to plot" on={compass.clip} onChange={(v) => setCompass({ clip: v })} />
              )}
              {compass.id !== 'custom' && (
                <Toggle label="Labels" on={compass.labels} onChange={(v) => setCompass({ labels: v })} />
              )}
              {['zones16', 'gates32', 'chakra8'].includes(compass.id) && (
                <Toggle label="Degrees" on={compass.degreeRing} onChange={(v) => setCompass({ degreeRing: v })} />
              )}
              <Toggle label="Brahmasthan" on={compass.brahmasthan} onChange={(v) => setCompass({ brahmasthan: v })} />
              {compass.id === 'grid9' && (
                <Toggle label="Devta names" on={compass.devtas} onChange={(v) => setCompass({ devtas: v })} />
              )}
            </div>
            {compass.brahmasthan && (
              <Slider label="Brahmasthan size" value={compass.brahmaPct} min={50} max={200}
                fmt={(v) => (v === 100 ? 'from drawing' : `${Math.round(v)}%`)}
                onChange={(v) => setCompass({ brahmaPct: v })} />
            )}
            {compass.id === 'custom' && (
              <>
                <Slider label="Image rotation" value={compass.customRotDeg} min={-180} max={180}
                  fmt={(v) => `${v}°`} onChange={(v) => setCompass({ customRotDeg: v })} />
                <div className="btn-row">
                  <button className="btn-ghost" onClick={() => customFileRef.current?.click()}>
                    <ImagePlus size={14} /> Replace
                  </button>
                  <button className="btn-ghost" onClick={() => void saveAsPreset()}>
                    Save as preset
                  </button>
                </div>
              </>
            )}
          </>
        )}

        <div className="subhead">Orientation</div>
        <NorthRow />
        <NorthSourceLine />
        <button className="btn-ghost wide" onClick={() => {
          if (armTool('north')) useStore.getState().toast('Tap the TAIL of the plan’s north arrow, then its TIP', 'info')
        }}>
          <Navigation size={14} /> Align north from plan arrow
        </button>

        <div className="row-between">
          <span className="lbl">Centre</span>
          <span className="scale-val">
            {centerOverride ? 'pinned manually' : 'auto · centroid'}
            {centerOverride && (
              <button className="chip" style={{ marginLeft: 8 }}
                onClick={() => useStore.getState().setCenterOverride(null)}>
                <LocateFixed size={11} /> reset
              </button>
            )}
          </span>
        </div>
      </section>

      {/* -------- Markers -------- */}
      {items.length > 0 && center && closed && (
        <section className="card">
          <header className="card-head"><h2>Rooms & objects</h2></header>
          {items.filter((m) => m.kind === 'entrance').map((m) => {
            const pl = placementOf(m.p, center, northDeg)
            return (
              <button key={m.id} type="button" className="entrance-card"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => selectItem(m.id)}>
                <span className="entrance-title">{m.label}</span>
                <b>{pl.pada.code} · {pl.pada.devta}</b>
                <span className="lbl dim">{pl.zone.key} zone · {pl.bearing.toFixed(1)}° from centre</span>
              </button>
            )
          })}
          <div className="marker-list">
            {items.filter((m) => m.kind !== 'entrance').map((m) => {
              const pl = placementOf(m.p, center, northDeg)
              const meta = markerKindMeta(m.kind)
              return (
                <button key={m.id} className="marker-row"
                  onClick={() => selectItem(m.id)}>
                  <span className="kind-dot" style={{ background: meta.color }} />
                  <span className="marker-name">{m.label}</span>
                  <span className="marker-zone" style={{ color: pl.zone.color }}>{pl.zone.key}</span>
                  <span className="lbl dim">{pl.pada.code}</span>
                </button>
              )
            })}
          </div>
          {items.some((m) => m.note) && (
            <div className="zone-note">Notes on markers appear in the report.</div>
          )}
        </section>
      )}

      {/* -------- Vastu analysis -------- */}
      {closed && center && pts.length >= 3 && (() => {
        const ev = evaluateVastu({ sampled, center, northDeg, markers: items, brahmaPct: compass.brahmaPct })
        return (
          <section className="card">
            <header className="card-head">
              <h2>Vastu analysis</h2>
              <span className="file-chip">{ev.favourable} ✓ · {ev.attention} !</span>
            </header>
            {ev.findings.length === 0 && (
              <p className="hint">Nothing to read yet — use the <b>Mark</b> tool to pin the entrance,
                kitchen, toilets and beds, and the analysis writes itself.</p>
            )}
            <div className="finding-list">
              {ev.findings.map((f, i) => (
                <button key={i} className={`finding-row sev-${f.severity}`} onClick={() => {
                  if (f.markerId) selectItem(f.markerId)
                  else if (f.zoneIdx != null) {
                    useStore.getState().setHighlightZone(f.zoneIdx)
                    if (window.innerWidth <= 760) useStore.getState().setSheetPos('half')
                  }
                }}>
                  <span className="finding-icon">
                    {f.severity === 'good' ? <CheckCircle2 size={14} />
                      : f.severity === 'bad' ? <XCircle size={14} />
                        : f.severity === 'warn' ? <AlertTriangle size={14} /> : <Info size={14} />}
                  </span>
                  <span className="finding-body">
                    <b>{f.title}</b>
                    <span>{f.detail}</span>
                  </span>
                </button>
              ))}
            </div>
            {ev.findings.length > 0 && <div className="zone-note">{ANALYSIS_DISCLAIMER}</div>}
          </section>
        )
      })()}

      {/* -------- Zone balance -------- */}
      {closed && center && pts.length >= 3 && (
        <section className="card">
          <header className="card-head">
            <h2>Zone balance</h2>
            <button className="icon-btn" data-tip="Recompute follows outline & north automatically">
              <RotateCcw size={13} />
            </button>
          </header>
          <ZoneChart pts={sampled} center={center} northDeg={northDeg} />
        </section>
      )}
    </aside>
  )
}
