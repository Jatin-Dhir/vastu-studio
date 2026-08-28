/**
 * Vastu domain data.
 *
 * Angles are compass bearings: degrees clockwise from North.
 * Zone i of the 16-zone chakra spans [i*22.5 - 11.25, i*22.5 + 11.25] — North is centred on 0°.
 * The 32 entrance padas are 11.25° each, starting at the NW corner (315°), running clockwise;
 * each cardinal side owns 8 padas (N1…N8, E1…E8, S1…S8, W1…W8) and due N/E/S/W falls on the
 * 4|5 boundary of its side, matching the classical Vastu Purusha Mandala perimeter.
 */

export interface ZoneDef { key: string; name: string; theme: string; color: string }

export const ZONES16: ZoneDef[] = [
  { key: 'N',   name: 'North',            theme: 'Career · Money · Opportunity', color: '#4B93D1' },
  { key: 'NNE', name: 'North-North-East', theme: 'Health · Immunity',            color: '#55A8CF' },
  { key: 'NE',  name: 'North-East',       theme: 'Mind · Clarity · Wisdom',      color: '#6FC7CE' },
  { key: 'ENE', name: 'East-North-East',  theme: 'Fun · Refreshment',            color: '#74C4A2' },
  { key: 'E',   name: 'East',             theme: 'Social · Associations',        color: '#63B56F' },
  { key: 'ESE', name: 'East-South-East',  theme: 'Churning · Analysis',          color: '#A3BF62' },
  { key: 'SE',  name: 'South-East',       theme: 'Fire · Cash · Energy',         color: '#E0684F' },
  { key: 'SSE', name: 'South-South-East', theme: 'Power · Confidence',           color: '#E58255' },
  { key: 'S',   name: 'South',            theme: 'Fame · Recognition',           color: '#D95F45' },
  { key: 'SSW', name: 'South-South-West', theme: 'Expenditure · Disposal',       color: '#C88A52' },
  { key: 'SW',  name: 'South-West',       theme: 'Relationships · Stability',    color: '#B3793F' },
  { key: 'WSW', name: 'West-South-West',  theme: 'Education · Savings',          color: '#A58D68' },
  { key: 'W',   name: 'West',             theme: 'Gains · Profits',              color: '#7C8EA6' },
  { key: 'WNW', name: 'West-North-West',  theme: 'Detox · De-stress',            color: '#9092BC' },
  { key: 'NW',  name: 'North-West',       theme: 'Support · Banking',            color: '#A9A6CB' },
  { key: 'NNW', name: 'North-North-West', theme: 'Attraction · Bedroom',         color: '#7B9BC7' },
]

/** 32 entrance padas, 11.25° each, clockwise from 315° (NW corner). */
export const GATE_START_DEG = 315

export const GATES32: { code: string; devta: string }[] = [
  { code: 'N1', devta: 'Roga' },        { code: 'N2', devta: 'Naga' },
  { code: 'N3', devta: 'Mukhya' },      { code: 'N4', devta: 'Bhallata' },
  { code: 'N5', devta: 'Soma' },        { code: 'N6', devta: 'Bhujaga' },
  { code: 'N7', devta: 'Aditi' },       { code: 'N8', devta: 'Diti' },
  { code: 'E1', devta: 'Shikhi' },      { code: 'E2', devta: 'Parjanya' },
  { code: 'E3', devta: 'Jayanta' },     { code: 'E4', devta: 'Indra' },
  { code: 'E5', devta: 'Surya' },       { code: 'E6', devta: 'Satya' },
  { code: 'E7', devta: 'Bhrisha' },     { code: 'E8', devta: 'Akasha' },
  { code: 'S1', devta: 'Anala' },       { code: 'S2', devta: 'Pusha' },
  { code: 'S3', devta: 'Vitatha' },     { code: 'S4', devta: 'Grihakshata' },
  { code: 'S5', devta: 'Yama' },        { code: 'S6', devta: 'Gandharva' },
  { code: 'S7', devta: 'Bhringaraja' }, { code: 'S8', devta: 'Mriga' },
  { code: 'W1', devta: 'Pitra' },       { code: 'W2', devta: 'Dauvarika' },
  { code: 'W3', devta: 'Sugriva' },     { code: 'W4', devta: 'Pushpadanta' },
  { code: 'W5', devta: 'Varuna' },      { code: 'W6', devta: 'Asura' },
  { code: 'W7', devta: 'Shosha' },      { code: 'W8', devta: 'Papayakshma' },
]

