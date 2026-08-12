import type { Unit } from './types'

export const M_PER_FT = 0.3048

export function formatLen(m: number, unit: Unit): string {
  if (!isFinite(m) || m < 0) return '–'
  if (unit === 'm') return m >= 100 ? `${m.toFixed(1)} m` : `${m.toFixed(2)} m`
  const ftF = m / M_PER_FT
  let ft = Math.floor(ftF)
  let inch = Math.round((ftF - ft) * 12)
  if (inch === 12) { ft += 1; inch = 0 }
  return inch === 0 ? `${ft}′` : `${ft}′ ${inch}″`
}

export function formatArea(m2: number, unit: Unit): string {
  if (!isFinite(m2)) return '–'
  if (unit === 'm') return `${m2 >= 100 ? Math.round(m2).toLocaleString('en-IN') : m2.toFixed(1)} m²`
  const sqft = m2 / (M_PER_FT * M_PER_FT)
  return `${sqft >= 100 ? Math.round(sqft).toLocaleString('en-IN') : sqft.toFixed(1)} sq ft`
}

export function formatScale(metersPerPx: number | null, unit: Unit): string {
  if (!metersPerPx) return 'Not set'
  if (unit === 'm') {
    const cm = metersPerPx * 100
    return `1 px ≈ ${cm >= 10 ? cm.toFixed(0) : cm.toFixed(2)} cm`
  }
  const inch = (metersPerPx / M_PER_FT) * 12
  return `1 px ≈ ${inch >= 10 ? inch.toFixed(0) : inch.toFixed(2)} in`
}
