import { brahmasthanRadius, placementOf, zoneRows } from './analysis'
import { dist } from './geometry'
import { GATE_QUALITY, PLACEMENT_RULES, ZONE_SHAPE_NOTES, ZONES16, markerKindMeta } from './vastu'
import type { Marker, Pt } from './types'

export type Severity = 'good' | 'info' | 'warn' | 'bad'

export interface Finding {
  severity: Severity
  title: string
  detail: string
  markerId?: string
  zoneIdx?: number
}

const SEV_ORDER: Record<Severity, number> = { bad: 0, warn: 1, info: 2, good: 3 }

export interface Evaluation {
  findings: Finding[]
  favourable: number
  attention: number
}

/** The interpretive pass: entrances vs the 32 gates, placements vs classical rules,
 *  plot-shape cuts/extensions, and Brahmasthan occupancy. */
export function evaluateVastu(args: {
  sampled: Pt[]
  center: Pt
  northDeg: number
  markers: Marker[]
  /** manual Brahmasthan size in % of the drawing-derived radius (default 100) */
  brahmaPct?: number
}): Evaluation {
  const { sampled, center, northDeg, markers } = args
  const findings: Finding[] = []

  /* entrances against the gates */
  for (const m of markers.filter((x) => x.kind === 'entrance')) {
    const pl = placementOf(m.p, center, northDeg)
    const q = GATE_QUALITY[pl.pada.code]
    if (q?.v === 'good') {
      findings.push({
        severity: 'good', markerId: m.id,
        title: `${m.label}: ${pl.pada.code} · auspicious gate`,
        detail: q.note,
      })
    } else if (q?.v === 'caution') {
      findings.push({
        severity: 'warn', markerId: m.id,
        title: `${m.label}: ${pl.pada.code} · challenging gate`,
        detail: `${q.note} — classical texts advise remedies or an alternative entry`,
      })
    } else {
      findings.push({
        severity: 'info', markerId: m.id,
        title: `${m.label}: ${pl.pada.code} · ${pl.pada.devta}`,
        detail: 'a neutral gate in the classical reading',
      })
    }
  }

  /* placements against the classical matrix */
  for (const m of markers.filter((x) => x.kind !== 'entrance' && x.kind !== 'custom')) {
    const rule = PLACEMENT_RULES[m.kind]
    if (!rule) continue
    const pl = placementOf(m.p, center, northDeg)
    const key = pl.zone.key
    const meta = markerKindMeta(m.kind)
    if (rule.ideal.includes(key)) {
      findings.push({ severity: 'good', markerId: m.id, title: `${m.label} in ${key} — ideal`, detail: rule.why.ideal ?? '' })
    } else if (rule.good.includes(key)) {
      findings.push({ severity: 'good', markerId: m.id, title: `${m.label} in ${key} — good`, detail: rule.why.good ?? '' })
    } else if (rule.avoid.includes(key)) {
      findings.push({ severity: 'bad', markerId: m.id, title: `${m.label} in ${key} — avoid`, detail: rule.why.avoid ?? `${meta.name} is classically avoided here` })
    } else if (rule.caution.includes(key)) {
      findings.push({ severity: 'warn', markerId: m.id, title: `${m.label} in ${key} — caution`, detail: rule.why.caution ?? '' })
    }
  }

  /* Brahmasthan occupancy — sized from the drawing itself, never the compass */
  const bR = brahmasthanRadius(sampled, center, northDeg) * ((args.brahmaPct ?? 100) / 100)
  for (const m of markers) {
    if (dist(m.p, center) < bR) {
      const heavy = m.kind === 'toilet' || m.kind === 'kitchen' || m.kind === 'water'
      findings.push({
        severity: heavy ? 'bad' : 'warn', markerId: m.id,
        title: `${m.label} sits in the Brahmasthan`,
        detail: heavy
          ? 'toilets, kitchens and water sources in the centre are among the gravest doshas'
          : 'the centre should stay light and open — avoid weight and activity here',
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
  }
}

export const ZONE_OF = ZONES16