/** 8 directions, clockwise from North (45° apart). */
export const DIRS8 = [
  { key: 'N',  sanskrit: 'Uttara',    deity: 'Kubera' },
  { key: 'NE', sanskrit: 'Ishanya',   deity: 'Ishana' },
  { key: 'E',  sanskrit: 'Purva',     deity: 'Indra' },
  { key: 'SE', sanskrit: 'Agneya',    deity: 'Agni' },
  { key: 'S',  sanskrit: 'Dakshina',  deity: 'Yama' },
  { key: 'SW', sanskrit: 'Nairritya', deity: 'Pitru' },
  { key: 'W',  sanskrit: 'Paschima',  deity: 'Varuna' },
  { key: 'NW', sanskrit: 'Vayavya',   deity: 'Vayu' },
]

/**
 * 9×9 Vastu Purusha Mandala — the 32 perimeter padas walked clockwise
 * starting at the NW corner cell (row 0, col 0):
 * top row W→E (9), right col N→S (8), bottom row E→W (8), left col S→N (7).
 */
export const MANDALA_PERIMETER = [
  'Roga', 'Naga', 'Mukhya', 'Bhallata', 'Soma', 'Bhujaga', 'Aditi', 'Diti', 'Shikhi',
  'Parjanya', 'Jayanta', 'Indra', 'Surya', 'Satya', 'Bhrisha', 'Akasha', 'Agni',
  'Pusha', 'Vitatha', 'Grihakshata', 'Yama', 'Gandharva', 'Bhringaraja', 'Mriga', 'Pitra',
  'Dauvarika', 'Sugriva', 'Pushpadanta', 'Varuna', 'Asura', 'Shosha', 'Papayakshma',
]

export const MANDALA_INNER = {
  center: 'Brahma',
  n: 'Bhudhara', e: 'Aryama', s: 'Vivasvan', w: 'Mitra',
  ne: 'Apah · Apavatsa', se: 'Savita · Savitra', sw: 'Indra · Jaya', nw: 'Rudra · Rajayakshma',
}

/** Map a 9×9 perimeter cell (row, col) to its devta name, or null for inner cells. */
export function mandalaCellName(row: number, col: number): string | null {
  if (row === 0) return MANDALA_PERIMETER[col]
  if (col === 8) return MANDALA_PERIMETER[8 + row]
  if (row === 8) return MANDALA_PERIMETER[16 + (8 - col)]
  if (col === 0) return MANDALA_PERIMETER[24 + (8 - row)]
  return null
}

/** Marker palette — what practitioners pin on a plan. */
export const MARKER_KINDS: { kind: string; name: string; color: string; glyph: string }[] = [
  { kind: 'entrance', name: 'Entrance', color: '#F26B57', glyph: 'E' },
  { kind: 'kitchen', name: 'Kitchen', color: '#E58255', glyph: 'K' },
  { kind: 'toilet', name: 'Toilet', color: '#7C8EA6', glyph: 'T' },
  { kind: 'bed', name: 'Bed', color: '#A9A6CB', glyph: 'B' },
  { kind: 'pooja', name: 'Pooja', color: '#D9B45B', glyph: 'P' },
  { kind: 'water', name: 'Water', color: '#6FC7CE', glyph: 'W' },
  { kind: 'living', name: 'Living', color: '#E0A23D', glyph: 'L' },
  { kind: 'dining', name: 'Dining', color: '#C97B4A', glyph: 'D' },
  { kind: 'study', name: 'Study', color: '#5B8DEF', glyph: 'S' },
  { kind: 'dressing', name: 'Dressing', color: '#D98BA0', glyph: 'C' },
  { kind: 'store', name: 'Store', color: '#8B8577', glyph: 'U' },
  { kind: 'staircase', name: 'Staircase', color: '#6B7280', glyph: 'Z' },
  { kind: 'custom', name: 'Custom', color: '#63B56F', glyph: '•' },
]

export const markerKindMeta = (kind: string) =>
  MARKER_KINDS.find((m) => m.kind === kind) ?? MARKER_KINDS[MARKER_KINDS.length - 1]

/** Which of the 16 zones a bearing (deg from centre, north-relative already removed) falls in. */
export function zoneIndexOf(bearingFromNorth: number): number {
  return Math.round((((bearingFromNorth % 360) + 360) % 360) / 22.5) % 16
}

/** Which of the 32 entrance padas a bearing falls in (N1 starts at 315°). */
export function padaIndexOf(bearingFromNorth: number): number {
  const rel = (((bearingFromNorth - GATE_START_DEG) % 360) + 360) % 360
  return Math.min(31, Math.floor(rel / 11.25))
}

