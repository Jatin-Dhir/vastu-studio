import { useMemo } from 'react'
import { FileText } from 'lucide-react'
import { useStore } from '../store'
import { evaluateVastu, type Severity } from '../evaluate'
import { centroid, sampledPolygon } from '../geometry'
import { analysisAllowed, requireAnalysis } from '../auth/gate'
import { ItemsCard } from '../ui/RightPanel'
import { useChartsVersion } from '../ui/useChartsVersion'

const LABEL: Record<Severity, string> = { good: 'Favourable', warn: 'Caution', bad: 'To address', info: 'Noted' }

/** The plan's verdict at a glance, and the door to the full client report. */
export function ReportScreen() {
  const pts = useStore((s) => s.pts)
  const bulges = useStore((s) => s.bulges)
  const closed = useStore((s) => s.closed)
  const centerOverride = useStore((s) => s.centerOverride)
  const northDeg = useStore((s) => s.northDeg)
  const markers = useStore((s) => s.markers)
  const roomShapes = useStore((s) => s.roomShapes)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const unit = useStore((s) => s.unit)
  const brahmaPct = useStore((s) => s.compass.brahmaPct)
  const projectName = useStore((s) => s.projectName)
  const setTab = useStore((s) => s.setMobileTab)
  const ok = analysisAllowed(useStore((s) => s.auth), useStore((s) => s.chartsReady))
  const chartsV = useChartsVersion()
  const sampled = useMemo(() => sampledPolygon(pts, bulges, closed), [pts, bulges, closed])
  const center = useMemo(() => (closed && pts.length >= 3 ? centerOverride ?? centroid(sampled) : null), [closed, pts.length, centerOverride, sampled])
  const ev = useMemo(
    () => (center && ok ? evaluateVastu({ sampled, center, northDeg, markers, roomShapes, metersPerPx, unit, brahmaPct }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [center, ok, sampled, northDeg, markers, roomShapes, metersPerPx, unit, brahmaPct, chartsV],
  )

  if (!closed || !center) {
    return (
      <div className="m-scroll">
        <header className="m-head"><h1>Report</h1><p>Close the plot outline in the studio and the report writes itself.</p></header>
        <button className="btn-primary m-btn" onClick={() => setTab('studio')}>Go to the studio</button>
      </div>
    )
  }
  if (!ok || !ev) {
    return (
      <div className="m-scroll">
        <header className="m-head"><h1>Report</h1><p>The reading needs your account's charts. Sign in on the Account tab.</p></header>
      </div>
    )
  }
  const counts: Record<Severity, number> = { good: 0, warn: 0, bad: 0, info: 0 }
  ev.findings.forEach((f) => { counts[f.severity] += 1 })
  const line = ev.findings.length === 0
    ? 'Mark the rooms and the main door for the report to speak to specific placements.'
    : counts.bad > 0 ? `${counts.bad} ${counts.bad === 1 ? 'placement needs' : 'placements need'} attention${counts.good ? `, ${counts.good} favourable` : ''}.`
      : counts.warn > 0 ? `${counts.warn} ${counts.warn === 1 ? 'point' : 'points'} of caution${counts.good ? `, ${counts.good} favourable` : ''}.`
        : 'Everything marked sits in a favourable zone.'

  return (
    <div className="m-scroll">
      <header className="m-head"><h1>{projectName}</h1><p>{line}</p></header>
      <div className="m-counters">
        {(['good', 'warn', 'bad', 'info'] as Severity[]).map((s) => (
          <div key={s} className={`m-counter sev-${s} ${counts[s] === 0 ? 'zero' : ''}`}><b>{counts[s]}</b><span>{LABEL[s]}</span></div>
        ))}
      </div>
      <button className="btn-primary m-btn" onClick={() => { if (requireAnalysis()) useStore.getState().setReportOpen(true) }}>
        <FileText size={16} /> Open the full report · PDF
      </button>
      {markers.length + roomShapes.length > 0 && <ItemsCard markers={markers} roomShapes={roomShapes} center={center} northDeg={northDeg} />}
      {ev.findings.length > 0 && (
        <section className="card">
          <header className="card-head"><h2>Findings</h2></header>
          <div className="finding-list">
            {ev.findings.map((f, i) => (
              <div key={i} className={`finding-row sev-${f.severity}`}><b>{f.title}</b><span>{f.detail}</span></div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
