// Shared zero-dependency PNG writer + the Vastu Studio mark renderer:
// dark rounded square, gold diamond band, faint inner diamond, cream centre dot.
import { deflateSync } from 'node:zlib'

function crc32(buf) {
  let c, table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

export function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export const INK = [11, 12, 16]
export const GOLD = [217, 180, 91]
export const CREAM = [243, 229, 192]

/**
 * Render the mark.
 * opts.shape: 'rounded' (default) | 'square' (full-bleed) | 'none' (transparent ground)
 * opts.inset: extra padding fraction for the mark itself (adaptive safe zones)
 */
export function renderIcon(size, { shape = 'rounded', inset = 0 } = {}) {
  const img = Buffer.alloc(size * size * 4)
  const put = (i, c, a) => {
    const A = a, IA = 1 - a
    img[i] = Math.round(img[i] * IA + c[0] * A)
    img[i + 1] = Math.round(img[i + 1] * IA + c[1] * A)
    img[i + 2] = Math.round(img[i + 2] * IA + c[2] * A)
    img[i + 3] = Math.max(img[i + 3], Math.round(255 * a))
  }
  const S = size
  const corner = S * 0.22
  const aa = 1.2
  const smooth = (d) => Math.max(0, Math.min(1, 0.5 - d / aa))
  const k = 1 - inset * 2 // mark scale
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      let aBg = 1
      if (shape === 'rounded') {
        const qx = Math.abs(x - S / 2) - (S / 2 - corner)
        const qy = Math.abs(y - S / 2) - (S / 2 - corner)
        const dRect = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - corner
        aBg = smooth(dRect)
        if (aBg <= 0) continue
        put(i, INK, aBg)
      } else if (shape === 'square') {
        put(i, INK, 1)
      }
      // the mark, scaled about the centre by k
      const mx = (x - S / 2) / k + S / 2
      const my = (y - S / 2) / k + S / 2
      const m = Math.abs(mx - S / 2) + Math.abs(my - S / 2)
      const dBand = (Math.abs(m - S * 0.34) - S * 0.028) * k
      put(i, GOLD, smooth(dBand) * aBg)
      const dBand2 = (Math.abs(m - S * 0.21) - S * 0.012) * k
      put(i, [140, 118, 66], smooth(dBand2) * aBg)
      const dDot = (Math.hypot(mx - S / 2, my - S / 2) - S * 0.055) * k
      put(i, CREAM, smooth(dDot) * aBg)
    }
  }
  return encodePng(S, S, img)
}

/** A solid ink square (splash grounds stretch cleanly at any ratio). */
export function solidPng(size = 64, color = INK) {
  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = color[0]; rgba[i * 4 + 1] = color[1]; rgba[i * 4 + 2] = color[2]; rgba[i * 4 + 3] = 255
  }
  return encodePng(size, size, rgba)
}

/** Splash with the mark centred at a modest size on solid ink. */
export function renderSplash(size) {
  const img = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    img[i * 4] = INK[0]; img[i * 4 + 1] = INK[1]; img[i * 4 + 2] = INK[2]; img[i * 4 + 3] = 255
  }
  const S = size
  const aa = 1.2
  const smooth = (d) => Math.max(0, Math.min(1, 0.5 - d / aa))
  const put = (i, c, a) => {
    const A = a, IA = 1 - a
    img[i] = Math.round(img[i] * IA + c[0] * A)
    img[i + 1] = Math.round(img[i + 1] * IA + c[1] * A)
    img[i + 2] = Math.round(img[i + 2] * IA + c[2] * A)
  }
  const k = 0.26 // mark occupies ~26% of the splash
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      const mx = (x - S / 2) / k + S / 2
      const my = (y - S / 2) / k + S / 2
      const m = Math.abs(mx - S / 2) + Math.abs(my - S / 2)
      const dBand = (Math.abs(m - S * 0.34) - S * 0.028) * k
      put(i, GOLD, smooth(dBand))
      const dDot = (Math.hypot(mx - S / 2, my - S / 2) - S * 0.055) * k
      put(i, CREAM, smooth(dDot))
    }
  }
  return encodePng(S, S, img)
}
