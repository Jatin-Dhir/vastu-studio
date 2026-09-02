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
// erosion radii (work px), LARGEST first: a heavily-eroded core is guaranteed to be
// one room (doors cut at any r ≥ their half-width) but hugs the room's middle; each
// smaller r recovers more of the true extent — until the region suddenly JUMPS in
// size, which is the moment it merged with the neighbouring room through a doorway.
// The answer is the last size before that jump (measured on the demo plan: a room
// grows ≤ ~1.3× per rung while honest, then ×1.7+ the rung it merges).
const R_LADDER = [64, 56, 48, 40, 32, 24, 16]
const MERGE_JUMP = 1.5 // grown-bbox area growing past this ×best = merged, stop
const MAX_AREA_FRAC = 0.3 // grown fill above this fraction of the sheet = leaked
const MAX_SIDE_FRAC = 0.6 // grown bbox side above this fraction of the sheet = leaked
const MIN_CORE_PX = 60 // eroded core smaller than this = a sliver, not a room
const SEED_SEARCH_R = 70 // how far from the label a room-core pixel may be

interface WorkImage { w: number; h: number; scale: number; dist: Uint16Array }

async function loadWork(dataUrl: string): Promise<WorkImage | null> {
  const img = new Image()
  img.src = dataUrl
  try { await img.decode() } catch { return null }
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
  const hist = new Uint32Array(256)
  for (let i = 0; i < w * h; i++) {
    const l = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
    lum[i] = l
    hist[l | 0]++
  }
  const threshold = otsu(hist, w * h)
  return { w, h, scale, dist: distanceToDark(lum, threshold, w, h) }
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

  return seeds.map((seed) => {
    const cx = Math.round(seed.x * scale), cy = Math.round(seed.y * scale)
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null
    let best: [Pt, Pt] | null = null
    let bestArea = 0
    for (const r of R_LADDER) {
      const start = findCore(wi, r, cx, cy)
      if (start < 0) continue // room too small for this r — a shallower erosion may still fit
      // flood the eroded core: only pixels with clearance > r are passable
      filled.fill(0)
      let head = 0, tail = 0
      queue[tail++] = start
      filled[start] = 1
      let area = 0
      let minX = start % w, maxX = minX, minY = (start / w) | 0, maxY = minY
      while (head < tail) {
        const i = queue[head++]
        area++
        const x = i % w, y = (i / w) | 0
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
        if (x > 0 && !filled[i - 1] && dist[i - 1] > r) { filled[i - 1] = 1; queue[tail++] = i - 1 }
        if (x < w - 1 && !filled[i + 1] && dist[i + 1] > r) { filled[i + 1] = 1; queue[tail++] = i + 1 }
        if (y > 0 && !filled[i - w] && dist[i - w] > r) { filled[i - w] = 1; queue[tail++] = i - w }
        if (y < h - 1 && !filled[i + w] && dist[i + w] > r) { filled[i + w] = 1; queue[tail++] = i + w }
      }
      if (area < MIN_CORE_PX) continue
      // grow the core's bbox back by r — the room's bounds up to its walls
      const gminX = Math.max(0, minX - r), gmaxX = Math.min(w - 1, maxX + r)
      const gminY = Math.max(0, minY - r), gmaxY = Math.min(h - 1, maxY + r)
      const bw = gmaxX - gminX + 1, bh = gmaxY - gminY + 1
      const grownArea = bw * bh
      if (grownArea > w * h * MAX_AREA_FRAC || bw > w * MAX_SIDE_FRAC || bh > h * MAX_SIDE_FRAC) break // leaked outright
      if (best && grownArea > bestArea * MERGE_JUMP) break // merged with the neighbour — keep the pre-jump answer
      best = [{ x: gminX / scale, y: gminY / scale }, { x: gmaxX / scale, y: gmaxY / scale }]
      bestArea = grownArea
    }
    return best
  })
}
