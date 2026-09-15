import { angleOf, dist, polar, polygonArea, wedgeClip } from './geometry'
import { GATES32, GATE_QUALITY, PLACEMENT_RULES, ZONES16, markerKindMeta, type Verdict } from './vastu'
import { zoneEffect, zoneVerdict } from './rules16'
import { placementOf } from './analysis'
import type { Marker, MarkerKind, Pt, RoomShape } from './types'

/**
 * The placement engine: what each marked room or object means WHERE IT ACTUALLY SITS.
 * A drawn area rarely lives in one zone — it is clipped against all sixteen wedges, so a
 * toilet that is 62% north-east and 38% east-north-east is read as exactly that, and
 * the verdict weighs every share. When the seat is wrong, the engine names the nearest
 * zone where the charts call this kind ideal or good, with the direction and distance
 * to get there.
 */

export interface ZoneShare {
  zoneIdx: number
  key: string
  name: string
  color: string
  /** share of the item's area (a point is 100% in one zone) */
  pct: number
  verdict: Verdict
  /** the chart's own line for this kind in this zone, if it has one */
  text: string | null
}

export interface Move {
  targetIdx: number
  targetKey: string
  targetName: string
  verdict: 'ideal' | 'good'
  /** zones between here and there */
  steps: number
  direction: 'clockwise' | 'anticlockwise'
  /** how far the item's centre would travel, in plan pixels */
  distancePx: number
  /** compass bearing of the target zone's middle, degrees from north */
  /** compass heading the item travels along, relative to the plan's north */
  bearing: number
  text: string | null
}

export interface GateRead {
  code: string
  devta: string
  verdict: Verdict
  note: string | null
  /** favourable gates on the same wall, nearest first */
  better: { code: string; devta: string; note: string; steps: number }[]
}

export interface Assessment {
  id: string
  kind: MarkerKind
  label: string
  isArea: boolean
  anchor: Pt
  /** coverage per zone, largest first; shares under 1% are dropped */
  shares: ZoneShare[]
  /** the coverage-weighted call */
  verdict: Verdict
  /** true when the shares disagree with each other */
  mixed: boolean
  /** one line: "62% in NE — avoid" */
  headline: string
  /** the dominant share's chart line */
  why: string | null
  /** where to shift it when it is off its seat */
  move: Move | null
  /** a spill into an avoid/caution zone worth keeping clear of, when the overall call is fine */
  keepOut: ZoneShare | null
  /** entrances read against the 32 gates instead of the zones */
  gate?: GateRead
}

const SCORE: Record<Verdict, number> = { ideal: 1, good: 0.5, neutral: 0, caution: -0.5, avoid: -1 }
const ORDER: Verdict[] = ['ideal', 'good', 'neutral', 'caution', 'avoid']
const worse = (a: Verdict, b: Verdict) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b)

/** The chart's verdict for this kind in this zone, falling back to the classical lists. */
export function kindVerdict(kind: string, zoneKey: string): Verdict {
  const fromChart = zoneVerdict(kind, zoneKey)
  if (fromChart) return fromChart
  const rule = PLACEMENT_RULES[kind]
  if (!rule) return 'neutral'
  if (rule.ideal.includes(zoneKey)) return 'ideal'
  if (rule.good.includes(zoneKey)) return 'good'
  if (rule.avoid.includes(zoneKey)) return 'avoid'
  if (rule.caution.includes(zoneKey)) return 'caution'
  return 'neutral'
}

export function kindText(kind: string, zoneKey: string, v: Verdict): string | null {
  return zoneEffect(kind, zoneKey) ?? PLACEMENT_RULES[kind]?.why[v] ?? null
}

/** The polygon a room shape covers, in plan pixels. */
export function roomPolygon(r: RoomShape): Pt[] {
  const [a, b] = r.pts
  if (!a || !b) return []
  if (r.shape === 'polygon') return r.pts.length >= 3 ? r.pts : []
  if (r.shape === 'ellipse') {
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
    const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2
    return Array.from({ length: 48 }, (_, i) => {
      const t = (i / 48) * Math.PI * 2
      return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) }
    })
  }
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]
}

