import type { Pt } from './types'

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

export function signedArea(pts: Pt[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export const polygonArea = (pts: Pt[]) => Math.abs(signedArea(pts))

export function perimeter(pts: Pt[], closed: boolean): number {
  let s = 0
  for (let i = 0; i < pts.length - 1; i++) s += dist(pts[i], pts[i + 1])
  if (closed && pts.length > 2) s += dist(pts[pts.length - 1], pts[0])
  return s
}

export function centroid(pts: Pt[]): Pt {
  const n = pts.length
  if (n === 0) return { x: 0, y: 0 }
  const avg = () => {
    let sx = 0, sy = 0
    for (const p of pts) { sx += p.x; sy += p.y }
    return { x: sx / n, y: sy / n }
  }
  if (n < 3) return avg()
  const A = signedArea(pts)
  if (Math.abs(A) < 1e-6) return avg()
  let cx = 0, cy = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    const cr = a.x * b.y - b.x * a.y
    cx += (a.x + b.x) * cr
    cy += (a.y + b.y) * cr
  }
  return { x: cx / (6 * A), y: cy / (6 * A) }
}

export function circumradius(c: Pt, pts: Pt[]): number {
  let r = 0
  for (const p of pts) r = Math.max(r, dist(c, p))
  return r
}

/** Compass bearing (deg, clockwise from North/up) to a screen-space unit vector (y grows downward). */
export function dirVec(deg: number): Pt {
  const r = (deg * Math.PI) / 180
  return { x: Math.sin(r), y: -Math.cos(r) }
}

export function polar(c: Pt, deg: number, r: number): Pt {
  const d = dirVec(deg)
  return { x: c.x + d.x * r, y: c.y + d.y * r }
}

/** Bearing of p as seen from c, in [0, 360). */
export function angleOf(c: Pt, p: Pt): number {
  return (Math.atan2(p.x - c.x, -(p.y - c.y)) * 180 / Math.PI + 360) % 360
}

/** Sutherland–Hodgman: keep the part of poly with dot(p - o, n) >= 0. */
export function clipHalfPlane(poly: Pt[], o: Pt, n: Pt): Pt[] {
  const out: Pt[] = []
  const N = poly.length
  if (N === 0) return out
  const side = (p: Pt) => (p.x - o.x) * n.x + (p.y - o.y) * n.y
  for (let i = 0; i < N; i++) {
    const a = poly[i], b = poly[(i + 1) % N]
    const sa = side(a), sb = side(b)
    if (sa >= 0) out.push(a)
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

/** Clip poly to the wedge swept clockwise from bearing a0 to a1 around c (span < 180°). */
export function wedgeClip(poly: Pt[], c: Pt, a0: number, a1: number): Pt[] {
  const d0 = dirVec(a0), d1 = dirVec(a1)
  const p1 = clipHalfPlane(poly, c, { x: -d0.y, y: d0.x })
  return clipHalfPlane(p1, c, { x: d1.y, y: -d1.x })
}

/* ------------------------------------------------------------------ */
/* Curved edges — DXF-style bulge: b = tan(sweep/4).                    */
/* Positive bulge bows toward the left normal of travel (y-down),      */
/* which renders as SVG sweep-flag 1.                                   */
/* ------------------------------------------------------------------ */

export interface ArcSeg { c: Pt; R: number; a1: number; sweep: number }

export function arcFromBulge(p1: Pt, p2: Pt, b: number): ArcSeg | null {
  if (Math.abs(b) < 1e-4) return null
  const L = dist(p1, p2)
  if (L < 1e-9) return null
  const theta = 4 * Math.atan(b)
  const R = L / (2 * Math.sin(Math.abs(theta) / 2))
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  const nx = (p2.y - p1.y) / L, ny = -(p2.x - p1.x) / L
  const s = (L / 2) * b
  const t = s / 2 - (L * L) / (8 * s)
  const c = { x: mid.x + nx * t, y: mid.y + ny * t }
  const a1 = Math.atan2(p1.y - c.y, p1.x - c.x)
  return { c, R, a1, sweep: theta }
}

/** Bulge of the arc from p1 to p2 passing through m (0 if nearly straight). */
export function bulgeFromMid(p1: Pt, p2: Pt, m: Pt): number {
  const L = dist(p1, p2)
  if (L < 1e-9) return 0
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  const nx = (p2.y - p1.y) / L, ny = -(p2.x - p1.x) / L
  const s = (m.x - mid.x) * nx + (m.y - mid.y) * ny
  const b = (2 * s) / L
  return Math.max(-3, Math.min(3, b))
}

/** Point at parameter t (0..1) along the edge p1→p2 with the given bulge. */
export function edgePoint(p1: Pt, p2: Pt, b: number, t: number): Pt {
  const arc = arcFromBulge(p1, p2, b)
  if (!arc) return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t }
  const a = arc.a1 + arc.sweep * t
  return { x: arc.c.x + arc.R * Math.cos(a), y: arc.c.y + arc.R * Math.sin(a) }
}

export function edgeLength(p1: Pt, p2: Pt, b: number): number {
  const arc = arcFromBulge(p1, p2, b)
  return arc ? arc.R * Math.abs(arc.sweep) : dist(p1, p2)
}

function sampleEdgeInto(p1: Pt, p2: Pt, b: number, out: Pt[]) {
  const arc = arcFromBulge(p1, p2, b)
  if (!arc) { out.push(p2); return }
  const K = Math.max(6, Math.ceil(Math.abs(arc.sweep) / (Math.PI / 24)))
  for (let i = 1; i <= K; i++) {
    const a = arc.a1 + (arc.sweep * i) / K
    out.push({ x: arc.c.x + arc.R * Math.cos(a), y: arc.c.y + arc.R * Math.sin(a) })
  }
}

/** Flatten a bulged outline into a plain polygon for area/centroid/clipping math. */
export function sampledPolygon(pts: Pt[], bulges: number[], closed: boolean): Pt[] {
  if (pts.length < 2) return pts
  const out: Pt[] = [pts[0]]
  const n = pts.length
  const edges = closed ? n : n - 1
  for (let i = 0; i < edges; i++) {
    sampleEdgeInto(pts[i], pts[(i + 1) % n], bulges[i] ?? 0, out)
  }
  if (closed && out.length > 1) out.pop() // last sample = first point
  return out
}

/** SVG path with true arc segments. */
export function outlinePathD(pts: Pt[], bulges: number[], closed: boolean): string {
  if (pts.length === 0) return ''
  let d = `M${pts[0].x} ${pts[0].y}`
  const n = pts.length
  const edges = closed ? n : n - 1
  for (let i = 0; i < edges; i++) {
    const p2 = pts[(i + 1) % n]
    const b = bulges[i] ?? 0
    const arc = arcFromBulge(pts[i], p2, b)
    if (!arc) d += `L${p2.x} ${p2.y}`
    else {
      const large = Math.abs(arc.sweep) > Math.PI ? 1 : 0
      const sweepFlag = arc.sweep > 0 ? 1 : 0
      d += `A${arc.R} ${arc.R} 0 ${large} ${sweepFlag} ${p2.x} ${p2.y}`
    }
  }
  if (closed) d += 'Z'
  return d
}

/** Nearest point on the (possibly curved) edge p1→p2, with distance and param t (0..1). */
export function nearestOnEdge(p: Pt, p1: Pt, p2: Pt, b: number): { d: number; point: Pt; t: number } {
  const arc = arcFromBulge(p1, p2, b)
  if (!arc) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y
    const l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / l2))
    const point = { x: p1.x + t * dx, y: p1.y + t * dy }
    return { d: dist(p, point), point, t }
  }
  const TWO_PI = Math.PI * 2
  const ang = Math.atan2(p.y - arc.c.y, p.x - arc.c.x)
  let delta = ang - arc.a1
  if (arc.sweep > 0) {
    delta = ((delta % TWO_PI) + TWO_PI) % TWO_PI
    if (delta <= arc.sweep) {
      const point = { x: arc.c.x + arc.R * Math.cos(ang), y: arc.c.y + arc.R * Math.sin(ang) }
      return { d: Math.abs(dist(p, arc.c) - arc.R), point, t: delta / arc.sweep }
    }
  } else {
    delta = ((delta % TWO_PI) - TWO_PI) % TWO_PI
    if (delta >= arc.sweep) {
      const point = { x: arc.c.x + arc.R * Math.cos(ang), y: arc.c.y + arc.R * Math.sin(ang) }
      return { d: Math.abs(dist(p, arc.c) - arc.R), point, t: delta / arc.sweep }
    }
  }
  const d1 = dist(p, p1), d2 = dist(p, p2)
  return d1 <= d2 ? { d: d1, point: p1, t: 0 } : { d: d2, point: p2, t: 1 }
}

/** Split the bulge of an edge at param t into the two sub-edge bulges (arcs stay arcs). */
export function splitBulge(b: number, t: number): [number, number] {
  if (Math.abs(b) < 1e-4) return [0, 0]
  const sweep = 4 * Math.atan(b)
  return [Math.tan((sweep * t) / 4), Math.tan((sweep * (1 - t)) / 4)]
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/** Ramer–Douglas–Peucker: drop points within eps of the chord (slims freehand ink on commit). */
export function simplifyPath(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts
  const keep = new Array<boolean>(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack: Array<[number, number]> = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let worst = -1, wd = eps
    for (let i = a + 1; i < b; i++) {
      const dd = distToSegment(pts[i], pts[a], pts[b])
      if (dd > wd) { wd = dd; worst = i }
    }
    if (worst > 0) {
      keep[worst] = true
      stack.push([a, worst], [worst, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

export function boundsOf(pts: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}
