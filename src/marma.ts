import { MANDALA_INNER } from './vastu'
import type { Pt } from './types'

/* Marma sthan, after Brihat Samhita 53.63–64. Six lines, the vamshas, run across the 9×9
 * mandala between named padas: Roga–Anala and Pitra–Shikhi (the two diagonals), Vitatha–Shosha,
 * Mukhya–Bhrisha, Aditi–Sugriva and Jayanta–Bhringaraja. They cut one another in nine points,
 * the atimarma: vital points that no pillar, nail, peg or impurity should touch, each the size
 * of an eighth of a pada. Everything here lives in the pada grid's own frame (the plot's
 * bounding box turned to north), so the lines and points sit on the very grid the Pada Grid
 * compass draws. Grid units: u across from the west edge, v down from the north edge, 0–9. */

/** The pada grid's frame: the plot's bounding box in a frame turned by -north about c (the grid
 *  itself is drawn inside rotate(north, c)). */
export function gridFrame(c: Pt, north: number, pts: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const rad = (-north * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    const x = c.x + (p.x - c.x) * cos - (p.y - c.y) * sin
    const y = c.y + (p.x - c.x) * sin + (p.y - c.y) * cos
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

/** One vamsha, edge to edge across the grid ([u, v] at each end), through the centres of the
 *  two padas the text names it by ([row, col]) and of every pada between them. `main` marks the
 *  mandala's own diagonals. */
export interface Vamsha { a: [number, number]; b: [number, number]; ends: [[number, number], [number, number]]; main: boolean }

export const VAMSHAS: Vamsha[] = [
  { a: [0, 0], b: [9, 9], ends: [[0, 0], [8, 8]], main: true }, // Roga – Anala
  { a: [9, 0], b: [0, 9], ends: [[0, 8], [8, 0]], main: true }, // Shikhi – Pitra
  { a: [0, 2], b: [7, 9], ends: [[2, 0], [8, 6]], main: false }, // Shosha – Vitatha
  { a: [2, 0], b: [9, 7], ends: [[0, 2], [6, 8]], main: false }, // Mukhya – Bhrisha
  { a: [7, 0], b: [0, 7], ends: [[0, 6], [6, 0]], main: false }, // Aditi – Sugriva
  { a: [9, 2], b: [2, 9], ends: [[2, 8], [8, 2]], main: false }, // Jayanta – Bhringaraja
]

/** The nine atimarma, where a line of each family crosses a line of the other: the centre,
 *  the four corner padas of Brahma's nine, and the four padas just outside them on the
 *  cardinals. */
export const ATIMARMA: { at: [number, number]; name: string }[] = [
  { at: [4.5, 4.5], name: 'the centre' },
  { at: [3.5, 3.5], name: 'Brahma’s north-west pada' },
  { at: [5.5, 3.5], name: 'Brahma’s north-east pada' },
  { at: [5.5, 5.5], name: 'Brahma’s south-east pada' },
  { at: [3.5, 5.5], name: 'Brahma’s south-west pada' },
  { at: [4.5, 2.5], name: `${MANDALA_INNER.n}’s pada, north of the centre` },
  { at: [6.5, 4.5], name: `${MANDALA_INNER.e}’s pada, east of the centre` },
  { at: [4.5, 6.5], name: `${MANDALA_INNER.s}’s pada, south of the centre` },
  { at: [2.5, 4.5], name: `${MANDALA_INNER.w}’s pada, west of the centre` },
]

/** A marma point's radius for padas of cw × ch: a circle of an eighth of a pada's area. */
export const marmaRadius = (cw: number, ch: number) => Math.sqrt((cw * ch) / (8 * Math.PI))

/** The nine atimarma in plan coordinates (in ATIMARMA's order) and their radius, or null when
 *  there is no plot to fit the grid to. */
export function marmaPoints(c: Pt, north: number, pts: Pt[]): { points: Pt[]; r: number } | null {
  if (pts.length < 3) return null
  const f = gridFrame(c, north, pts)
  const cw = (f.maxX - f.minX) / 9, ch = (f.maxY - f.minY) / 9
  if (!(cw > 0 && ch > 0)) return null
  const rad = (north * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const toPlan = ([u, v]: [number, number]): Pt => {
    const dx = f.minX + u * cw - c.x, dy = f.minY + v * ch - c.y
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
  }
  return { points: ATIMARMA.map((m) => toPlan(m.at)), r: marmaRadius(cw, ch) }
}