/** How an area splits across the sixteen zones, largest share first. */
export function zoneCoverage(poly: Pt[], center: Pt, northDeg: number): { zoneIdx: number; pct: number }[] {
  const total = Math.abs(polygonArea(poly))
  if (!(total > 0)) return []
  const out: { zoneIdx: number; pct: number }[] = []
  for (let i = 0; i < 16; i++) {
    const a0 = northDeg - 11.25 + i * 22.5
    const part = Math.abs(polygonArea(wedgeClip(poly, center, a0, a0 + 22.5)))
    const pct = (part / total) * 100
    if (pct >= 1) out.push({ zoneIdx: i, pct })
  }
  // normalise away clipping crumbs so the shares read as a clean 100
  const sum = out.reduce((s, o) => s + o.pct, 0)
  if (sum > 0) for (const o of out) o.pct = (o.pct / sum) * 100
  return out.sort((a, b) => b.pct - a.pct)
}

export const fmtPct = (p: number) => (p >= 99.5 ? '100%' : `${Math.round(p)}%`)

function bestSeat(kind: string, fromIdx: number): { idx: number; verdict: 'ideal' | 'good'; steps: number; direction: 'clockwise' | 'anticlockwise' } | null {
  let best: { idx: number; verdict: 'ideal' | 'good'; steps: number; direction: 'clockwise' | 'anticlockwise'; cost: number } | null = null
  for (let k = 1; k <= 8; k++) {
    for (const dir of [1, -1] as const) {
      const idx = (fromIdx + dir * k + 16) % 16
      const v = kindVerdict(kind, ZONES16[idx].key)
      if (v !== 'ideal' && v !== 'good') continue
      // an ideal seat is worth walking a zone and a half further for
      const cost = k - (v === 'ideal' ? 1.5 : 0)
      if (!best || cost < best.cost) {
        best = { idx, verdict: v, steps: k, direction: dir === 1 ? 'clockwise' : 'anticlockwise', cost }
      }
    }
  }
  return best && { idx: best.idx, verdict: best.verdict, steps: best.steps, direction: best.direction }
}

/** Assess one item: a point marker, or an area (polygon) with its anchor. */
export function assessItem(args: {
  id: string; kind: MarkerKind; label: string
  anchor: Pt; poly?: Pt[]
  center: Pt; northDeg: number
}): Assessment {
  const { id, kind, label, anchor, poly, center, northDeg } = args
  const isArea = !!poly && poly.length >= 3

  if (kind === 'entrance') {
    const pl = placementOf(anchor, center, northDeg)
    const q = GATE_QUALITY[pl.pada.code]
    const v: Verdict = q?.v ?? 'neutral'
    const wall = pl.pada.code[0]
    const myIdx = GATES32.findIndex((g) => g.code === pl.pada.code)
    const better = GATES32
      .map((g, i) => ({ ...g, i }))
      .filter((g) => g.code[0] === wall && GATE_QUALITY[g.code]?.v === 'good' && g.code !== pl.pada.code)
      .map((g) => ({ code: g.code, devta: g.devta, note: GATE_QUALITY[g.code]!.note, steps: Math.abs(g.i - myIdx) }))
      .sort((a, b) => a.steps - b.steps)
    const share: ZoneShare = { zoneIdx: pl.zoneIdx, key: pl.zone.key, name: pl.zone.name, color: pl.zone.color, pct: 100, verdict: v, text: q?.note ?? null }
    const word = v === 'good' ? 'auspicious gate' : v === 'avoid' ? 'inauspicious gate' : v === 'caution' ? 'challenging gate' : 'neutral gate'
    return {
      id, kind, label, isArea: false, anchor, shares: [share], verdict: v, mixed: false,
      headline: `${pl.pada.code} · ${pl.pada.devta} — ${word}`,
      why: q?.note ?? null, move: null, keepOut: null,
      gate: { code: pl.pada.code, devta: pl.pada.devta, verdict: v, note: q?.note ?? null, better },
    }
  }

  const cover = isArea ? zoneCoverage(poly!, center, northDeg) : [{ zoneIdx: placementOf(anchor, center, northDeg).zoneIdx, pct: 100 }]
  const shares: ZoneShare[] = cover.map(({ zoneIdx, pct }) => {
    const z = ZONES16[zoneIdx]
    const v = kindVerdict(kind, z.key)
    return { zoneIdx, key: z.key, name: z.name, color: z.color, pct, verdict: v, text: kindText(kind, z.key, v) }
  })
  if (shares.length === 0) {
    return { id, kind, label, isArea, anchor, shares, verdict: 'neutral', mixed: false, headline: 'Outside the plot', why: null, move: null, keepOut: null }
  }
  const dominant = shares[0]
  // a substantial spill into a bad zone counts against the whole item — a toilet that is a
  // third in the north-east is a north-east toilet to the charts
  let verdict: Verdict = dominant.verdict
  for (const s of shares) if (s.pct >= 30) verdict = worse(verdict, s.verdict)
  if (shares.every((s) => s.pct < 30)) {
    const score = shares.reduce((acc, s) => acc + (s.pct / 100) * SCORE[s.verdict], 0)
    verdict = score >= 0.75 ? 'ideal' : score >= 0.25 ? 'good' : score > -0.25 ? 'neutral' : score > -0.75 ? 'caution' : 'avoid'
  }
  const mixed = shares.some((s) => s.verdict !== dominant.verdict)

  const headline = isArea && shares.length > 1
    ? `${fmtPct(dominant.pct)} in ${dominant.key}${shares[1] ? `, ${fmtPct(shares[1].pct)} in ${shares[1].key}` : ''} — ${verdictWord(verdict)}`
    : `in ${dominant.key} · ${dominant.name} — ${verdictWord(verdict)}`

  let move: Move | null = null
  if (verdict === 'caution' || verdict === 'avoid' || verdict === 'neutral') {
    const seat = bestSeat(kind, dominant.zoneIdx)
    if (seat) {
      const z = ZONES16[seat.idx]
      const r = dist(center, anchor)
      const bearing = ((northDeg + seat.idx * 22.5) % 360 + 360) % 360
      const target = polar(center, bearing, Math.max(r, 1))
      // the direction the item itself travels, as a compass word relative to the plan's north
      const heading = (((angleOf(anchor, target) - northDeg) % 360) + 360) % 360
      move = {
        targetIdx: seat.idx, targetKey: z.key, targetName: z.name, verdict: seat.verdict,
        steps: seat.steps, direction: seat.direction, distancePx: dist(anchor, target), bearing: heading,
        text: kindText(kind, z.key, seat.verdict),
      }
    }
  }
  const keepOut = (verdict === 'ideal' || verdict === 'good')
    ? shares.find((s) => (s.verdict === 'avoid' || s.verdict === 'caution') && s.pct >= 10) ?? null
    : null

  return { id, kind, label, isArea, anchor, shares, verdict, mixed, headline, why: dominant.text, move, keepOut }
}

