import type { Pt } from './types'

/**
 * Room EXTENT detection — grows each detected room label (a point) into the room's
 * actual footprint, read from the walls drawn on the plan raster. Rooms on a real
 * floor plan connect through door openings, so a naive flood fill from the label
 * leaks and paints the whole house as one region (measured: a ~0.9 m doorway is
 * ~40 work-px — no sane wall thickening closes that). Instead, the classic
 * morphological segmentation:
 *
 *   1. distance-transform the light (non-wall) space,
 *   2. keep only pixels with clearance > r — rooms DISCONNECT at doorways,
 *      because a doorway's clearance is at most half the door width,
 *   3. flood the eroded core nearest the label, take its bbox,
 *   4. grow the bbox back by r — the room's true bounds up to its walls.
 *
 * r is laddered upward until the region stops leaking past the size caps; every
 * failure mode returns null and the caller falls back to the plain point marker —
 * a wrong confident rectangle is worse than a point.
 */

const WORK_MAX = 1000 // px — plans downscale to this for the fill
// erosion radii (work px), LARGEST first. A room announces itself as a PLATEAU:
// descending r, the grown box grows while pockets merge and alcoves join (the
// label's own lettering splits large-r cores into fragments, so early growth is
// legitimate), then sits STABLE across consecutive rungs once the whole room is
// recovered — until some rung slips through a doorway and the box explodes or
// trips the size caps. The answer is the deepest stable pair before that
// (measured on a cluttered plan: rungs 40/32/24 returned the identical true
// room box; every stop-on-first-jump heuristic froze on a text pocket instead).
const R_LADDER = [64, 56, 48, 40, 32, 24, 16]
const PLATEAU_TOL = 1.15 // adjacent grown boxes within this area ratio = stable room
const MAX_AREA_FRAC = 0.3 // grown fill above this fraction of the sheet = leaked
const MAX_SIDE_FRAC = 0.6 // grown bbox side above this fraction of the sheet = leaked
const MIN_CORE_PX = 60 // eroded core smaller than this = a sliver, not a room
const SEED_SEARCH_R = 70 // how far from the label a room-core pixel may be

interface WorkImage { w: number; h: number; scale: number; dist: Uint16Array }

async function loadWork(dataUrl: string): Promise<WorkImage | null> {
  const img = new Image()
  // onload + drawImage, NEVER img.decode(): decode() is deprioritised in hidden or
  // backgrounded tabs and can stall indefinitely (measured: forever vs 1ms) — a real
  // phone backgrounding the app mid-detection would freeze the whole feature
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = dataUrl })
  } catch { return null }
  if (!img.naturalWidth) return null
  const scale = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, w, h)
  let data: Uint8ClampedArray
  try { data = ctx.getImageData(0, 0, w, h).data } catch { return null } // tainted canvas etc.
  const lum = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) {
    lum[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
  }
  // real plans are photographed and tinted, not white — flatten the illumination so a
  // shadowed corner or a coloured room fill still reads as paper, and only real ink
  // (walls, text, hatching) survives the threshold
  const flat = flattenIllumination(lum, w, h)
  const hist = new Uint32Array(256)
  for (let i = 0; i < w * h; i++) hist[flat[i]]++
  const threshold = otsu(hist, w * h)
  return { w, h, scale, dist: distanceToDark(flat, threshold, w, h) }
}

/** Divide each pixel by the local background (a heavy separable box blur, twice):
 *  vignettes, page shadows and light tints normalise to paper; ink stays dark.
 *  Shared with the OCR preprocessor (ocr.ts) — same cleanup, both consumers. */
export function flattenIllumination(lum: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const r = Math.max(8, Math.round(Math.max(w, h) / 16))
  let bg = new Float32Array(lum)
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(bg.length)
    // horizontal running mean
    for (let y = 0; y < h; y++) {
      const row = y * w
      let sum = 0
      for (let x = -r; x <= r; x++) sum += bg[row + Math.min(w - 1, Math.max(0, x))]
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum / (2 * r + 1)
        sum += bg[row + Math.min(w - 1, x + r + 1)] - bg[row + Math.max(0, x - r)]
      }
    }
    // vertical running mean
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
      for (let y = 0; y < h; y++) {
        bg[y * w + x] = sum / (2 * r + 1)
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
      }
    }
  }
  const out = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) out[i] = (lum[i] * 220) / Math.max(1, bg[i])
  return out
}

/** Otsu's threshold over the luminance histogram, clamped to a sane band so a
 *  near-uniform sheet (blank checkerboard) doesn't split its two paper tones. */
function otsu(hist: Uint32Array, total: number): number {
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 127, bestVar = -1
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) * (mB - mF)
    if (v > bestVar) { bestVar = v; best = t }
  }
  return Math.min(210, Math.max(50, best))
}

/** Two-pass L1 (chamfer) distance from every light pixel to the nearest dark
 *  (wall/line/text) pixel. Dark pixels and the sheet edge are distance 0. */