/* ------------------------------------------------------------------ */
/* Interpretive layer — classical Vastu / MahaVastu-published rules.   */
/* Traditions differ; the UI always says which convention is applied.  */
/* ------------------------------------------------------------------ */

export type Verdict = 'ideal' | 'good' | 'neutral' | 'caution' | 'avoid'

export interface PlacementRule {
  ideal: string[]
  good: string[]
  caution: string[]
  avoid: string[]
  why: Partial<Record<Verdict, string>>
}

/** Zone keys are the 16-zone keys (N, NNE, …). Anything unlisted is neutral. */
export const PLACEMENT_RULES: Record<string, PlacementRule> = {
  kitchen: {
    ideal: ['SE'], good: ['SSE', 'S', 'NW'], caution: ['W', 'E', 'SW'], avoid: ['NE', 'NNE', 'N', 'ENE'],
    why: {
      ideal: 'Agni’s own corner — fire belongs here',
      good: 'workable fire placement',
      caution: 'not a natural fire zone — watch for imbalance',
      avoid: 'fire in the water/mind corner is a serious kitchen dosha',
    },
  },
  toilet: {
    ideal: ['NW', 'SSW'], good: ['WSW', 'W', 'WNW'], caution: ['S', 'SE', 'E'], avoid: ['NE', 'NNE', 'N', 'SW', 'ENE'],
    why: {
      ideal: 'disposal sits naturally in the outgoing zones',
      good: 'acceptable disposal placement',
      caution: 'keep it well sealed and ventilated here',
      avoid: 'a toilet here drains the zone it occupies — classical texts treat this severely',
    },
  },
  bed: {
    ideal: ['SW'], good: ['S', 'W', 'WSW', 'SSW'], caution: ['SE', 'NW', 'E'], avoid: ['NE', 'NNE'],
    why: {
      ideal: 'the stability corner — the classical master-bedroom seat',
      good: 'restful, grounded placement',
      caution: 'associated with restlessness or friction for couples',
      avoid: 'sleeping in the mind corner brings restlessness and over-thinking',
    },
  },
  pooja: {
    ideal: ['NE'], good: ['NNE', 'E', 'N', 'ENE'], caution: ['W', 'NW'], avoid: ['S', 'SSW', 'SW', 'SE'],
    why: {
      ideal: 'Ishanya — the traditional seat of the divine',
      good: 'sattvic directions, well suited to prayer',
      caution: 'usable, though not a classical prayer direction',
      avoid: 'classical texts advise against prayer rooms in the southern belt',
    },
  },
  water: {
    ideal: ['NE', 'N', 'NNE'], good: ['E', 'ENE'], caution: ['NW', 'W'], avoid: ['SE', 'SSE', 'S', 'SW', 'SSW'],
    why: {
      ideal: 'water strengthens the water corner — the classic borewell seat',
      good: 'supportive water placement',
      caution: 'water here can unsettle the zone — keep it modest',
      avoid: 'water clashing with fire/earth zones is a recognised dosha',
    },
  },
  // Added 2026-08-28 for auto-detection coverage, same classical/MahaVastu convention as
  // the five rules above but not yet cross-checked against the practitioner's own reference
  // charts — treat as a reasonable default, ready to be refined against those charts.
  living: {
    ideal: ['NW'], good: ['N', 'E', 'NE'], caution: ['S', 'SW'], avoid: [],
    why: {
      ideal: 'the guest-facing corner — welcomes and receives well',
      good: 'open, social directions suited to a living or drawing room',
      caution: 'workable, though it pulls the household toward the heavier zones',
    },
  },
  dining: {
    ideal: ['W'], good: ['S', 'E', 'NW'], caution: ['NE'], avoid: [],
    why: {
      ideal: 'West is the classical seat for nourishment and family dining',
      good: 'a settled, supportive dining placement',
      caution: 'too close to the sattvic North-East for a room meant for eating',
    },
  },
  study: {
    ideal: ['E', 'NE'], good: ['N', 'W'], caution: ['S'], avoid: ['SW'],
    why: {
      ideal: 'the mind corner — sharpens focus and clarity for study',
      good: 'a steady, workable seat for concentration',
      caution: 'the fame corner can pull focus outward rather than inward',
      avoid: 'the stability corner is for rest, not concentration — study drains it',
    },
  },
  dressing: {
    ideal: ['SW'], good: ['S', 'W'], caution: ['SE'], avoid: ['NE'],
    why: {
      ideal: 'a natural extension of the master bedroom’s own stability corner',
      good: 'a grounded, storage-appropriate placement',
      caution: 'the fire corner suits it poorly — keep it modest here',
      avoid: 'clutter and mirrors in the mind corner unsettle it',
    },
  },
  store: {
    ideal: ['SW'], good: ['S', 'W', 'NW'], caution: ['SE'], avoid: ['NE', 'N'],
    why: {
      ideal: 'the heaviest corner is exactly where weight and storage belong',
      good: 'a sound, out-of-the-way storage seat',
      caution: 'fire and storage don’t mix well here',
      avoid: 'clutter in the open, sattvic zones blocks their flow',
    },
  },
  staircase: {
    ideal: ['S', 'W', 'SW'], good: ['SSW', 'WSW'], caution: ['SE', 'NW'], avoid: ['NE', 'N'],
    why: {
      ideal: 'a descending structure sits naturally in the heavier southern and western zones',
      good: 'an acceptable seat for vertical movement',
      caution: 'workable, but not the classical seat for a staircase',
      // the Brahmasthan-occupancy check (evaluate.ts) already flags a centred staircase separately
      avoid: 'a staircase in the open, sattvic zones blocks their flow',
    },
  },
}

