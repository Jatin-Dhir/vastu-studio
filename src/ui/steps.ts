import { useStore } from '../store'
import type { Tool } from '../types'

/** Sub-steps the guide walks through; the top-bar tracker shows the five headline ones. */
export type GuideStep =
  | 'import' | 'outline' | 'scale' | 'north' | 'analyse' | 'mark' | 'report' | 'done'

export interface TrackStep {
  id: 'import' | 'outline' | 'scale' | 'north' | 'report'
  label: string
  done: boolean
  skipped?: boolean
}

const REPORT_SEEN_KEY = 'vastu.reportSeen.v1'

export function markReportSeen(): void {
  try { localStorage.setItem(REPORT_SEEN_KEY, '1') } catch { /* private mode */ }
}
export function reportSeen(): boolean {
  try { return localStorage.getItem(REPORT_SEEN_KEY) === '1' } catch { return false }
}

/**
 * One derived truth for the whole journey — the stepper, the mobile chip and
 * the guide card all read this. Map captures auto-complete scale and north,
 * so the path shortens itself; scale can be skipped explicitly.
 */
export function useGuide(): { track: TrackStep[]; active: number; step: GuideStep } {
  const bg = useStore((s) => s.bg.kind !== 'none')
  const closed = useStore((s) => s.closed)
  const nPts = useStore((s) => s.pts.length)
  const scaled = useStore((s) => s.metersPerPx != null)
  const scaleSkipped = useStore((s) => s.scaleSkipped)
  const north = useStore((s) => s.northSource != null)
  const compassOn = useStore((s) => s.compass.id !== 'none')
  const nMarkers = useStore((s) => s.markers.length)

  const track: TrackStep[] = [
    { id: 'import', label: 'Import', done: bg },
    { id: 'outline', label: 'Outline', done: closed },
    { id: 'scale', label: 'Scale', done: scaled, skipped: !scaled && scaleSkipped },
    { id: 'north', label: 'North', done: north },
    { id: 'report', label: 'Report', done: closed && compassOn && reportSeen() },
  ]
  const active = track.findIndex((s) => !s.done && !s.skipped)

  let step: GuideStep = 'done'
  if (!bg) step = 'import'
  else if (!closed) step = 'outline'
  else if (!scaled && !scaleSkipped) step = 'scale'
  else if (!north) step = 'north'
  else if (!compassOn) step = 'analyse'
  else if (nMarkers === 0) step = 'mark'
  else if (!reportSeen()) step = 'report'
  void nPts
  return { track, active, step }
}

/** Fire the right action for a headline step (stepper + chip). */
export function goToStep(id: TrackStep['id']): void {
  const s = useStore.getState()
  if (s.bg.kind === 'none' && id !== 'import') {
    s.toast('Import a plan first — everything else builds on it', 'info')
    window.dispatchEvent(new CustomEvent('vastu:open-file'))
    return
  }
  const arm = (t: Tool) => {
    s.setTool(t)
    if (window.innerWidth <= 760) s.setSheetPos('peek') // the canvas is the work surface now
  }
  if (id === 'import') window.dispatchEvent(new CustomEvent('vastu:open-file'))
  else if (id === 'outline') arm('trace')
  else if (id === 'scale') arm('calibrate')
  else if (id === 'north') arm('north')
  else if (id === 'report') {
    if (!s.closed) {
      s.toast('Close the outline first — the report needs the boundary', 'warn')
      arm('trace')
      return
    }
    if (s.compass.id === 'none') s.setCompass({ id: 'zones16' })
    s.setReportOpen(true)
    markReportSeen()
  }
}