function distanceToDark(lum: Uint8ClampedArray, threshold: number, w: number, h: number): Uint16Array {
  const INF = 0xffff
  const d = new Uint16Array(w * h)
  for (let i = 0; i < w * h; i++) d[i] = lum[i] < threshold ? 0 : INF
  // forward pass (treat out-of-bounds as walls so margins don't read as infinite space)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      const i = row + x
      if (d[i] === 0) continue
      const up = y > 0 ? d[i - w] : 0
      const left = x > 0 ? d[i - 1] : 0
      const m = Math.min(up, left) + 1
      if (m < d[i]) d[i] = m
    }
  }
  // backward pass
  for (let y = h - 1; y >= 0; y--) {
    const row = y * w
    for (let x = w - 1; x >= 0; x--) {
      const i = row + x
      if (d[i] === 0) continue
      const down = y < h - 1 ? d[i + w] : 0
      const right = x < w - 1 ? d[i + 1] : 0
      const m = Math.min(down, right) + 1
      if (m < d[i]) d[i] = m
    }
  }
  return d
}

/** Nearest pixel to (cx,cy) whose clearance exceeds r — the room's open middle,
 *  found even though the label itself sits on low-clearance lettering. */
function findCore(wi: WorkImage, r: number, cx: number, cy: number): number {
  const { w, h, dist } = wi
  for (let ring = 0; ring <= SEED_SEARCH_R; ring += 2) {
    for (let dy = -ring; dy <= ring; dy += 2) {
      for (let dx = -ring; dx <= ring; dx += 2) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < ring - 1) continue
        const x = cx + dx, y = cy + dy
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        if (dist[y * w + x] > r) return y * w + x
      }
    }
  }
  return -1
}

/**
 * For each label point (world px), the room rectangle around it as [tl, br] in
 * world px — or null where no believable room could be read. One shared decode
 * and distance transform serve every seed.
 */
export async function detectRoomExtents(dataUrl: string, seeds: Pt[]): Promise<([Pt, Pt] | null)[]> {
  const wi = await loadWork(dataUrl)
  if (!wi) return seeds.map(() => null)
  const { w, h, scale, dist } = wi
  const queue = new Int32Array(w * h)
  const filled = new Uint8Array(w * h)
  const xHist = new Uint32Array(w)
  const yHist = new Uint32Array(h)

  return seeds.map((seed) => {
    const cx = Math.round(seed.x * scale), cy = Math.round(seed.y * scale)
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null
    let plateau: [Pt, Pt] | null = null
    let prevArea = 0
    for (const r of R_LADDER) {
      const start = findCore(wi, r, cx, cy)
      if (start < 0) continue // room too small for this r — a shallower erosion may still fit
      // flood the eroded core: only pixels with clearance > r are passable
      filled.fill(0)
      xHist.fill(0); yHist.fill(0)
      let head = 0, tail = 0
      queue[tail++] = start
      filled[start] = 1
      let area = 0
      while (head < tail) {
        const i = queue[head++]
        area++
        const x = i % w, y = (i / w) | 0
        xHist[x]++; yHist[y]++
        if (x > 0 && !filled[i - 1] && dist[i - 1] > r) { filled[i - 1] = 1; queue[tail++] = i - 1 }
        if (x < w - 1 && !filled[i + 1] && dist[i + 1] > r) { filled[i + 1] = 1; queue[tail++] = i + 1 }
        if (y > 0 && !filled[i - w] && dist[i - w] > r) { filled[i - w] = 1; queue[tail++] = i - w }
        if (y < h - 1 && !filled[i + w] && dist[i + w] > r) { filled[i + w] = 1; queue[tail++] = i + w }
      }
      if (area < MIN_CORE_PX) continue
      // the core's span, with 2% of pixels trimmed from each side — a thin tendril
      // that leaked through a gap no longer drags the whole rectangle with it
      const trim = area >= 400 ? Math.max(1, Math.round(area * 0.02)) : 0
      const minX = percentileLo(xHist, trim), maxX = percentileHi(xHist, trim)
      const minY = percentileLo(yHist, trim), maxY = percentileHi(yHist, trim)
      // grow back by r — the room's bounds up to its walls
      const gminX = Math.max(0, minX - r), gmaxX = Math.min(w - 1, maxX + r)
      const gminY = Math.max(0, minY - r), gmaxY = Math.min(h - 1, maxY + r)
      const bw = gmaxX - gminX + 1, bh = gmaxY - gminY + 1
      const grownArea = bw * bh
      if (grownArea > w * h * MAX_AREA_FRAC || bw > w * MAX_SIDE_FRAC || bh > h * MAX_SIDE_FRAC) break // leaked — deeper rungs only leak worse
      if (prevArea > 0 && grownArea <= prevArea * PLATEAU_TOL) {
        // stable across two rungs — the deepest such pair before a leak wins
        plateau = [{ x: gminX / scale, y: gminY / scale }, { x: gmaxX / scale, y: gmaxY / scale }]
      }
      prevArea = grownArea
    }
    // no two rungs ever agreed = nothing believable was found; the caller falls
    // back to the point marker rather than guessing
    return plateau
  })
}

function percentileLo(hist: Uint32Array, skip: number): number {
  let acc = 0
  for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc > skip) return i }
  return 0
}
function percentileHi(hist: Uint32Array, skip: number): number {
  let acc = 0
  for (let i = hist.length - 1; i >= 0; i--) { acc += hist[i]; if (acc > skip) return i }
  return hist.length - 1
}