/** The widely-published quality of the 32 entrance gates (classical texts; MahaVastu-aligned). */
export const GATE_QUALITY: Record<string, { v: 'good' | 'neutral' | 'caution'; note: string }> = {
  E3: { v: 'good', note: 'Jayanta — victory and growth' },
  E4: { v: 'good', note: 'Indra — authority and prosperity' },
  N3: { v: 'good', note: 'Mukhya — prime gains' },
  N4: { v: 'good', note: 'Bhallata — abundance' },
  N5: { v: 'good', note: 'Soma — peace and wealth' },
  S3: { v: 'good', note: 'Vitatha — material comfort' },
  S4: { v: 'good', note: 'Grihakshata — household prosperity' },
  W3: { v: 'good', note: 'Sugriva — gains and recovery' },
  W4: { v: 'good', note: 'Pushpadanta — prosperity and progeny' },
  W5: { v: 'good', note: 'Varuna — steady flow of wealth' },
  N1: { v: 'caution', note: 'Roga — associated with illness' },
  E1: { v: 'caution', note: 'Shikhi — fire and instability' },
  S1: { v: 'caution', note: 'Anala — fire risk' },
  S5: { v: 'caution', note: 'Yama — heaviness and fear' },
  S8: { v: 'caution', note: 'Mriga — anxieties' },
  W1: { v: 'caution', note: 'Pitra — burdens' },
  W8: { v: 'caution', note: 'Papayakshma — losses and ill-health' },
}

/** Shape findings: what a cut (compressed) or extended zone means, per classical reading. */
export const ZONE_SHAPE_NOTES: Record<string, { cut?: string; ext?: string; cutSev?: 'warn' | 'bad'; extSev?: 'good' | 'warn' | 'info' }> = {
  NE: { cut: 'a cut Ishanya is the most serious shape dosha — clarity, fortune and growth suffer', cutSev: 'bad', ext: 'an extended North-East is classically auspicious', extSev: 'good' },
  SW: { cut: 'a cut Nairritya undermines stability and relationships', cutSev: 'bad', ext: 'an extended South-West adds heaviness — keep it weighted and closed', extSev: 'warn' },
  SE: { cut: 'a cut Agneya weakens cash flow and energy', cutSev: 'warn', ext: 'an extended South-East overheats — expenses and aggression rise', extSev: 'warn' },
  NW: { cut: 'a cut Vayavya weakens support and banking', cutSev: 'warn', ext: 'an extended North-West brings restlessness and flux', extSev: 'warn' },
}

export const ANALYSIS_DISCLAIMER =
  'Interpretations follow classical Vastu texts and MahaVastu-published conventions. Schools differ — apply your own tradition’s judgement.'

export const COMPASS_META: { id: string; label: string; sub: string }[] = [
  { id: 'zones16', label: '16 Zones', sub: 'MahaVastu chakra' },
  { id: 'gates32', label: '32 Gates', sub: 'Entrance devtas' },
  { id: 'chakra8', label: '8 Directions', sub: 'Dik chakra' },
  { id: 'grid9',   label: 'Pada Grid', sub: '9×9 mandala' },
  { id: 'dial',    label: 'Degree Dial', sub: '0–360°' },
  { id: 'custom',  label: 'Custom', sub: 'Your own PNG' },
]
