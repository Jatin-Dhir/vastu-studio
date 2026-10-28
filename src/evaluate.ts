import { brahmasthanRadius, zoneRows } from './analysis'
import { dist, pointInPolygon } from './geometry'
import { formatLen } from './format'
import { ZONE_SHAPE_NOTES, type Verdict } from './vastu'
import { assessAll, capFirst, moveSentence, roomPolygon, type Assessment } from './assess'
import { ATIMARMA, marmaPoints } from './marma'
import type { Marker, Pt, RoomShape, Unit } from './types'

export type Severity = 'good' | 'info' | 'warn' | 'bad'

export interface Finding {
  severity: Severity
  title: string
  detail: string
  /** the marker or drawn room this is about */
  markerId?: string
  zoneIdx?: number
}

const SEV_ORDER: Record<Severity, number> = { bad: 0, warn: 1, info: 2, good: 3 }
export const SEV_OF: Record<Verdict, Severity> = { ideal: 'good', good: 'good', neutral: 'info', caution: 'warn', avoid: 'bad' }

export interface Evaluation {
  findings: Finding[]
  favourable: number
  attention: number
  /** every marked item, read where it sits — the findings above are written from these */
  assessments: Assessment[]
}

/** Where a drawn room/area anchors for analysis: its bounding-box centre — the same point
 *  Scene labels the shape at (rect, ellipse and polygon alike), so verdicts match the canvas. */
export function roomShapeAnchor(r: RoomShape): Pt | null {
  if (r.pts.length < 2) return null
  const xs = r.pts.map((p) => p.x)
  const ys = r.pts.map((p) => p.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}

/** What may not stand on a marma point: the impurities the texts name, and the weight, pits
 *  and pillars they keep off it. */
const MARMA_IMPURE = ['toilet', 'septic', 'dustbin']
const MARMA_HEAVY = ['water', 'staircase', 'store']

/** The interpretive pass: every marker and room against the charts (areas by their real
 *  zone coverage), entrances against the 32 gates, plot-shape cuts/extensions, Brahmasthan
 *  occupancy, and what stands on a marma point. */
export function evaluateVastu(args: {
  sampled: Pt[]
  center: Pt
  northDeg: number
  markers: Marker[]
  roomShapes?: RoomShape[]
  metersPerPx?: number | null
  unit?: Unit
  /** manual Brahmasthan size in % of the drawing-derived radius (default 100) */
  brahmaPct?: number
}): Evaluation {
  const { sampled, center, northDeg, markers } = args
  const roomShapes = args.roomShapes ?? []
  const fmtD = (px: number) => (args.metersPerPx ? formatLen(px * args.metersPerPx, args.unit ?? 'ft') : null)
  const findings: Finding[] = []
  const assessments = assessAll({ markers, roomShapes, center, northDeg })

  for (const a of assessments) {
    if (a.gate) {
      const g = a.gate
      const tail = g.verdict === 'avoid' ? ' — the charts advise remedies or an alternative entry'
        : g.verdict === 'caution' ? ' — classical texts advise remedies or an alternative entry' : ''
      const better = g.better.length > 0 && (g.verdict === 'avoid' || g.verdict === 'caution')
        ? ` Favourable gates on this wall: ${g.better.slice(0, 2).map((b) => `${b.code} ${b.devta}`).join(', ')}.` : ''
      findings.push({
        severity: SEV_OF[g.verdict], markerId: a.id,
        title: `${a.label}: ${a.headline}`,
        detail: `${g.note ?? 'a neutral gate in the classical reading'}${tail}${better}`,
      })
      continue
    }
    const move = moveSentence(a, fmtD)
    const keep = a.keepOut
      ? ` Keep it clear of ${a.keepOut.key} — ${Math.round(a.keepOut.pct)}% of it sits there (${a.keepOut.verdict}).`
      : ''
    // rows render `detail` bare and the report adds its own full stop, so no trailing period here
    findings.push({
      severity: SEV_OF[a.verdict], markerId: a.id,
      title: `${a.label} ${a.headline}`,
      detail: [a.why ? `${capFirst(a.why)}.` : null, move, keep.trim()].filter(Boolean).join(' ').replace(/\.$/, ''),
    })
  }

  /* Brahmasthan occupancy — sized from the drawing itself, never the compass */
  const bR = brahmasthanRadius(sampled) * ((args.brahmaPct ?? 100) / 100)
  for (const a of assessments) {
    if (a.gate) continue
    if (dist(a.anchor, center) < bR) {
      const heavy = ['toilet', 'kitchen', 'water', 'septic', 'dustbin', 'heater'].includes(a.kind)
      findings.push({
        severity: heavy ? 'bad' : 'warn', markerId: a.id,
        title: `${a.label} sits in the Brahmasthan`,
        detail: heavy
          ? 'toilets, kitchens and water sources in the centre are among the gravest doshas'
          : 'the centre should stay light and open — avoid weight and activity here',
      })
    }
  }

  /* Marma sthan: the nine points where the six vamshas cross (src/marma.ts). A room is on one
     when it covers the point, a marker when it sits within the point's own size. */
  const marma = marmaPoints(center, northDeg, sampled)
  if (marma) {
    for (const a of assessments) {
      if (a.gate) continue
      const impure = MARMA_IMPURE.includes(a.kind)
      if (!impure && !MARMA_HEAVY.includes(a.kind)) continue
      const room = a.isArea ? roomShapes.find((r) => r.id === a.id) : undefined
      const poly = room ? roomPolygon(room) : null
      const hit = marma.points.findIndex((p) => (poly ? pointInPolygon(p, poly) : dist(a.anchor, p) <= marma.r))
      if (hit < 0) continue
      // the central marma is the Brahmasthan's own centre, and that finding already names it
      if (hit === 0 && dist(a.anchor, center) < bR) continue
      findings.push({
        severity: impure ? 'bad' : 'warn', markerId: a.id,
        title: `${a.label} stands on a marma point`,
        detail: `${poly ? 'it covers' : 'it sits on'} ${ATIMARMA[hit].name}, where two vamshas cross — ${impure
          ? 'the texts keep a marma free of anything impure'
          : 'keep weight, pits and pillars off a marma'}`,
      })
    }
  }

  /* plot shape: cut / extended zones vs the even share */
  const rows = zoneRows(sampled, center, northDeg)
  if (rows) {
    rows.forEach((r, i) => {
      const note = ZONE_SHAPE_NOTES[r.key]
      if (r.pct < 3.2) {
        if (note?.cut) {
          findings.push({ severity: note.cutSev ?? 'warn', zoneIdx: i, title: `${r.key} is cut (${r.pct.toFixed(1)}%)`, detail: note.cut })
        } else {
          findings.push({ severity: 'info', zoneIdx: i, title: `${r.key} is compressed (${r.pct.toFixed(1)}%)`, detail: `the ${r.theme} zone is under-represented` })
        }
      } else if (r.pct > 9.8) {
        if (note?.ext) {
          findings.push({ severity: note.extSev === 'good' ? 'good' : 'warn', zoneIdx: i, title: `${r.key} is extended (${r.pct.toFixed(1)}%)`, detail: note.ext })
        } else {
          findings.push({ severity: 'info', zoneIdx: i, title: `${r.key} is extended (${r.pct.toFixed(1)}%)`, detail: `the ${r.theme} zone dominates the plot` })
        }
      }
    })
  }

  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  return {
    findings,
    favourable: findings.filter((f) => f.severity === 'good').length,
    attention: findings.filter((f) => f.severity === 'bad' || f.severity === 'warn').length,
    assessments,
  }
}
