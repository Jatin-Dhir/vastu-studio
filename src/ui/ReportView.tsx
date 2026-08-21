import { useEffect, useMemo, useState } from 'react'
import { Printer, Share2, X } from 'lucide-react'
import { useStore } from '../store'
import { makePlanPng } from '../export'
import { placementOf, zoneRows } from '../analysis'
import { centroid, circumradius, perimeter, polygonArea, sampledPolygon } from '../geometry'
import { formatArea, formatLen, formatScale } from '../format'
import { ANALYSIS_DISCLAIMER, markerKindMeta } from '../vastu'
import { evaluateVastu } from '../evaluate'

export function ReportView() {
  const setReportOpen = useStore((s) => s.setReportOpen)
  const report = useStore((s) => s.report)
  const setReport = useStore((s) => s.setReport)
  const pts = useStore((s) => s.pts)
  const bulges = useStore((s) => s.bulges)
  const closed = useStore((s) => s.closed)
  const centerOverride = useStore((s) => s.centerOverride)
  const northDeg = useStore((s) => s.northDeg)
  const northSource = useStore((s) => s.northSource)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const unit = useStore((s) => s.unit)
  const markers = useStore((s) => s.markers)
  const projectName = useStore((s) => s.projectName)

  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [imgBlob, setImgBlob] = useState<Blob | null>(null)

  useEffect(() => {
    let url: string | null = null
    void makePlanPng().then((out) => {
      if (out) {
        url = URL.createObjectURL(out.blob)
        setImgBlob(out.blob)
        setImgUrl(url)
      }
    })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [])

  const sampled = useMemo(() => sampledPolygon(pts, bulges, closed), [pts, bulges, closed])
  const center = useMemo(() => centerOverride ?? (pts.length >= 3 ? centroid(sampled) : null), [centerOverride, pts.length, sampled])
  const rows = useMemo(() => (closed && center ? zoneRows(sampled, center, northDeg) : null), [closed, center, sampled, northDeg])
  const entrances = markers.filter((m) => m.kind === 'entrance')
  const others = markers.filter((m) => m.kind !== 'entrance')
  const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const share = async () => {
    if (!imgBlob) return
    const file = new File([imgBlob], `${projectName}-vastu.png`, { type: 'image/png' })
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${projectName} — Vastu analysis` })
        return
      }
    } catch { /* cancelled or unsupported */ }
    useStore.getState().toast('Sharing not available here — use Print / Save as PDF instead', 'info')
  }

  return (
    <div className="report-backdrop">
      <div className="report-actions no-print">
        <button className="btn-primary" onClick={() => window.print()}><Printer size={15} /> Print / Save PDF</button>
        <button className="btn-ghost" onClick={() => void share()}><Share2 size={15} /> Share</button>
        <button className="btn-ghost" onClick={() => setReportOpen(false)}><X size={15} /> Close</button>
      </div>

      <div className="report-page">
        <header className="report-head">
          <div>
            <h1>Vastu Analysis Report</h1>
            <div className="report-sub">{projectName} · {dateStr}</div>
          </div>
          <svg width="44" height="44" viewBox="0 0 32 32" aria-hidden>
            <rect x="8.2" y="8.2" width="15.6" height="15.6" rx="1.5" transform="rotate(45 16 16)"
              fill="none" stroke="#B8963E" strokeWidth="2" />
            <circle cx="16" cy="16" r="2.6" fill="#B8963E" />
          </svg>
        </header>

        <div className="report-meta">
          <label>Client <input value={report.client} placeholder="Client name"
            onChange={(e) => setReport({ client: e.target.value })} /></label>
          <label>Address <input value={report.address} placeholder="Site address"
            onChange={(e) => setReport({ address: e.target.value })} /></label>
          <label>Practitioner <input value={report.practitioner} placeholder="Your name"
            onChange={(e) => setReport({ practitioner: e.target.value })} /></label>
        </div>

        {imgUrl
          ? <img className="report-plan" src={imgUrl} alt="Analysed plan" />
          : <div className="report-plan report-plan-loading">Rendering plan…</div>}

        <div className="report-facts">
          {closed && metersPerPx && (
            <>
              <span><b>Area</b> {formatArea(polygonArea(sampled) * metersPerPx ** 2, unit)}</span>
              <span><b>Perimeter</b> {formatLen(perimeter(sampled, true) * metersPerPx, unit)}</span>
            </>
          )}
          {metersPerPx && <span><b>Scale</b> {formatScale(metersPerPx, unit)}</span>}
          <span><b>North</b> {northDeg}° ({northSource === 'map' ? 'auto from map' : northSource === 'plan' ? 'plan arrow' : 'set manually'})</span>
        </div>

        {center && closed && (() => {
          const R = circumradius(center, sampled) * 1.03
          const ev = evaluateVastu({ sampled, center, northDeg, markers, R })
          if (ev.findings.length === 0) return null
          return (
            <section>
              <h2>Vastu findings</h2>
              <div className="report-findings">
                {ev.findings.map((f, i) => (
                  <div key={i} className={`report-finding sev-${f.severity}`}>
                    <span className="report-finding-mark">
                      {f.severity === 'good' ? '✓' : f.severity === 'bad' ? '✕' : f.severity === 'warn' ? '!' : 'ℹ'}
                    </span>
                    <span><b>{f.title}.</b> {f.detail}.</span>
                  </div>
                ))}
              </div>
              <div className="report-note">{ANALYSIS_DISCLAIMER}</div>
            </section>
          )
        })()}

        {center && entrances.length > 0 && (
          <section>
            <h2>Entrances</h2>
            {entrances.map((m) => {
              const pl = placementOf(m.p, center, northDeg)
              return (
                <div key={m.id} className="report-entrance">
                  <b>{m.label}</b>: pada <b>{pl.pada.code} · {pl.pada.devta}</b> in the {pl.zone.key} zone
                  ({pl.zone.name}), {pl.bearing.toFixed(1)}° from the centre.
                  {m.note && <div className="report-note">{m.note}</div>}
                </div>
              )
            })}
          </section>
        )}

        {center && others.length > 0 && (
          <section>
            <h2>Rooms & objects</h2>
            <table className="report-table">
              <thead><tr><th>Item</th><th>Type</th><th>Zone</th><th>Pada</th><th>Notes</th></tr></thead>
              <tbody>
                {others.map((m) => {
                  const pl = placementOf(m.p, center, northDeg)
                  return (
                    <tr key={m.id}>
                      <td>{m.label}</td>
                      <td>{markerKindMeta(m.kind).name}</td>
                      <td><span className="report-zonechip" style={{ background: pl.zone.color }} />{pl.zone.key} — {pl.zone.name}</td>
                      <td>{pl.pada.code} {pl.pada.devta}</td>
                      <td>{m.note ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}

        {rows && (
          <section>
            <h2>Zone balance (16 zones)</h2>
            <table className="report-table">
              <thead><tr><th></th><th>Zone</th><th>Theme</th><th>Share</th>{metersPerPx && <th>Area</th>}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td><span className="report-zonechip" style={{ background: r.color }} /></td>
                    <td><b>{r.key}</b> {r.name}</td>
                    <td>{r.theme}</td>
                    <td>{r.pct.toFixed(1)}%</td>
                    {metersPerPx && <td>{formatArea(r.areaPx * metersPerPx ** 2, unit)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section>
          <h2>Observations & remedies</h2>
          <textarea className="report-notes" rows={6} value={report.notes}
            placeholder="Your overall observations, prescriptions and remedies for this property…"
            onChange={(e) => setReport({ notes: e.target.value })} />
        </section>

        <footer className="report-foot">
          Generated with Vastu Studio · angles measured clockwise from true north · zone areas by
          exact sector clipping of the traced boundary
        </footer>
      </div>
    </div>
  )
}
