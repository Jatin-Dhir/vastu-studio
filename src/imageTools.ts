import { loadImage } from './importers/raster'

/**
 * Prepare an uploaded chakra/compass image for overlaying:
 * 1. strip a light background to transparency (soft-edged chroma key on near-white),
 * 2. crop to a centred square around the wheel so image-centre = wheel-centre.
 * Printed and WhatsApp-forwarded charts on white paper become clean overlays.
 */
export async function processCompassImage(dataUrl: string): Promise<{ dataUrl: string; aspect: number; removedBg: boolean }> {
  const img = await loadImage(dataUrl)
  const W = Math.min(1600, img.width)
  const scale = W / img.width
  const H = Math.round(img.height * scale)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0, W, H)
  const data = g.getImageData(0, 0, W, H)
  const px = data.data

  // does this image even have a light background? sample the border
  let lightBorder = 0, borderCount = 0
  const isLight = (i: number) => {
    const r = px[i], gg = px[i + 1], b = px[i + 2]
    return Math.min(r, gg, b) > 208 && Math.max(r, gg, b) - Math.min(r, gg, b) < 34
  }
  for (let x = 0; x < W; x += 4) {
    for (const y of [0, 1, H - 2, H - 1]) {
      const i = (y * W + x) * 4
      borderCount++
      if (isLight(i)) lightBorder++
    }
  }
  for (let y = 0; y < H; y += 4) {
    for (const x of [0, 1, W - 2, W - 1]) {
      const i = (y * W + x) * 4
      borderCount++
      if (isLight(i)) lightBorder++
    }
  }
  const removedBg = lightBorder / Math.max(1, borderCount) > 0.55

  if (removedBg) {
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], gg = px[i + 1], b = px[i + 2]
      const mn = Math.min(r, gg, b)
      const sat = Math.max(r, gg, b) - mn
      if (sat < 36) {
        if (mn > 238) px[i + 3] = 0
        else if (mn > 206) px[i + 3] = Math.round(px[i + 3] * (1 - (mn - 206) / 32))
      }
    }
    g.putImageData(data, 0, 0)
  }

  // bounding box of what remains → centred square crop
  let minX = W, minY = H, maxX = 0, maxY = 0, any = false
  const d2 = g.getImageData(0, 0, W, H).data
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (d2[(y * W + x) * 4 + 3] > 24) {
        any = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (!any) return { dataUrl, aspect: img.height / img.width, removedBg: false }

  const cw = maxX - minX, ch = maxY - minY
  const side = Math.round(Math.max(cw, ch) * 1.02)
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const out = document.createElement('canvas')
  out.width = side; out.height = side
  out.getContext('2d')!.drawImage(c, cx - side / 2, cy - side / 2, side, side, 0, 0, side, side)
  return { dataUrl: out.toDataURL('image/png'), aspect: 1, removedBg }
}
