import type { MarkerKind, Pt } from './types'
import type { DxfImport } from './importers/dxf'

/**
 * Room auto-detection — the shared core both text sources (DXF's real text layer,
 * and OCR over a raster/PDF background) feed into. Neither source commits anything
 * by itself: both produce candidates, a practitioner reviews and confirms before
 * markers are actually added (src/ui/AutoDetectDialog.tsx), because keyword matching
 * over an architect's label ("MBR", "W.C.", a smudged scan) will never be perfect.
 */

/** One piece of text found on the plan, in WORLD px (the same frame as pts/markers). */
export interface TextSample {
  text: string
  p: Pt
  /** 0..1 — DXF text is exact (1); OCR carries its own per-word confidence */
  confidence: number
}

export interface DetectedRoom {
  id: string
  /** cleaned-up display label — the matched keyword's proper name, not the raw scan text */
  label: string
  kind: MarkerKind
  p: Pt
  sourceText: string
  confidence: number
  /** the room's printed size, read from the dimension line under its label
   *  (architects write "20'-8\"x14'-7\"" beneath every room name) — in metres */
  dimM?: { w: number; h: number }
}

/** Parse an architect's dimension string: 20'-8"x14'-7", 12'-6" x 10'-0", 12-6"X10-0",
 *  or metric 3.5x4.2m. Returns metres, or null if the text isn't a dimension. */
