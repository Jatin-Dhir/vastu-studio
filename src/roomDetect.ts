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
}

/**
 * Keyword → kind. Ordered so more-specific phrases are matched before generic ones
 * (e.g. "store room" before a bare "room" would ever be added — it isn't, on purpose:
 * a lone "room"/"hall" is too generic to guess a kind from and would just be noise).
 * Matching is substring-on-lowercased-text, so short codes ("wc", "mbr") still hit.
 */
const KEYWORDS: [MarkerKind, string[]][] = [
  ['entrance', ['main entrance', 'main door', 'entrance', 'entry', 'foyer', 'porch']],
  ['staircase', ['staircase', 'stair case', 'stairs', 'stair']],
  ['dressing', ['dressing', 'wardrobe', 'walk-in closet', 'walk in closet', 'closet']],
  ['store', ['store room', 'storeroom', 'store', 'storage', 'utility', 'store/utility']],
  ['study', ['study room', 'study', 'home office', 'office']],
  ['dining', ['dining room', 'dining']],
  ['pooja', ['pooja', 'puja', 'prayer room', 'prayer', 'mandir']],
  ['toilet', ['toilet', 'bathroom', 'bath room', 'washroom', 'wash area', 'washing area', 'w.c.', 'wc', 'lavatory', 'attached bath']],
  ['kitchen', ['kitchen', 'kitchenette']],
  ['water', ['water tank', 'bore well', 'borewell', 'sump', 'overhead tank', 'water body']],
  ['bed', ['master bedroom', 'master bed room', 'bedroom', 'bed room', 'mbr', 'guest room']],
  ['living', ['living room', 'living', 'drawing room', 'drawing', 'lounge', 'sitting room', 'family room']],
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
  const hits: DetectedRoom[] = []
  for (const s of samples) {
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
  return kept
}

/** DXF's own text layer is exact — every label already has a real world position. */
export function textSamplesFromDxf(dxf: DxfImport): TextSample[] {
  return dxf.texts.map((t) => ({ text: t.str, p: { x: t.x, y: t.y }, confidence: 1 }))
}
