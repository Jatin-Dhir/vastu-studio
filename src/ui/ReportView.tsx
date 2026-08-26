import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { FileDown, Printer, Share2, X } from 'lucide-react'
import { useStore } from '../store'
import { makePlanPng } from '../export'
import { buildAssessment } from '../reportText'
import type { ReportPdfData } from '../reportPdf'
import { brahmasthanRadius, placementOf, zoneRows } from '../analysis'
import { centroid, perimeter, polygonArea, sampledPolygon } from '../geometry'
import { formatArea, formatLen, formatScale } from '../format'
import { ANALYSIS_DISCLAIMER, GATES32, GATE_QUALITY, PLACEMENT_RULES, ZONES16, markerKindMeta } from '../vastu'
import { evaluateVastu, roomShapeAnchor } from '../evaluate'
import type { Finding, Severity } from '../evaluate'
import type { Marker, NorthSource, Pt, ScaleSource } from '../types'
import './report.css'

/* ------------------------------------------------------------------ */
/* Small presentational helpers, local to the report.                  */
/* ------------------------------------------------------------------ */

/** Colour-coded verdict badge — the same good/warn/bad/info palette the findings list uses. */
function Pill({ sev, children }: { sev: Severity; children: ReactNode }) {
  return <span className={`report-pill report-pill-${sev}`}>{children}</span>
}

type RuleVerdict = 'ideal' | 'good' | 'caution' | 'avoid' | 'neutral'

/** Same ideal→good→avoid→caution precedence CanvasOverlays' MarkerChips and evaluate.ts's
 *  placement loop use, so a room's verdict here can never disagree with the canvas badge. */
function ruleVerdict(kind: string, zoneKey: string): { verdict: RuleVerdict; why: string | null } {
  const rule = PLACEMENT_RULES[kind]
  if (!rule) return { verdict: 'neutral', why: null }
  if (rule.ideal.includes(zoneKey)) return { verdict: 'ideal', why: rule.why.ideal ?? null }
  if (rule.good.includes(zoneKey)) return { verdict: 'good', why: rule.why.good ?? null }
  if (rule.avoid.includes(zoneKey)) return { verdict: 'avoid', why: rule.why.avoid ?? null }
  if (rule.caution.includes(zoneKey)) return { verdict: 'caution', why: rule.why.caution ?? null }
  return { verdict: 'neutral', why: null }
}

function VerdictPill({ verdict }: { verdict: RuleVerdict }) {
  const sev: Severity = verdict === 'avoid' ? 'bad' : verdict === 'caution' ? 'warn' : verdict === 'neutral' ? 'info' : 'good'
  const label = verdict === 'ideal' ? 'Ideal' : verdict === 'good' ? 'Good' : verdict === 'avoid' ? 'Avoid' : verdict === 'caution' ? 'Caution' : 'Neutral'
  return <Pill sev={sev}>{label}</Pill>
}

/** Extra zone/pada context for a finding row — built from the same placementOf() the rest of
 *  the app uses, so this wording never drifts from RightPanel/CanvasOverlays. */
