/**
 * A practitioner's logo, read from a picked or dropped file into the small data URL the
 * exports print. The empty margin round the mark (transparent, or the plain white of a
 * scanned or exported page) is trimmed so the mark fills the box it is given, the result is
 * scaled to at most 1200 × 360 px (several times what a page footer needs), and it is kept
 * as PNG unless a large opaque picture would store far smaller as JPEG.
 */

export class LogoError extends Error {
  constructor(readonly reason: 'type' | 'decode' | 'blank' | 'white') { super(reason) }
}

const TYPES = /^image\/(png|jpeg|webp)$/
const NAMES = /\.(png|jpe?g|webp)$/i

export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp'

/** What the person is told when a file cannot be used, in the sheet's own words. */
export function logoErrorText(err: unknown): string {
  const reason = err instanceof LogoError ? err.reason : 'decode'
  switch (reason) {
    case 'type': return 'Choose a PNG or JPG image for the logo'
    case 'blank': return 'That image is empty, so there is no logo to print'
    case 'white': return 'That logo is white, so it would not show on a white page. Choose a dark version'
    default: return 'That image could not be read. Try saving it as PNG or JPG'
  }
}

export async function readLogo(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  if (!(TYPES.test(file.type) || (!file.type && NAMES.test(file.name)))) throw new LogoError('type')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new LogoError('decode'))
      img.src = url
    })
    const W = img.naturalWidth, H = img.naturalHeight
    if (!W || !H) throw new LogoError('decode')

    // a working copy no larger than 2000 px: phone photos run to 12 MP
    const s0 = Math.min(1, 2000 / Math.max(W, H))
    const w0 = Math.max(1, Math.round(W * s0)), h0 = Math.max(1, Math.round(H * s0))
    const work = document.createElement('canvas')
    work.width = w0; work.height = h0
    const g0 = work.getContext('2d', { willReadFrequently: true })
    if (!g0) throw new LogoError('decode')
    g0.drawImage(img, 0, 0, w0, h0)
    const px = g0.getImageData(0, 0, w0, h0).data

    // the mark's extent: every pixel that is neither see-through nor page white
    let x0 = w0, y0 = h0, x1 = -1, y1 = -1
    let seeThrough = false, anyOpaque = false
    for (let y = 0; y < h0; y++) {
      for (let x = 0; x < w0; x++) {
        const i = (y * w0 + x) * 4
        const a = px[i + 3]
        if (a < 250) seeThrough = true
        if (a < 24) continue
        anyOpaque = true
        if (px[i] > 244 && px[i + 1] > 244 && px[i + 2] > 244) continue
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    if (x1 < 0) throw new LogoError(anyOpaque && seeThrough ? 'white' : 'blank')

    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02)
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad)
    x1 = Math.min(w0 - 1, x1 + pad); y1 = Math.min(h0 - 1, y1 + pad)
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1
    const s1 = Math.min(1, 1200 / cw, 360 / ch)
    const w = Math.max(1, Math.round(cw * s1)), h = Math.max(1, Math.round(ch * s1))
    const out = document.createElement('canvas')
    out.width = w; out.height = h
    const g = out.getContext('2d')
    if (!g) throw new LogoError('decode')
    g.imageSmoothingQuality = 'high'
    g.drawImage(work, x0, y0, cw, ch, 0, 0, w, h)

    let dataUrl = out.toDataURL('image/png')
    // flat marks are small as PNG; an opaque photograph is not, and JPEG keeps it storable
    if (!seeThrough && dataUrl.length > 400_000) dataUrl = out.toDataURL('image/jpeg', 0.92)
    return { dataUrl, w, h }
  } finally {
    URL.revokeObjectURL(url)
  }
}
