import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ImagePlus, LocateFixed, Navigation, RotateCcw } from 'lucide-react'
import { useStore } from '../store'
import { centroid, circumradius, perimeter, polygonArea, polar, wedgeClip } from '../geometry'
import { formatArea, formatLen, formatScale } from '../format'
import { COMPASS_META, ZONES16 } from '../vastu'
import type { CompassId, Pt } from '../types'
import { hasPdfOpen, renderPdfPage } from '../importers/pdf'
import { blobToDataUrl, loadImage } from '../importers/raster'

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
    <button className={`toggle ${props.on ? 'on' : ''}`} onClick={() => props.onChange(!props.on)}>
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

/* ---------- north dial ---------- */

function NorthDial() {
  const northDeg = useStore((s) => s.northDeg)
  const setNorth = useStore((s) => s.setNorth)
  const ref = useRef<HTMLDivElement>(null)

  const fromEvent = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    setNorth(Math.round(deg * 2) / 2)
  }

  return (
    <div className="north-row">
      <div
        ref={ref}
        className="north-dial"
        onPointerDown={(e) => {
          try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch { /* synthetic pointer */ }
          fromEvent(e)
        }}
        onPointerMove={(e) => { if (e.buttons & 1) fromEvent(e) }}
      >
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="29" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * 45 * Math.PI) / 180
            return <line key={i} x1={32 + Math.sin(a) * 24} y1={32 - Math.cos(a) * 24}
              x2={32 + Math.sin(a) * 28} y2={32 - Math.cos(a) * 28}
              stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
          })}
          <g transform={`rotate(${northDeg} 32 32)`}>
            <path d="M32 8 l5.5 13 h-11 Z" fill="#F26B57" />
            <path d="M32 56 l5.5 -13 h-11 Z" fill="rgba(255,255,255,0.28)" />
            <text x="32" y="30" textAnchor="middle" fontSize="10" fontWeight="800" fill="#F26B57"
              transform={`rotate(${-northDeg} 32 30)`} style={{ display: 'none' }}>N</text>
          </g>
          <circle cx="32" cy="32" r="3" fill="#D9B45B" />
        </svg>
      </div>
      <div className="north-fields">
        <label className="field">
          <span>North</span>
          <div className="num-wrap">
            <input type="number" value={northDeg} step={0.5}
              onChange={(e) => setNorth(parseFloat(e.target.value) || 0)} />
            <em>°</em>
          </div>
        </label>
        <div className="north-quick">
          <button className="chip" onClick={() => setNorth(northDeg - 45)}>−45°</button>
          <button className="chip" onClick={() => setNorth(northDeg + 45)}>+45°</button>
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

  const rows = useMemo(() => {
    const total = polygonArea(pts)
    if (total <= 0) return null
    return ZONES16.map((z, i) => {
      const a0 = northDeg - 11.25 + i * 22.5
      const clipped = wedgeClip(pts, center, a0, a0 + 22.5)
      const area = polygonArea(clipped)
      return { ...z, pct: (area / total) * 100, areaPx: area }
    })
  }, [pts, center, northDeg])

  if (!rows) return null
  const maxPct = Math.max(...rows.map((r) => r.pct), 0.001)
  const evenX = Math.min(100, (6.25 / maxPct) * 100)

  return (
    <div className="zone-chart">
      {rows.map((r) => (
        <div key={r.key} className="zone-row"
          title={`${r.name} — ${r.theme}${metersPerPx ? ` · ${formatArea(r.areaPx * metersPerPx * metersPerPx, unit)}` : ''}`}>
          <span className="zone-chip" style={{ background: r.color }} />
          <span className="zone-key">{r.key}</span>
          <span className="zone-track">
            <span className="zone-even" style={{ left: `${evenX}%` }} />
            <span className="zone-bar" style={{ width: `${(r.pct / maxPct) * 100}%`, background: r.color }} />
          </span>
          <span className="zone-val">{r.pct.toFixed(1)}%</span>
        </div>
      ))}
      <div className="zone-note">Tick marks the even share (6.25%). Hover a row for its theme.</div>
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
  const closed = useStore((s) => s.closed)
  const centerOverride = useStore((s) => s.centerOverride)
  const northDeg = useStore((s) => s.northDeg)
  const compass = useStore((s) => s.compass)
  const setCompass = useStore((s) => s.setCompass)
  const setTool = useStore((s) => s.setTool)
  const angleSnap = useStore((s) => s.angleSnap)
  const setAngleSnap = useStore((s) => s.setAngleSnap)
  const showEdgeLabels = useStore((s) => s.showEdgeLabels)
  const setShowEdgeLabels = useStore((s) => s.setShowEdgeLabels)
  const customFileRef = useRef<HTMLInputElement>(null)
  const [pageBusy, setPageBusy] = useState(false)

  const center = useMemo<Pt | null>(
    () => centerOverride ?? (pts.length >= 3 ? centroid(pts) : null),
    [pts, centerOverride],
  )
  const areaM2 = useMemo(() => {
    if (!closed || pts.length < 3 || !metersPerPx) return null
    return polygonArea(pts) * metersPerPx * metersPerPx
  }, [pts, closed, metersPerPx])
  const perimM = useMemo(() => {
    if (pts.length < 2 || !metersPerPx) return null
    return perimeter(pts, closed) * metersPerPx
  }, [pts, closed, metersPerPx])

  const setPdfPage = async (delta: number) => {
    if (!bg.pdfPages || !hasPdfOpen() || pageBusy) return
    const next = Math.min(bg.pdfPages, Math.max(1, (bg.pdfPage ?? 1) + delta))
    if (next === bg.pdfPage) return
    setPageBusy(true)
    try {
      const { dataUrl, w, h } = await renderPdfPage(next)
      setBg({ dataUrl, w, h, pdfPage: next })
    } catch {
      useStore.getState().toast('Could not render that page', 'warn')
    } finally {
      setPageBusy(false)
    }
  }

  const pickCustom = async (file: File) => {
    try {
      const dataUrl = await blobToDataUrl(file)
      const img = await loadImage(dataUrl)
      setCompass({ id: 'custom', customUrl: dataUrl, customAspect: img.height / img.width })
      useStore.getState().toast('Custom compass placed on the centre', 'ok')
    } catch {
      useStore.getState().toast('Could not read that image', 'warn')
    }
  }

  const scaleBadge =
    scaleSource === 'dxf' ? 'from CAD units'
      : scaleSource === 'map' ? 'from map zoom'
        : scaleSource === 'demo' ? 'sample preset'
          : scaleSource === 'manual' ? 'calibrated' : null

  const sheetOpen = useStore((s) => s.sheetOpen)
  const setSheetOpen = useStore((s) => s.setSheetOpen)
  const asideRef = useRef<HTMLElement>(null)
  const swipe = useRef<{ startY: number; startOpen: boolean; moved: boolean } | null>(null)

  /* swipe the sheet handle up/down like a native bottom sheet (mobile only) */
  const collapsedOffset = () => Math.max(0, (asideRef.current?.getBoundingClientRect().height ?? 0) - 54)
  const onHandleDown = (e: React.PointerEvent) => {
    if (window.innerWidth > 760) return
    try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch { /* synthetic */ }
    swipe.current = { startY: e.clientY, startOpen: sheetOpen, moved: false }
    if (asideRef.current) asideRef.current.style.transition = 'none'
  }
  const onHandleMove = (e: React.PointerEvent) => {
    const sw = swipe.current
    const el = asideRef.current
    if (!sw || !el) return
    const dy = e.clientY - sw.startY
    if (Math.abs(dy) > 6) sw.moved = true
    const base = sw.startOpen ? 0 : collapsedOffset()
    const off = Math.min(collapsedOffset(), Math.max(0, base + dy))
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
    if (!sw.moved) { setSheetOpen(!sheetOpen); return }
    const base = sw.startOpen ? 0 : collapsedOffset()
    const off = Math.min(collapsedOffset(), Math.max(0, base + dy))
    setSheetOpen(off < collapsedOffset() * 0.5)
  }

  return (
    <aside ref={asideRef} className={`panel ${sheetOpen ? '' : 'collapsed'}`}>
      <button
        className="sheet-handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
      >
        <span className="grip" />
        <span>{sheetOpen ? 'Hide controls' : 'Controls & analysis'}</span>
        {sheetOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
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
        <button className="btn-ghost wide" onClick={() => setTool('calibrate')}>
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
          <Toggle label="Lengths" on={showEdgeLabels} onChange={setShowEdgeLabels} />
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

        {closed && compass.id !== 'none' && (
          <>
            <Slider label="Size" value={compass.scalePct} min={40} max={170}
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
            {compass.id === 'custom' && (
              <>
                <Slider label="Image rotation" value={compass.customRotDeg} min={-180} max={180}
                  fmt={(v) => `${v}°`} onChange={(v) => setCompass({ customRotDeg: v })} />
                <button className="btn-ghost wide" onClick={() => customFileRef.current?.click()}>
                  <ImagePlus size={14} /> Replace compass image
                </button>
              </>
            )}
          </>
        )}

        <div className="subhead">Orientation</div>
        <NorthDial />
        <button className="btn-ghost wide" onClick={() => {
          setTool('north')
          useStore.getState().toast('Tap the TAIL of the plan’s north arrow, then its TIP', 'info')
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

      {/* -------- Zone balance -------- */}
      {closed && center && pts.length >= 3 && (
        <section className="card">
          <header className="card-head">
            <h2>Zone balance</h2>
            <button className="icon-btn" data-tip="Recompute follows outline & north automatically">
              <RotateCcw size={13} />
            </button>
          </header>
          <ZoneChart pts={pts} center={center} northDeg={northDeg} />
        </section>
      )}
    </aside>
  )
}