function findingContext(f: Finding, markers: Marker[], center: Pt, northDeg: number):
  { zoneLabel: string; theme: string; extra: string | null } | null {
  if (f.zoneIdx != null) {
    const z = ZONES16[f.zoneIdx]
    return { zoneLabel: `${z.key} — ${z.name}`, theme: z.theme, extra: null }
  }
  if (f.markerId) {
    const m = markers.find((x) => x.id === f.markerId)
    if (m) {
      const pl = placementOf(m.p, center, northDeg)
      return {
        zoneLabel: `${pl.zone.key} — ${pl.zone.name}`,
        theme: pl.zone.theme,
        // padas are already broken out in their own report column/section for entrances
        // and rooms alike — here in the findings list only the entrance's devata earns
        // a repeat mention, so a room finding doesn't get a "pada" label that isn't its idiom
        extra: m.kind === 'entrance'
          ? `${pl.pada.devta} devata · ${pl.bearing.toFixed(1)}° from centre`
          : `${pl.bearing.toFixed(1)}° from centre`,
      }
    }
  }
  return null
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** North-aligned bounding-box extents — the plot rotated into the north frame,
 *  kept as width/height so the report can quote E–W × N–S dimensions. */
function northAlignedExtents(sampled: Pt[], center: Pt, northDeg: number): { ew: number; ns: number } | null {
  if (sampled.length < 3) return null
  const rad = (-northDeg * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of sampled) {
    const x = center.x + (p.x - center.x) * cos - (p.y - center.y) * sin
    const y = center.y + (p.x - center.x) * sin + (p.y - center.y) * cos
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { ew: maxX - minX, ns: maxY - minY }
}

function northSourceLabel(src: NorthSource): string {
  switch (src) {
    case 'map': return 'derived automatically from the map capture — confirm on site with a compass'
    case 'plan': return "traced from the plan's own north arrow"
    case 'manual': return 'set manually by the practitioner'
    default: return 'not set — treated as drawn, not yet confirmed against true north'
  }
}

function scaleSourceLabel(src: ScaleSource): string {
  switch (src) {
    case 'manual': return 'measured manually on the plan'
    case 'dxf': return 'read from the DXF drawing units'
    case 'map': return 'derived from the map capture'
    case 'pdf': return 'read from the imported PDF page'
    case 'demo': return 'demo scale — not a real measurement'
    default: return ''
  }
}

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
  const scaleSource = useStore((s) => s.scaleSource)
  const unit = useStore((s) => s.unit)
  const markers = useStore((s) => s.markers)
  const roomShapes = useStore((s) => s.roomShapes)
  const projectName = useStore((s) => s.projectName)
  const compass = useStore((s) => s.compass)

  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [imgBlob, setImgBlob] = useState<Blob | null>(null)
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)
  const [imgFailed, setImgFailed] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    void makePlanPng().then((out) => {
      if (!out || cancelled) return
      url = URL.createObjectURL(out.blob)
      setImgBlob(out.blob)
      setImgDims({ w: out.w, h: out.h })
      setImgUrl(url)
    }).catch(() => {
      if (cancelled) return
      setImgFailed(true)
      useStore.getState().toast('Plan image couldn’t be rendered — the report still prints without it', 'warn')
    })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [])

  const sampled = useMemo(() => sampledPolygon(pts, bulges, closed), [pts, bulges, closed])
  const center = useMemo(() => centerOverride ?? (pts.length >= 3 ? centroid(sampled) : null), [centerOverride, pts.length, sampled])
  const rows = useMemo(() => (closed && center ? zoneRows(sampled, center, northDeg) : null), [closed, center, sampled, northDeg])
  const extents = useMemo(
    () => (closed && center ? northAlignedExtents(sampled, center, northDeg) : null),
    [closed, center, sampled, northDeg],
  )
  const brahmaRadiusPx = useMemo(
    () => (closed && center ? brahmasthanRadius(sampled) * (compass.brahmaPct / 100) : null),
    [closed, center, sampled, northDeg, compass.brahmaPct],
  )
  // drawn rooms report as pseudo-markers at their bbox centre — same list RightPanel analyses
  const items = useMemo<Marker[]>(
    () => [...markers, ...roomShapes.flatMap((r) => {
      const p = roomShapeAnchor(r)
      return p ? [{ id: r.id, kind: r.kind, label: r.label, note: r.note, p }] : []
    })],
    [markers, roomShapes],
  )
  const ev = useMemo(
    () => (closed && center ? evaluateVastu({ sampled, center, northDeg, markers: items, brahmaPct: compass.brahmaPct }) : null),
    [closed, center, sampled, northDeg, items, compass.brahmaPct],
  )
  const sevCounts = useMemo<Record<Severity, number>>(() => {
    const c: Record<Severity, number> = { good: 0, info: 0, warn: 0, bad: 0 }
    ev?.findings.forEach((f) => { c[f.severity] += 1 })
    return c
  }, [ev])
  const verdictLine = useMemo(() => {
    if (!ev) return null
    if (ev.findings.length === 0) {
      return items.length === 0
        ? 'No entrances or rooms are marked yet — pin them on the plan for this report to generate findings.'
        : 'No strongly favourable or unfavourable signals yet for the items marked.'
    }
    const { good, warn, bad } = sevCounts
    if (bad > 0) {
      const extras = [
        warn > 0 ? `${plural(warn, 'point')} of caution` : null,
        good > 0 ? plural(good, 'favourable point') : null,
      ].filter(Boolean).join(' and ')
      return `${plural(bad, 'finding')} flagged to address${extras ? `, plus ${extras} noted` : ''}.`
    }
    if (warn > 0) return `No serious doshas flagged — ${plural(warn, 'point')} of caution noted${good > 0 ? ` alongside ${plural(good, 'favourable point')}` : ''}.`
    if (good > 0) return `A favourable layout overall — ${plural(good, 'favourable point')} noted, nothing flagged for concern.`
    return 'No strongly favourable or unfavourable signals yet for the items marked.'
  }, [ev, sevCounts, items])
  const shapeFindingByZone = useMemo(() => {
    const map = new Map<number, Finding>()
    ev?.findings.forEach((f) => { if (f.zoneIdx != null) map.set(f.zoneIdx, f) })
    return map
  }, [ev])
  const assessment = useMemo(() => {
    if (!ev || !center || !closed || !rows) return null
    const strongest = rows.reduce((a, b) => (b.pct > a.pct ? b : a))
    const weakest = rows.reduce((a, b) => (b.pct < a.pct ? b : a))
    return buildAssessment({ items, center, northDeg, findings: ev.findings, strongest, weakest })
  }, [ev, center, closed, rows, items, northDeg])

  const entrances = items.filter((m) => m.kind === 'entrance')
  const others = items.filter((m) => m.kind !== 'entrance')
  const kindsPresent = Array.from(new Set(others.map((m) => m.kind))).filter((k) => PLACEMENT_RULES[k])
  const curvedEdgeCount = bulges.filter((b) => Math.abs(b) > 1e-4).length
  const scaleLabel = scaleSourceLabel(scaleSource)
  const northLabel = northSourceLabel(northSource)
  const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const doPrint = () => {
    try {
      if (typeof window.print !== 'function') throw new Error('print unavailable')
      window.print()
    } catch {
      useStore.getState().toast('Printing isn’t available here — use Save as PDF instead', 'info')
    }
  }

  const doSavePdf = async () => {
    setPdfBusy(true)
    try {
      // the export PNG is device-resolution (huge) — resample to a document-friendly
      // JPEG before embedding, or the PDF balloons past what email/WhatsApp accepts
      let plan: ReportPdfData['plan'] = null
      if (imgBlob && imgDims) {
        const url = URL.createObjectURL(imgBlob)
        try {
          const img = new Image()
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject(new Error('plan decode failed'))
            img.src = url
          })
          const sc = Math.min(1, 1500 / img.width)
          const c = document.createElement('canvas')
          c.width = Math.round(img.width * sc)
          c.height = Math.round(img.height * sc)
          c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
          plan = { dataUrl: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height }
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      const facts: ReportPdfData['facts'] = []
      if (closed && metersPerPx) {
        facts.push({ label: 'Area', value: formatArea(polygonArea(sampled) * metersPerPx ** 2, unit) })
        facts.push({ label: 'Perimeter', value: formatLen(perimeter(sampled, true) * metersPerPx, unit) })
        if (extents) facts.push({ label: 'Dimensions', value: `≈ ${formatLen(extents.ew * metersPerPx, unit)} E–W × ${formatLen(extents.ns * metersPerPx, unit)} N–S` })
        if (brahmaRadiusPx != null) facts.push({ label: 'Brahmasthan', value: `${formatLen(brahmaRadiusPx * metersPerPx, unit)} radius from centre` })
      }
      facts.push({ label: 'Boundary', value: `${pts.length} vertices${curvedEdgeCount > 0 ? `, ${curvedEdgeCount} curved` : ''}` })
      facts.push({ label: 'Scale', value: `${formatScale(metersPerPx, unit)}${metersPerPx && scaleLabel ? ` — ${scaleLabel}` : ''}` })
      facts.push({ label: 'North', value: `${northDeg}° — ${northLabel}` })

      const findingsData: ReportPdfData['findings'] = (ev?.findings ?? []).map((f) => {
        const ctx = center ? findingContext(f, items, center, northDeg) : null
        return {
          severity: f.severity,
          text: `${f.title}. ${f.detail}.${ctx ? ` ${ctx.zoneLabel} — ${ctx.theme}${ctx.extra ? ` · ${ctx.extra}` : ''}` : ''}`,
        }
      })

      const entrancesData: ReportPdfData['entrances'] = center ? entrances.map((m) => {
        const pl = placementOf(m.p, center, northDeg)
        const q = GATE_QUALITY[pl.pada.code]
        const sideGood = GATES32
          .filter((g) => g.code[0] === pl.pada.code[0] && GATE_QUALITY[g.code]?.v === 'good')
          .map((g) => g.code)
        const lines = [
          `Pada ${pl.pada.code} · ${pl.pada.devta}, in the ${pl.zone.key} zone (${pl.zone.name} — ${pl.zone.theme}), ${pl.bearing.toFixed(1)}° from the centre.`,
          q?.note ? `${q.note}.` : null,
          q?.v !== 'good' && sideGood.length ? `More favourable gates on this side: ${sideGood.join(', ')}.` : null,
          m.note ?? null,
        ].filter((x): x is string => !!x)
        return {
          title: m.label,
          badge: q?.v === 'good' ? 'Auspicious' : q?.v === 'caution' ? 'Challenging' : 'Neutral',
          badgeSev: q?.v === 'good' ? 'good' as const : q?.v === 'caution' ? 'warn' as const : 'info' as const,
          lines,
        }
      }) : []

      const roomsData: ReportPdfData['rooms'] = center ? others.map((m) => {
        const pl = placementOf(m.p, center, northDeg)
        const { verdict, why } = ruleVerdict(m.kind, pl.zone.key)
        return {
          item: m.label,
          type: markerKindMeta(m.kind).name,
          zone: `${pl.zone.key} — ${pl.zone.name}`,
          pada: `${pl.pada.code} ${pl.pada.devta}`,
          verdict: verdict === 'ideal' ? 'Ideal' : verdict === 'good' ? 'Good' : verdict === 'avoid' ? 'Avoid' : verdict === 'caution' ? 'Caution' : 'Neutral',
          verdictSev: verdict === 'avoid' ? 'bad' as const : verdict === 'caution' ? 'warn' as const : verdict === 'neutral' ? 'info' as const : 'good' as const,
          why: why ? `${why}.` : null,
        }
      }) : []

      const zonesData: ReportPdfData['zones'] = (rows ?? []).map((r, i) => {
        const flag = shapeFindingByZone.get(i)
        const over = flag ? /extended/.test(flag.title) : false
        return {
          color: r.color,
          key: r.key,
          name: r.name,
          theme: r.theme,
          share: `${r.pct.toFixed(1)}%`,
          area: metersPerPx ? formatArea(r.areaPx * metersPerPx ** 2, unit) : null,
          status: flag ? (over ? 'Over-occupied' : 'Under-used') : 'Balanced',
          statusSev: flag ? flag.severity : null,
        }
      })

      const { exportReportPdf } = await import('../reportPdf')
      await exportReportPdf({
        projectName,
        date: dateStr,
        client: report.client,
        address: report.address,
        practitioner: report.practitioner,
        notes: report.notes,
        disclaimer: ANALYSIS_DISCLAIMER,
        verdictLine,
        sevCounts,
        plan,
        planCaption: `Scale ${formatScale(metersPerPx, unit)} · North ${northDeg}° · angles measured clockwise from true north`,
        facts,
        assessment,
        findings: findingsData,
        entrances: entrancesData,
        rooms: roomsData,
        zones: zonesData,
      })
    } catch {
      useStore.getState().toast('Could not build the PDF — Print still works', 'warn')
    } finally {
      setPdfBusy(false)
    }
  }

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
        <button className="btn-primary" disabled={pdfBusy} onClick={() => void doSavePdf()}>
          <FileDown size={15} />
          <span className="btn-label-lg">{pdfBusy ? 'Preparing…' : 'Save as PDF'}</span>
          <span className="btn-label-sm">{pdfBusy ? '…' : 'PDF'}</span>
        </button>
        <button className="btn-ghost" onClick={doPrint}>
          <Printer size={15} />
          <span className="btn-label-lg">Print</span>
          <span className="btn-label-sm">Print</span>
        </button>
        <button className="btn-ghost" disabled={!imgBlob} onClick={() => void share()}><Share2 size={15} /> Share</button>
        <button className="btn-ghost" onClick={() => setReportOpen(false)}><X size={15} /> Close</button>
      </div>

      <div className="report-page">
        <header className="report-head">
          <div>
            <h1>Vastu Analysis Report</h1>
            <div className="report-sub">{projectName}</div>
            <div className="report-coverline">
              <span><b>Date</b> {dateStr}</span>
              {report.practitioner && <span><b>Prepared by</b> {report.practitioner}</span>}
              {report.client && <span><b>Client</b> {report.client}</span>}
            </div>
          </div>
          <svg width="44" height="44" viewBox="0 0 32 32" aria-hidden>
            <rect x="8.2" y="8.2" width="15.6" height="15.6" rx="1.5" transform="rotate(45 16 16)"
              fill="none" stroke="#B8963E" strokeWidth="2" />
            <circle cx="16" cy="16" r="2.6" fill="#B8963E" />
          </svg>
        </header>

        <div className="report-meta">
          {/* .print-value twins: print engines clip form controls to their box, so each
              field's full text prints from a mirror div while the control hides (report.css) */}
          <label>Client <input value={report.client} placeholder="Client name"
            onChange={(e) => setReport({ client: e.target.value })} />
            <span className="print-value">{report.client}</span></label>
          <label>Address <input value={report.address} placeholder="Site address"
            onChange={(e) => setReport({ address: e.target.value })} />
            <span className="print-value">{report.address}</span></label>
          <label>Practitioner <input value={report.practitioner} placeholder="Your name"
            onChange={(e) => setReport({ practitioner: e.target.value })} />
            <span className="print-value">{report.practitioner}</span></label>
        </div>

        {ev && (
          <section>
            <h2>Summary</h2>
            <div className="report-scoreboard">
              <div className="report-stat report-stat-good">
                <span className="report-stat-num">{sevCounts.good}</span>
                <span className="report-stat-label">Favourable</span>
              </div>
              <div className="report-stat report-stat-warn">
                <span className="report-stat-num">{sevCounts.warn}</span>
                <span className="report-stat-label">Caution</span>
              </div>
              <div className="report-stat report-stat-bad">
                <span className="report-stat-num">{sevCounts.bad}</span>
                <span className="report-stat-label">To address</span>
              </div>
              <div className="report-stat report-stat-info">
                <span className="report-stat-num">{sevCounts.info}</span>
                <span className="report-stat-label">Noted</span>
              </div>
            </div>
            {verdictLine && <p className="report-verdict">{verdictLine}</p>}
          </section>
        )}

        {assessment && (
          <section>
            <h2>Assessment — what can change, and what cannot</h2>
            <p className="report-assess-summary">{assessment.summary}</p>
            {assessment.improvable.length > 0 && (
              <>
                <div className="report-assess-h good">Can be improved</div>
                <div className="report-assess-list">
                  {assessment.improvable.map((it, i) => (
                    <div key={i} className="report-assess-item">
                      <b>{it.title}.</b> {it.detail}
                    </div>
                  ))}
                </div>
              </>
            )}
            {assessment.structural.length > 0 && (
              <>
                <div className="report-assess-h info">Fixed characteristics — plan around these</div>
                <div className="report-assess-list">
                  {assessment.structural.map((it, i) => (
                    <div key={i} className="report-assess-item">
                      <b>{it.title}.</b> {it.detail}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        <div className="report-disclaimer">{ANALYSIS_DISCLAIMER}</div>

        {imgUrl
          ? <img className="report-plan" src={imgUrl} alt="Analysed plan" />
          : <div className="report-plan report-plan-loading">{imgFailed ? 'Plan image unavailable' : 'Rendering plan…'}</div>}

        <section>
          <h2>Property facts</h2>
          <div className="report-facts">
            {closed && metersPerPx && (
              <>
                <span><b>Area</b> {formatArea(polygonArea(sampled) * metersPerPx ** 2, unit)}</span>
                <span><b>Perimeter</b> {formatLen(perimeter(sampled, true) * metersPerPx, unit)}</span>
                {extents && (
                  <span><b>Dimensions</b> ≈ {formatLen(extents.ew * metersPerPx, unit)} E–W × {formatLen(extents.ns * metersPerPx, unit)} N–S</span>
                )}
                {brahmaRadiusPx != null && (
                  <span><b>Brahmasthan</b> {formatLen(brahmaRadiusPx * metersPerPx, unit)} radius from centre
                    {compass.brahmaPct !== 100 ? ` (set to ${compass.brahmaPct}% of the drawing-derived size)` : ''}</span>
                )}
              </>
            )}
            {closed && !metersPerPx && (
              <span className="report-note">Scale not set — area, perimeter and the Brahmasthan size can't be computed for this plan.</span>
            )}
            <span><b>Boundary</b> {pts.length} vertices{curvedEdgeCount > 0 ? `, ${curvedEdgeCount} curved` : ''}</span>
            <span><b>Scale</b> {formatScale(metersPerPx, unit)}{metersPerPx && scaleLabel ? ` — ${scaleLabel}` : ''}</span>
            <span><b>North</b> {northDeg}° — {northLabel}</span>
          </div>
        </section>

        {ev && ev.findings.length > 0 && (
          <section>
            <h2>Vastu findings</h2>
            <div className="report-findings">
              {ev.findings.map((f, i) => {
                const ctx = center ? findingContext(f, items, center, northDeg) : null
                return (
                  <div key={i} className={`report-finding sev-${f.severity}`}>
                    <span className="report-finding-mark">
                      {f.severity === 'good' ? '✓' : f.severity === 'bad' ? '✕' : f.severity === 'warn' ? '!' : 'ℹ'}
                    </span>
                    <span>
                      <b>{f.title}.</b> {f.detail}.
                      {ctx && (
                        <span className="report-finding-ctx"> {ctx.zoneLabel} — {ctx.theme}{ctx.extra ? ` · ${ctx.extra}` : ''}</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {center && entrances.length > 0 && (
          <section>
            <h2>Entrances</h2>
            {entrances.map((m) => {
              const pl = placementOf(m.p, center, northDeg)
              const q = GATE_QUALITY[pl.pada.code]
              const sideGood = GATES32
                .filter((g) => g.code[0] === pl.pada.code[0] && GATE_QUALITY[g.code]?.v === 'good')
                .map((g) => g.code)
              return (
                <div key={m.id} className="report-entrance">
                  <div className="report-entrance-head">
                    <b>{m.label}</b>
                    {q?.v === 'good' && <Pill sev="good">Auspicious</Pill>}
                    {q?.v === 'caution' && <Pill sev="warn">Challenging</Pill>}
                    {!q && <Pill sev="info">Neutral</Pill>}
                  </div>
                  pada <b>{pl.pada.code} · {pl.pada.devta}</b> in the {pl.zone.key} zone
                  ({pl.zone.name} — {pl.zone.theme}), {pl.bearing.toFixed(1)}° from the centre.
                  {q?.note && <div className="report-note">{q.note}.</div>}
                  {q?.v !== 'good' && sideGood.length > 0 && (
                    <div className="report-note">More favourable gates on this side, per the classical gate chart: {sideGood.join(', ')}.</div>
                  )}
                  {m.note && <div className="report-note">{m.note}</div>}
                </div>
              )
            })}
          </section>
        )}

        {center && others.length > 0 && (
          <section>
            <h2>Rooms & objects</h2>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead><tr><th>Item</th><th>Type</th><th>Zone</th><th>Pada</th><th>Verdict</th><th>Notes</th></tr></thead>
                <tbody>
                  {others.map((m) => {
                    const pl = placementOf(m.p, center, northDeg)
                    const { verdict, why } = ruleVerdict(m.kind, pl.zone.key)
                    return (
                      <Fragment key={m.id}>
                        <tr>
                          <td>{m.label}</td>
                          <td>{markerKindMeta(m.kind).name}</td>
                          <td><span className="report-zonechip" style={{ background: pl.zone.color }} />{pl.zone.key} — {pl.zone.name}</td>
                          <td>{pl.pada.code} {pl.pada.devta}</td>
                          <td><VerdictPill verdict={verdict} /></td>
                          <td>{m.note ?? ''}</td>
                        </tr>
                        {why && (
                          <tr className="report-subrow">
                            <td colSpan={6} className="report-note">{why}.</td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {kindsPresent.length > 0 && (
              <div className="report-rulekey">
                <div className="report-rulekey-title">Classical placement reference, for the room types above</div>
                {kindsPresent.map((k) => {
                  const rule = PLACEMENT_RULES[k]
                  return (
                    <div key={k} className="report-rulekey-row">
                      <b>{markerKindMeta(k).name}</b>
                      {rule.ideal.length > 0 && <span> · ideal {rule.ideal.join(', ')}</span>}
                      {rule.good.length > 0 && <span> · good {rule.good.join(', ')}</span>}
                      {rule.caution.length > 0 && <span> · caution {rule.caution.join(', ')}</span>}
                      {rule.avoid.length > 0 && <span> · avoid {rule.avoid.join(', ')}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {rows && (
          <section>
            <h2>Zone balance (16 zones)</h2>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead><tr><th></th><th>Zone</th><th>Theme</th><th>Share</th>{metersPerPx && <th>Area</th>}<th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const flag = shapeFindingByZone.get(i)
                    const over = flag ? /extended/.test(flag.title) : false
                    return (
                      <Fragment key={r.key}>
                        <tr>
                          <td><span className="report-zonechip" style={{ background: r.color }} /></td>
                          <td><b>{r.key}</b> {r.name}</td>
                          <td>{r.theme}</td>
                          <td>{r.pct.toFixed(1)}%</td>
                          {metersPerPx && <td>{formatArea(r.areaPx * metersPerPx ** 2, unit)}</td>}
                          <td>
                            {flag
                              ? <Pill sev={flag.severity}>{over ? 'Over-occupied' : 'Under-used'}</Pill>
                              : <span className="lbl-balanced">Balanced</span>}
                          </td>
                        </tr>
                        {flag && (
                          <tr className="report-subrow">
                            <td colSpan={metersPerPx ? 6 : 5} className="report-note">{flag.detail}.</td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <h2>Observations & remedies</h2>
          <textarea className="report-notes" rows={6} value={report.notes}
            placeholder="Your overall observations, prescriptions and remedies for this property…"
            onChange={(e) => setReport({ notes: e.target.value })} />
          <div className="print-value">{report.notes}</div>
        </section>

        <footer className="report-foot">
          Generated with Vastu Studio · angles measured clockwise from true north · zone areas by
          exact sector clipping of the traced boundary
        </footer>
      </div>
    </div>
  )
}
