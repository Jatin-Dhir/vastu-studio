/* Pure heading maths for the live compass — ported from the Jyotisha app's
 * compass_math.dart, where every convention below was verified against known
 * deity/direction pairs and the 0/360 wrap. No DOM, no sensors. */

/** Wraps any angle in degrees into [0, 360). */
export const normalizeDeg = (deg: number): number => ((deg % 360) + 360) % 360

/** Shortest signed difference (a − b), in [−180, 180]. */
export function angleDifference(a: number, b: number): number {
  const d = normalizeDeg(a - b)
  return d > 180 ? d - 360 : d
}

/** Circular exponential moving average, so smoothing never breaks across the wrap
 *  (a plain average of 359° and 1° would give 180°). alpha nearer 1 tracks faster. */
export function smoothHeading(previous: number | null, next: number, alpha = 0.35): number {
  if (previous == null) return normalizeDeg(next)
  return normalizeDeg(previous + alpha * angleDifference(next, previous))
}

/** Mean of headings via their sin/cos components. */
export function circularMeanDeg(degrees: number[]): number {
  let s = 0, c = 0
  for (const d of degrees) { const r = (d * Math.PI) / 180; s += Math.sin(r); c += Math.cos(r) }
  return normalizeDeg((Math.atan2(s, c) * 180) / Math.PI)
}

export const COMPASS_POINTS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const

/** 16-point label for a heading. */
export function compassPointLabel(headingDeg: number): string {
  return COMPASS_POINTS_16[Math.floor((normalizeDeg(headingDeg) + 11.25) / 22.5) % 16]
}

/** Which of the 16 points (0 = N) a heading falls in. */
export const point16IndexFor = (headingDeg: number): number => Math.floor((normalizeDeg(headingDeg) + 11.25) / 22.5) % 16

/** Which of the eight 45° Vastu zones (0 = North) a heading falls in. */
export const zone8IndexFor = (headingDeg: number): number => Math.round(normalizeDeg(headingDeg) / 45) % 8

/** Bearing of pada `index` (0–31) in the 32-pada Vastu Purusha Mandala. Pada 0 sits at
 *  45° (north-east), not 0°: pada 4 (Surya) must land on East, 12 (Yama) on South,
 *  20 (Varuna) on West, 28 (Soma) on North — the +45 offset is what makes all four true. */
export const padaBearing = (index: number): number => normalizeDeg(45 + index * 11.25)

/** Inverse of padaBearing — the same +45 offset, so dial and lookup never disagree. */
export function padaIndexFor(headingDeg: number): number {
  return Math.round(normalizeDeg(headingDeg - 45) / 11.25) % 32
}

/** Tilt from flat in degrees, from the gravity vector — sign-convention agnostic. */
export function tiltFromGravity(x: number, y: number, z: number): number {
  const mag = Math.hypot(x, y, z)
  if (mag < 1e-6) return 0
  return (Math.acos(Math.min(1, Math.abs(z) / mag)) * 180) / Math.PI
}
