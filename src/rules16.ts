/**
 * Per-zone placement charts — the practitioner's own MahaVastu coursebook readings.
 *
 * The tables here are EMPTY on purpose: the charts live on the server and arrive through
 * `setCharts()` for a device holding a valid seat (src/auth/session.ts). A copy of the app
 * without an account has no analysis to give. For offline development, a gitignored
 * rules/charts.json can seed them (see session.ts loadDevCharts).
 *
 * v: how the chart reads that seat.  t: the effect, condensed to a sentence.
 * A zone missing from a kind's table means the source chart didn't cover it —
 * consumers fall back to the generic PlacementRule wording.
 *
 * PLACEMENT_RULES in vastu.ts is DERIVED from these tables (ideal/good/caution/
 * avoid lists) and rebuilt whenever they change, so the whole app — findings,
 * zone card, report — follows the charts automatically.
 */

export type ZoneKey =
  | 'N' | 'NNE' | 'NE' | 'ENE' | 'E' | 'ESE' | 'SE' | 'SSE'
  | 'S' | 'SSW' | 'SW' | 'WSW' | 'W' | 'WNW' | 'NW' | 'NNW'

export type RuleVerdict = 'ideal' | 'good' | 'neutral' | 'caution' | 'avoid'

export interface ZoneEffect { v: RuleVerdict; t: string }

export type Table = Partial<Record<ZoneKey, ZoneEffect>>

/** kind → zone → the chart's reading. Filled at runtime. */
export const ZONE_RULES: Record<string, Table> = {}

/** The chart's own line for this item in this zone — or null when uncovered. */
export function zoneEffect(kind: string, zoneKey: string): string | null {
  return ZONE_RULES[kind]?.[zoneKey as ZoneKey]?.t ?? null
}

export function zoneVerdict(kind: string, zoneKey: string): RuleVerdict | null {
  return ZONE_RULES[kind]?.[zoneKey as ZoneKey]?.v ?? null
}

export interface GateQuality { v: 'good' | 'neutral' | 'caution' | 'avoid'; note: string }
/** The 32 entrance gates, per the practitioner's entrance wheel. Filled at runtime. */
export const GATE_QUALITY: Record<string, GateQuality> = {}

/* ------------------------------------------------------------------ */
/* Runtime registry                                                     */
/* ------------------------------------------------------------------ */
export interface Charts { zone_rules?: Record<string, Table>; gate_quality?: Record<string, GateQuality> }
const listeners: (() => void)[] = []
/** bumps on every setCharts — memoised analysis keys on it so a late-arriving chart re-reads */
let version = 0
export const chartsVersion = () => version
/** Runs after setCharts — vastu.ts rebuilds its derived PLACEMENT_RULES here. */
export function onChartsChanged(fn: () => void): () => void {
  listeners.push(fn)
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1) }
}
/** Replace the tables in place: consumers hold references to these very objects. */
export function setCharts(c: Charts) {
  version += 1
  if (c.zone_rules) {
    for (const k of Object.keys(ZONE_RULES)) delete ZONE_RULES[k]
    Object.assign(ZONE_RULES, c.zone_rules)
  }
  if (c.gate_quality) {
    for (const k of Object.keys(GATE_QUALITY)) delete GATE_QUALITY[k]
    Object.assign(GATE_QUALITY, c.gate_quality)
  }
  for (const fn of listeners) fn()
}
