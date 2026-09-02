import type { Marker, Pt } from './types'
import { placementOf } from './analysis'
import type { Finding } from './evaluate'
import { GATES32, GATE_QUALITY, PLACEMENT_RULES, ZONES16, markerKindMeta } from './vastu'
import { zoneEffect } from './rules16'

/**
 * The written assessment: what about this property can be improved, and what is a
 * fixed characteristic to plan around. Every sentence is assembled from the same
 * verified rule data the findings use (PLACEMENT_RULES.why, GATE_QUALITY notes,
 * shape findings) — nothing here invents doctrine of its own.
 */

export interface AssessmentItem {
  title: string
  detail: string
}

export interface Assessment {
  summary: string
  improvable: AssessmentItem[]
  structural: AssessmentItem[]
}

/** Things a client can pick up and move vs. plumbing/civil work vs. the building itself. */
const MOVABLE: Record<string, boolean> = {
  bed: true, pooja: true, water: true, custom: true,
  tv: true, computer: true, washing: true, dustbin: true, safe: true, music: true,
  inverter: true, crockery: true, heater: true, medicine: true, pet: true, bar: true,
}
const PLUMBED: Record<string, boolean> = { kitchen: true, toilet: true, septic: true }

function seatList(kind: string): string {
  const rule = PLACEMENT_RULES[kind]
  if (!rule) return ''
  const parts: string[] = []
  if (rule.ideal.length) parts.push(`${rule.ideal.join('/')} (ideal)`)
  if (rule.good.length) parts.push(rule.good.join('/'))
  return parts.join(', ')
}

export function buildAssessment(args: {
  items: Marker[]
  center: Pt
  northDeg: number
  findings: Finding[]
  strongest: { key: string; pct: number } | null
  weakest: { key: string; pct: number } | null
}): Assessment {
  const { items, center, northDeg, findings } = args
  const improvable: AssessmentItem[] = []
  const structural: AssessmentItem[] = []

  const entrances = items.filter((m) => m.kind === 'entrance')
  const others = items.filter((m) => m.kind !== 'entrance')

  let wellPlaced = 0
  let offSeat = 0

  for (const m of others) {
    const rule = PLACEMENT_RULES[m.kind]
    if (!rule) continue
    const pl = placementOf(m.p, center, northDeg)
    const zk = pl.zone.key
    if (rule.ideal.includes(zk) || rule.good.includes(zk)) { wellPlaced += 1; continue }
    const bad = rule.avoid.includes(zk)
    const caution = rule.caution.includes(zk)
    if (!bad && !caution) continue
    offSeat += 1
    // the charts' own per-zone line, wherever one exists
    const why = zoneEffect(m.kind, zk) ?? (bad ? rule.why.avoid : rule.why.caution) ?? 'not a classical seat for it'
    const kindName = markerKindMeta(m.kind).name.toLowerCase()
    const seats = seatList(m.kind)
    if (MOVABLE[m.kind]) {
      improvable.push({
        title: `Relocate ${m.label} out of ${zk}`,
        detail: `A ${kindName} in ${zk} (${pl.zone.name}) — ${why}. This is furniture-level work, no construction: the classical seats are ${seats}.`,
      })
    } else if (PLUMBED[m.kind]) {
      improvable.push({
        title: `Mitigate ${m.label} in ${zk}`,
        detail: `A ${kindName} in ${zk} (${pl.zone.name}) — ${why}. Relocation means plumbing and civil work, so classical practice first mitigates in place${m.kind === 'toilet' ? ' (keep it sealed, ventilated and closed)' : ' (shift the cooking fire within the room toward its favourable corner)'}. If a remodel is ever on the table, the classical seats are ${seats}.`,
      })
    } else {
      improvable.push({
        title: `Review ${m.label} in ${zk}`,
        detail: `${why}. Classical seats: ${seats}.`,
      })
    }
  }

  for (const m of entrances) {
    const pl = placementOf(m.p, center, northDeg)
    const q = GATE_QUALITY[pl.pada.code]
    const sideGood = GATES32
      .filter((g) => g.code[0] === pl.pada.code[0] && GATE_QUALITY[g.code]?.v === 'good')
      .map((g) => g.code)
    if (q?.v === 'caution' || q?.v === 'avoid') {
      improvable.push({
        title: `Work on the ${pl.pada.code} entrance (${m.label})`,
        detail: `${q.note}. The opening itself is structural, so classical practice treats the gate rather than the wall${sideGood.length ? ` — and if this side ever gains a second doorway, the favourable gates on it are ${sideGood.join(', ')}` : ''}.`,
      })
      structural.push({
        title: `${m.label} sits on pada ${pl.pada.code} · ${pl.pada.devta}`,
        detail: `Its position in the ${pl.zone.key} wall is a built fact of the property — remedies can soften it, but only construction can move it.`,
      })
    } else if (q?.v === 'good') {
      structural.push({
        title: `${m.label} on ${pl.pada.code} · ${pl.pada.devta} is an asset`,
        detail: `${q.note}. A favourable, permanent characteristic — nothing to change here.`,
      })
    }
  }

  // plot-shape findings (cut / extended zones) are geometry — the plot cannot move
  for (const f of findings) {
    if (f.zoneIdx == null) continue
    const z = ZONES16[f.zoneIdx]
    structural.push({
      title: `${z.key} (${z.name}) — ${/extended/i.test(f.title) ? 'extended' : 'cut'} by the plot's shape`,
      detail: `${f.detail}. The boundary is fixed, so this is planned around through what the ${z.key} zone is used for, not rebuilt.`,
    })
  }

  // Brahmasthan occupancy reads as improvable — the occupant moves, the centre doesn't
  for (const f of findings) {
    if (/brahmasthan/i.test(f.title) && f.severity !== 'good' && f.markerId) {
      const m = items.find((x) => x.id === f.markerId)
      if (m) {
        improvable.push({
          title: `Free the Brahmasthan of ${m.label}`,
          detail: `${f.detail}. The centre itself is fixed; what occupies it is not — classical practice keeps the central ninth open and light.`,
        })
      }
    }
  }

  const bits: string[] = []
  if (others.length > 0) {
    bits.push(`Of the ${others.length} placements marked, ${wellPlaced} sit in their classically favourable zones and ${offSeat} ${offSeat === 1 ? 'calls' : 'call'} for attention.`)
  }
  if (args.strongest && args.weakest) {
    bits.push(`The plot gives its most area to ${args.strongest.key} (${args.strongest.pct.toFixed(1)}%) and its least to ${args.weakest.key} (${args.weakest.pct.toFixed(1)}%).`)
  }
  if (improvable.length > 0) {
    bits.push(`${improvable.length === 1 ? 'One point' : `${improvable.length} points`} below can be improved without touching the structure.`)
  } else if (others.length > 0 || entrances.length > 0) {
    bits.push('Nothing marked needs moving — the work here is upkeep, not correction.')
  }
  if (structural.length > 0) {
    bits.push(`${structural.length === 1 ? 'One characteristic' : `${structural.length} characteristics`} of the property ${structural.length === 1 ? 'is' : 'are'} fixed and ${structural.length === 1 ? 'is' : 'are'} best planned around rather than fought.`)
  }
  if (others.length === 0 && entrances.length === 0) {
    bits.push('Mark the entrance and main rooms on the plan for this assessment to speak to specific placements.')
  }

  return { summary: bits.join(' '), improvable, structural }
}
