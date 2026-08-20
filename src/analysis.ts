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
