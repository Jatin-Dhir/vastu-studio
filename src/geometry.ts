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

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

export function boundsOf(pts: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

/** Rotate p around c by deg (positive = clockwise on screen). */
export function rotateAround(p: Pt, c: Pt, deg: number): Pt {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r), sin = Math.sin(r)
  const x = p.x - c.x, y = p.y - c.y
  return { x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos }
}
