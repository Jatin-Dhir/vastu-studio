import type { Finding } from './evaluate'
import { PLACEMENT_RULES, ZONES16, markerKindMeta } from './vastu'
import { moveSentence, sharesLine, type Assessment as ItemAssessment } from './assess'

/**
 * The written assessment: what about this property can be improved, and what is a
 * fixed characteristic to plan around. Every sentence is assembled from the same
 * assessments the findings use — the charts' own per-zone lines, the real zone
 * coverage of each room, and the nearest better seat — nothing here invents doctrine.
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
  assessments: ItemAssessment[]
  findings: Finding[]
  strongest: { key: string; pct: number } | null
  weakest: { key: string; pct: number } | null
  /** plan pixels → "3.2 m" / "10 ft 6 in", or null when the plan is unscaled */
  fmtDistance: (px: number) => string | null
}): Assessment {
  const { assessments, findings, fmtDistance } = args
  const improvable: AssessmentItem[] = []
  const structural: AssessmentItem[] = []

  const entrances = assessments.filter((a) => a.gate)
  const others = assessments.filter((a) => !a.gate)

  let wellPlaced = 0
  let offSeat = 0

  for (const a of others) {
    if (a.verdict === 'ideal' || a.verdict === 'good') { wellPlaced += 1; continue }
    if (a.verdict === 'neutral') continue
    offSeat += 1
    const kindName = markerKindMeta(a.kind).name.toLowerCase()
    const where = a.isArea && a.shares.length > 1
      ? `spread ${sharesLine(a)}`
      : `in ${a.shares[0].key} (${a.shares[0].name})`
    const why = a.why ?? 'not a classical seat for it'
    const move = moveSentence(a, fmtDistance) ?? (seatList(a.kind) ? `The classical seats are ${seatList(a.kind)}.` : '')
    const dom = a.shares[0].key
    if (MOVABLE[a.kind]) {
      improvable.push({
        title: `Relocate ${a.label} out of ${dom}`,
        detail: `A ${kindName} ${where} — ${why}. ${move} This is furniture-level work, no construction.`,
      })
    } else if (PLUMBED[a.kind]) {
      improvable.push({
        title: `Mitigate ${a.label} in ${dom}`,
        detail: `A ${kindName} ${where} — ${why}. Relocation means plumbing and civil work, so classical practice first mitigates in place${a.kind === 'toilet' ? ' (keep it sealed, ventilated and closed)' : a.kind === 'kitchen' ? ' (shift the cooking fire within the room toward its favourable corner)' : ''}. If a remodel is ever on the table: ${move}`,
      })
    } else {
      improvable.push({
        title: `Review ${a.label} in ${dom}`,
        detail: `A ${kindName} ${where} — ${why}. ${move}`,
      })
    }
  }

  for (const a of entrances) {
    const g = a.gate!
    const z = a.shares[0]
    const sideGood = g.better.map((b) => b.code)
    if (g.verdict === 'caution' || g.verdict === 'avoid') {
      improvable.push({
        title: `Work on the ${g.code} entrance (${a.label})`,
        detail: `${g.note ?? ''}. The opening itself is structural, so classical practice treats the gate rather than the wall${sideGood.length ? ` — and if this side ever gains a second doorway, the favourable gates on it are ${sideGood.join(', ')}` : ''}.`,
      })
      structural.push({
        title: `${a.label} sits on pada ${g.code} · ${g.devta}`,
        detail: `Its position in the ${z.key} wall is a built fact of the property — remedies can soften it, but only construction can move it.`,
      })
    } else if (g.verdict === 'good') {
      structural.push({
        title: `${a.label} on ${g.code} · ${g.devta} is an asset`,
        detail: `${g.note ?? ''}. A favourable, permanent characteristic — nothing to change here.`,
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
      const a = assessments.find((x) => x.id === f.markerId)
      if (a) {
        improvable.push({
          title: `Free the Brahmasthan of ${a.label}`,
          detail: `${f.detail}. The centre itself is fixed; what occupies it is not — classical practice keeps the central ninth open and light.`,
        })
      }
    }
  }

  const bits: string[] = []
  if (others.length > 0) {
    bits.push(`Of the ${others.length} placements marked, ${wellPlaced} sit in their favourable zones and ${offSeat} ${offSeat === 1 ? 'calls' : 'call'} for attention.`)
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
