import type { Pt } from './types'

/* Marma sthan, drawn as the owner's MahaVastu reference draws it: the 64-pada mandala, an 8×8
 * square about the plot's centre, turned to north, its side the outer circle's diameter
 * (marmaFrame), so the Size dial moves it with the wheel. Six lines cross it and four circles ring
 * the centre; the 32 marmasthans sit where the padas meet, and nothing heavy or impure should
 * stand on one. */

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

/** The marma sthan's square for an outer circle of radius R, in the same turned frame: the circle
 *  sits inside it touching all four sides, so the square's side is the circle's diameter (the
 *  owner's rule). Its centre is the plot's centre, and the Size dial moves both together. */
export function marmaFrame(c: Pt, R: number): { minX: number; minY: number; maxX: number; maxY: number } {
  const h = R
  return { minX: c.x - h, minY: c.y - h, maxX: c.x + h, maxY: c.y + h }
}

/** Where a marma point sits, in padas from the centre in the grid's own frame (x east, y south),
 *  and which of the reference's three kinds it is; 'centre' is the Brahmasthan's own point. */
export type MarmaKind = 'centre' | 'maha' | 'up' | 'marma'
export interface MarmaPoint { at: [number, number]; kind: MarmaKind }

const ring = (pts: [number, number][], kind: MarmaKind): MarmaPoint[] => pts.map((at) => ({ at, kind }))

/** The 32 marmasthans of the owner's reference (Location of 32 Marmasthans in Vastu Purush
 *  Mandala), all on pada corners, plus the centre: 16 maha-marma one pada out all round and two
 *  and three padas out on the diagonals, 8 up-marma two by three padas out, 8 marma one by two. */
export const MARMA_POINTS: MarmaPoint[] = [
  { at: [0, 0], kind: 'centre' },
  ...ring([[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]], 'maha'),
  ...ring([[2, -2], [2, 2], [-2, 2], [-2, -2], [3, -3], [3, 3], [-3, 3], [-3, -3]], 'maha'),
  ...ring([[2, -3], [3, -2], [3, 2], [2, 3], [-2, 3], [-3, 2], [-3, -2], [-2, -3]], 'up'),
  ...ring([[1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2]], 'marma'),
]

/** The six lines, edge to edge, in padas from the centre: the two diagonals, and a parallel to
 *  each one pada off it on either side, from the mid-point between a corner pada and its
 *  neighbour (Diti and Aditi) to the matching mid-point across the square (Dauwarik and Pitra). */
export const MARMA_LINES: { a: [number, number]; b: [number, number]; main: boolean }[] = [
  { a: [-4, -4], b: [4, 4], main: true },
  { a: [4, -4], b: [-4, 4], main: true },
  { a: [-3, -4], b: [4, 3], main: false },
  { a: [-4, -3], b: [3, 4], main: false },
  { a: [3, -4], b: [-4, 3], main: false },
  { a: [4, -3], b: [-3, 4], main: false },
]

/** The reference's four circles, in padas: the outer one touches the square's sides. */
export const MARMA_RINGS = [1, 2, 3, 4]

/** Padas across the marma sthan's square: the 64-pada mandala. */
export const MARMA_PADAS = 8

/** A marma point's radius for a pada of side p: a circle of an eighth of the pada's area. */
export const marmaRadius = (p: number) => Math.sqrt((p * p) / (8 * Math.PI))

/** The points in plan coordinates (in MARMA_POINTS' order) and their radius, for an outer circle
 *  of radius R, or null when there is no circle yet. */
export function marmaPoints(c: Pt, north: number, R: number): { points: Pt[]; r: number } | null {
  if (!(R > 0)) return null
  const p = (2 * R) / MARMA_PADAS
  const rad = (north * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const toPlan = ([x, y]: [number, number]): Pt => ({ x: c.x + (x * cos - y * sin) * p, y: c.y + (x * sin + y * cos) * p })
  return { points: MARMA_POINTS.map((m) => toPlan(m.at)), r: marmaRadius(p) }
}
