// Generates PWA icons (PNG, no deps) — dark rounded square, gold diamond, centre dot.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

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

function encodePng(w, h, rgba) {
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

/** Signed distance helpers, all in [0..1] unit space. */
function renderIcon(size) {
  const img = Buffer.alloc(size * size * 4)
  const bg = [11, 12, 16], gold = [217, 180, 91], cream = [243, 229, 192]
  const put = (i, c, a) => {
    const A = a, IA = 1 - a
    img[i] = Math.round(img[i] * IA + c[0] * A)
    img[i + 1] = Math.round(img[i + 1] * IA + c[1] * A)
    img[i + 2] = Math.round(img[i + 2] * IA + c[2] * A)
    img[i + 3] = Math.max(img[i + 3], Math.round(255 * a))
  }
  const S = size
  const corner = S * 0.22
  const aa = 1.2 // px anti-alias band
  const smooth = (d) => Math.max(0, Math.min(1, 0.5 - d / aa))
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      // rounded-square background
      const qx = Math.abs(x - S / 2) - (S / 2 - corner)
      const qy = Math.abs(y - S / 2) - (S / 2 - corner)
      const dRect = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - corner
      const aBg = smooth(dRect)
      if (aBg <= 0) continue
      put(i, bg, aBg)
      // diamond band (manhattan ring)
      const m = Math.abs(x - S / 2) + Math.abs(y - S / 2)
      const rOuter = S * 0.34, band = S * 0.028
      const dBand = Math.abs(m - rOuter) - band
      put(i, gold, smooth(dBand) * aBg)
      // inner diamond, faint
      const dBand2 = Math.abs(m - S * 0.21) - S * 0.012
      put(i, [140, 118, 66], smooth(dBand2) * aBg)
      // centre dot
      const dDot = Math.hypot(x - S / 2, y - S / 2) - S * 0.055
      put(i, cream, smooth(dDot) * aBg)
    }
  }
  return encodePng(S, S, img)
}

const out = join(root, 'public', 'icons')
mkdirSync(out, { recursive: true })
for (const s of [512, 192, 180]) {
  writeFileSync(join(out, `icon-${s}.png`), renderIcon(s))
  console.log(`icon-${s}.png`)
}