/** Chart lines are written as continuations (lowercase); this starts one as a sentence. */
export const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function verdictWord(v: Verdict): string {
  return v === 'ideal' ? 'ideal' : v === 'good' ? 'good' : v === 'neutral' ? 'neutral' : v === 'caution' ? 'caution' : 'avoid'
}

/** Compass-word for a bearing, for "move it to the south-west" phrasing. */
export function bearingWord(deg: number): string {
  const names = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east',
    'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west']
  return names[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
}

/** The move as a sentence, with the distance in the plan's units when scaled. */
export function moveSentence(a: Assessment, fmtDistance: (px: number) => string | null): string | null {
  const m = a.move
  if (!m) return null
  const d = fmtDistance(m.distancePx)
  const steps = m.steps === 1 ? 'one zone' : `${m.steps} zones`
  const seat = m.verdict === 'ideal' ? 'The ideal seat there' : 'A good seat there'
  return `Move it ${d ? `about ${d} ` : ''}${bearingWord(m.bearing)}, into ${m.targetKey} (${m.targetName}) ${steps} ${m.direction}. ${seat}${m.text ? `: ${m.text}` : ''}.`
}

/** Every marked item on the plan, assessed. Areas use their real footprint. */
export function assessAll(args: {
  markers: Marker[]; roomShapes: RoomShape[]; center: Pt; northDeg: number
}): Assessment[] {
  const { markers, roomShapes, center, northDeg } = args
  const out: Assessment[] = []
  for (const m of markers) {
    if (m.kind === 'custom') continue
    out.push(assessItem({ id: m.id, kind: m.kind, label: m.label, anchor: m.p, center, northDeg }))
  }
  for (const r of roomShapes) {
    if (r.kind === 'custom') continue
    const poly = roomPolygon(r)
    if (poly.length < 3) continue
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y)
    const anchor = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
    out.push(assessItem({ id: r.id, kind: r.kind, label: r.label, anchor, poly, center, northDeg }))
  }
  return out
}

/** Shares as a compact string: "62% NE · 38% ENE". */
export function sharesLine(a: Assessment): string {
  return a.shares.map((s) => `${fmtPct(s.pct)} ${s.key}`).join(' · ')
}

export const kindName = (kind: MarkerKind) => markerKindMeta(kind).name
export { angleOf }
