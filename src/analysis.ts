import { angleOf, polygonArea, wedgeClip } from './geometry'
import { GATES32, ZONES16, padaIndexOf, zoneIndexOf } from './vastu'
import type { Pt } from './types'

export interface ZoneRow {
  key: string; name: string; theme: string; color: string
  pct: number; areaPx: number
}

/** 16-zone area balance for a (sampled) polygon around its centre. */
export function zoneRows(sampled: Pt[], center: Pt, northDeg: number): ZoneRow[] | null {
  const total = polygonArea(sampled)
  if (total <= 0) return null
  return ZONES16.map((z, i) => {
    const a0 = northDeg - 11.25 + i * 22.5
    const clipped = wedgeClip(sampled, center, a0, a0 + 22.5)
    const area = polygonArea(clipped)
    return { ...z, pct: (area / total) * 100, areaPx: area }
  })
}

/** The plot's own Brahmasthan radius — the inscribed circle of the central ninth of the
 *  north-oriented bounding box. A property of the DRAWING; the compass never affects it. */
export function brahmasthanRadius(sampled: Pt[], center: Pt, northDeg: number): number {
  if (sampled.length < 3) return 0
  const rad = (-northDeg * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of sampled) {
    const x = center.x + (p.x - center.x) * cos - (p.y - center.y) * sin
    const y = center.y + (p.x - center.x) * sin + (p.y - center.y) * cos
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return Math.min(maxX - minX, maxY - minY) / 6
}

export interface Placement {
  bearing: number
  zoneIdx: number
  zone: (typeof ZONES16)[number]
  padaIdx: number
  pada: (typeof GATES32)[number]
}

/** Which zone and entrance pada a point occupies, seen from the centre with the given north. */
export function placementOf(p: Pt, center: Pt, northDeg: number): Placement {
  const bearing = (((angleOf(center, p) - northDeg) % 360) + 360) % 360
  const zoneIdx = zoneIndexOf(bearing)
  const padaIdx = padaIndexOf(bearing)
  return { bearing, zoneIdx, zone: ZONES16[zoneIdx], padaIdx, pada: GATES32[padaIdx] }
}