export function parseDimensions(raw: string): { w: number; h: number } | null {
  const t = raw.toLowerCase().replace(/\s+/g, ' ').trim()
  // feet-inches on both sides of an x. The full form is 20'-8"x14'-7" — apostrophe
  // AND dash — but OCR freely drops either mark, so accept: 20'-8", 20'8", 20-8", 20'
  const side = `(\\d{1,3})\\s*(?:['’]\\s*)?(?:-?\\s*(\\d{1,2}))?\\s*(?:"|”|'')?`
  const ftin = new RegExp(`${side}\\s*[x×]\\s*${side}`)
  const m = ftin.exec(t)
  if (m && (/['’"”-]/.test(m[0]) || t.includes("'"))) { // some mark must exist, else it's not feet-inches
    const w = parseInt(m[1]) * 0.3048 + (m[2] ? parseInt(m[2]) * 0.0254 : 0)
    const h = parseInt(m[3]) * 0.3048 + (m[4] ? parseInt(m[4]) * 0.0254 : 0)
    if (w > 0.5 && h > 0.5 && w < 60 && h < 60) return { w, h }
  }
  const metric = /(\d{1,2}(?:\.\d{1,2})?)\s*[x×]\s*(\d{1,2}(?:\.\d{1,2})?)\s*m\b/
  const m2 = metric.exec(t)
  if (m2) {
    const w = parseFloat(m2[1]), h = parseFloat(m2[2])
    if (w > 0.5 && h > 0.5 && w < 60 && h < 60) return { w, h }
  }
  return null
}

/**
 * Keyword → kind. Ordered so more-specific phrases are matched before generic ones
 * (e.g. "store room" before a bare "room" would ever be added — it isn't, on purpose:
 * a lone "room"/"hall" is too generic to guess a kind from and would just be noise).
 * Matching is substring-on-lowercased-text, so short codes ("wc", "mbr") still hit.
 */
const KEYWORDS: [MarkerKind, string[]][] = [
  // 'porch' deliberately NOT here: a front porch is open space, not the main door —
  // an entrance marker at a porch centre would poison the gate analysis
  ['entrance', ['main entrance', 'main door', 'entrance', 'entry', 'foyer']],
  ['staircase', ['staircase', 'stair case', 'stairs', 'stair']],
  ['septic', ['septic tank', 'septic']],
  // 'wash(ing) area' on Indian plans = the clothes-washing/utility corner (churning),
  // not a bathroom — it lived in toilet's list once, which misread real plans
  ['washing', ['washing machine', 'wash machine', 'laundry', 'washing area', 'wash area', 'utility area']],
  ['guest', ['guest room', 'guest bedroom', 'guest bed room']],
  ['servant', ['servant room', 'servant', 'maid room', 'maid']],
  ['guard', ['security guard', 'guard room', 'security room', 'security cabin']],
  ['lounge', ['family lounge', 'family room', 'lounge']],
  ['dressing', ['dressing', 'wardrobe', 'walk-in closet', 'walk in closet', 'closet']],
  ['store', ['store room', 'storeroom', 'store', 'storage', 'utility', 'store/utility']],
  ['study', ['study room', 'study', 'home office', 'office']],
  ['dining', ['dining room', 'dining']],
  ['pooja', ['pooja', 'puja', 'prayer room', 'prayer', 'mandir', 'temple']],
  ['toilet', ['toilet', 'bathroom', 'bath room', 'washroom', 'w.c.', 'wc', 'lavatory', 'attached bath', 'bath']],
  ['kitchen', ['kitchen', 'kitchenette']],
  ['water', ['water tank', 'bore well', 'borewell', 'sump', 'overhead tank', 'water body', 'swimming pool']],
  ['bar', ['bar counter', 'mini bar', 'bar']],
  ['tv', ['television', 'tv unit', 'tv lounge', 't.v.']],
  ['computer', ['computer', 'workstation', 'desktop']],
  ['dustbin', ['dustbin', 'dust bin', 'garbage', 'trash']],
  ['safe', ['locker', 'safe room', 'tijori']],
  ['music', ['music system', 'musical instruments', 'music room', 'piano']],
  ['inverter', ['inverter', 'generator', 'genset']],
  ['crockery', ['crockery']],
  ['heater', ['room heater', 'heater']],
  ['ac', ['air conditioner', 'air conditioning', 'split ac', 'window ac']],
  ['medicine', ['medicines', 'medicine', 'first aid']],
  ['open', ['open area', 'open space', 'courtyard', 'open to sky', 'verandah', 'veranda', 'balcony', 'aangan', 'indoor lawn', 'lawn', 'porch', 'terrace garden']],
  ['bed', ['master bedroom', 'master bed room', 'bedroom', 'bed room', 'mbr']],
  ['living', ['living room', 'living', 'drawing room', 'drawing', 'sitting room']],
]

/** Try to classify one piece of scanned/DXF text. Null if nothing matched (most text
 *  on a real drawing — dimensions, titles, notes — isn't a room label at all). */
export function matchKeyword(raw: string): { kind: MarkerKind; label: string; keyword: string } | null {
  const text = raw.trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ')
  if (text.length < 2) return null
  for (const [kind, words] of KEYWORDS) {
    for (const w of words) {
      if (text.includes(w)) {
        const label = raw.trim().replace(/\s+/g, ' ')
        return { kind, label: label.length <= 24 ? label : label.slice(0, 23) + '…', keyword: w }
      }
    }
  }
  return null
}

let seq = 0
/** Match every sample, keep the best hit per kind cluster (two labels for the same
 *  room shouldn't become two markers a few px apart), return candidates for review. */
export function detectFromTextSamples(samples: TextSample[]): DetectedRoom[] {
  // OCR splits stacked labels into separate lines ("GUARD" above "ROOM") — also try
  // vertically-adjacent pairs joined, so phrase keywords can still match
  const planW = samples.reduce((m, s) => Math.max(m, s.p.x), 0)
  const dyMax = Math.max(16, planW * 0.016)
  const dxMax = Math.max(40, planW * 0.05)
  const merged: TextSample[] = []
  for (const a of samples) {
    for (const b of samples) {
      if (a === b) continue
      const dy = b.p.y - a.p.y
      if (dy > 2 && dy < dyMax && Math.abs(b.p.x - a.p.x) < dxMax) {
        merged.push({
          text: `${a.text} ${b.text}`,
          p: { x: (a.p.x + b.p.x) / 2, y: (a.p.y + b.p.y) / 2 },
          confidence: Math.min(a.confidence, b.confidence),
        })
      }
    }
  }
  const hits: DetectedRoom[] = []
  for (const s of [...samples, ...merged]) {
    const m = matchKeyword(s.text)
    if (!m) continue
    hits.push({ id: `det${seq++}`, label: m.label, kind: m.kind, p: s.p, sourceText: s.text, confidence: s.confidence })
  }
  // de-dupe near-identical detections (OCR often reads one label as 2-3 word fragments
  // that land within a few px of each other) — keep the highest-confidence one per cluster
  const kept: DetectedRoom[] = []
  const CLUSTER_PX = 60
  for (const h of hits.sort((a, b) => b.confidence - a.confidence)) {
    const dup = kept.find((k) => k.kind === h.kind && Math.hypot(k.p.x - h.p.x, k.p.y - h.p.y) < CLUSTER_PX)
    if (!dup) kept.push(h)
  }
  // architects print each room's size right under its name — claim the nearest
  // dimension line for each label (one line feeds one label only, nearest wins)
  const dims = samples
    .map((s) => ({ p: s.p, d: parseDimensions(s.text) }))
    .filter((x): x is { p: Pt; d: { w: number; h: number } } => x.d !== null)
  const DIM_RADIUS = 160
  for (const room of kept) {
    let bestI = -1, bestDist = DIM_RADIUS
    for (let i = 0; i < dims.length; i++) {
      const dd = Math.hypot(dims[i].p.x - room.p.x, dims[i].p.y - room.p.y)
      if (dd < bestDist) { bestDist = dd; bestI = i }
    }
    if (bestI >= 0) {
      room.dimM = dims[bestI].d
      dims.splice(bestI, 1)
    }
  }
  return kept
}

/** DXF's own text layer is exact — every label already has a real world position. */
export function textSamplesFromDxf(dxf: DxfImport): TextSample[] {
  return dxf.texts.map((t) => ({ text: t.str, p: { x: t.x, y: t.y }, confidence: 1 }))
}

export interface RecoverySpot {
  p: Pt
  /** 'at' — re-read the sample's own strip (mangled label like "1A ROOM");
   *  'above' — an orphan dimension line, its label sits just above it */
  where: 'at' | 'above'
}

/** Spots worth a zoomed second look: room-ish text that matched nothing (OCR mangled
 *  the distinctive word — "1A ROOM", "FRONT PO!"), and dimension lines no detected
 *  room claimed (the label above them was lost entirely, like DINING/LOBBY's). */
export function recoverySpots(samples: TextSample[], rooms: DetectedRoom[], claimRadius = 160): RecoverySpot[] {
  const spots: RecoverySpot[] = []
  const nearRoom = (p: Pt, r: number) => rooms.some((k) => Math.hypot(k.p.x - p.x, k.p.y - p.y) < r)
  const ROOMISH = /\b(room|area|front|hall|rooj|roon)\b/
  for (const s of samples) {
    const t = s.text.toLowerCase()
    if (parseDimensions(s.text)) {
      if (!nearRoom(s.p, claimRadius)) spots.push({ p: s.p, where: 'above' })
    } else if (ROOMISH.test(t) && !matchKeyword(s.text) && !nearRoom(s.p, 80)) {
      spots.push({ p: s.p, where: 'at' })
    }
  }
  // two fragments of the same lost label shouldn't trigger two crops
  const kept: RecoverySpot[] = []
  for (const sp of spots) {
    if (!kept.some((k) => Math.hypot(k.p.x - sp.p.x, k.p.y - sp.p.y) < 80)) kept.push(sp)
  }
  return kept.slice(0, 12) // a page of junk text must not queue endless re-reads
}

/** Fold recovered label reads back into the room list (same clustering rule). */
export function addRecoveredRooms(rooms: DetectedRoom[], reads: { p: Pt; text: string }[]): number {
  let added = 0
  const clean = (s: string) => s.trim().replace(/^[^a-z0-9(]+/i, '').replace(/[^a-z0-9)"'’”/.\- ]+$/i, '')
  for (const r of reads) {
    const lines = r.text.split(/\n+/)
    // the crop may catch the dimension line with the label — match line by line
    let matched = false
    for (const line of lines) {
      const m = matchKeyword(line)
      if (!m) continue
      matched = true
      if (rooms.some((k) => k.kind === m.kind && Math.hypot(k.p.x - r.p.x, k.p.y - r.p.y) < 60)) break
      rooms.push({ id: `det${seq++}`, label: clean(m.label) || m.label, kind: m.kind, p: r.p, sourceText: line.trim(), confidence: 0.75 })
      added++
      break
    }
    if (matched) continue
    // the name resisted even the zoomed read, but a room with a printed size at a
    // known spot is still real — surface it UNNAMED for the practitioner to re-kind
    // in the review dialog (never guess: a wrong pooja/toilet poisons the analysis)
    const dim = lines.map(parseDimensions).find((d) => d !== null) ?? parseDimensions(r.text)
    if (!dim) continue
    if (rooms.some((k) => Math.hypot(k.p.x - r.p.x, k.p.y - r.p.y) < 60)) continue
    const nameLine = lines.map(clean).find((l) => /[a-z]{2,}/i.test(l) && !parseDimensions(l))
    rooms.push({
      id: `det${seq++}`, label: nameLine || 'Unnamed room', kind: 'custom', p: r.p,
      sourceText: r.text.trim().slice(0, 40), confidence: 0.5, dimM: dim,
    })
    added++
  }
  return added
}
