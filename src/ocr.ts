import type { TextSample } from './roomDetect'

/**
 * OCR over a raster/PDF background — the other TextSample source alongside DXF's exact
 * text layer (roomDetect.ts's textSamplesFromDxf). Runs fully offline: tesseract.js's
 * worker script, wasm core and English trained data are all self-hosted (never a CDN)
 * under public/tessdata/ so this works inside a Capacitor webview and on GitHub Pages
 * with no network at all. Everything is lazy — nothing loads at module-import time, only
 * inside ocrExtractText's own call — so tesseract.js stays out of the main bundle until a
 * practitioner actually taps "Auto-detect rooms".
 *
 * workerPath/corePath below are plain public/ paths, NOT Vite `?url` bundled imports —
 * that's a deliberate deviation, not an oversight. tesseract-core-simd-lstm.js locates its
 * .wasm sibling by resolving a relative filename against the *worker's own*
 * self.location.href (fixed once at Worker-construction time and never affected by a later
 * importScripts) — it never consults corePath for this. That only resolves correctly when
 * the worker script and the core+wasm files sit in the same, unhashed, co-located
 * directory, so all three (plus the language data) live together under public/tessdata/ and
 * workerBlobURL is turned off so self.location.href is the real workerPath, not a blob: URL.
 * A Vite-hashed worker.min.js would land in a different assets/ directory than the core+wasm
 * pair and silently break that lookup in production — confirmed end-to-end in-browser (network
 * tab + real recognition output) before settling on this layout.
 */

const TESSDATA_BASE = `${import.meta.env.BASE_URL}tessdata`

// Tesseract reports progress in separate 0..1 stages (core, language, api, recognize) —
// weighted into one overall 0..100 so a caller can drive a single busy-toast percentage.
const STAGE_RANGE: Record<string, [number, number]> = {
  'initializing tesseract': [0, 8],
  'loading language traineddata': [8, 55],
  'initializing api': [55, 62],
  'recognizing text': [62, 100],
}

// tesseract's own per-word/line confidence (0..100) below this is scan noise, not a label
const MIN_CONFIDENCE = 35
const MIN_CHARS = 2

/**
 * Recognizes text on a raster image and returns one sample per LINE (not per word — a
 * multi-word label like "Master Bedroom" must stay one sample) with its bbox centre as
 * position. imageDataUrl matches store.bg.dataUrl; imgW/imgH match store.bg.w/h and are the
 * frame Tesseract's own bboxes come back in — used here only to clamp against, since OCR
 * occasionally returns a box a hair outside the source bitmap at the edges.
 */
export async function ocrExtractText(
  imageDataUrl: string,
  imgW: number,
  imgH: number,
  onProgress?: (pct: number) => void,
): Promise<TextSample[]> {
  const { createWorker, PSM } = await import('tesseract.js')
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null
  try {
    worker = await createWorker('eng', 1 /* OEM.LSTM_ONLY — matches the simd-lstm core */, {
      workerPath: `${TESSDATA_BASE}/worker.min.js`,
      corePath: `${TESSDATA_BASE}/tesseract-core-simd-lstm.js`,
      langPath: TESSDATA_BASE,
      workerBlobURL: false,
      gzip: true,
      logger: (m) => {
        if (!onProgress || typeof m.progress !== 'number') return
        const range = STAGE_RANGE[m.status]
        if (!range) return
        const [start, end] = range
        onProgress(Math.round(start + (end - start) * m.progress))
      },
    })
    // architectural drawings are scattered labels on a mostly-blank sheet, not paragraphs —
    // SPARSE_TEXT keeps same-row labels from being stitched into one long merged line
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })

    // MEASURED (2026-09-04, synthetic hard plan: tints + vignette + dimension clutter):
    // tesseract's own binarization handles tinted/shadowed plans fine — raw recognition
    // ran 0.6s with 95%+ label confidence, while a flatten+re-encode "cleanup" pass
    // ballooned the same image to minutes (sparse-text chokes on re-encoded noise).
    // So: NO filtering here. The only preprocessing that earns its keep is upscaling
    // a genuinely small image (tiny text OCRs poorly), losslessly, as PNG.
    const { url: sourceUrl, scale: ocrScale } = await upscaleIfSmall(imageDataUrl, imgW, imgH)

    // a pathological image must never strand the busy state — give recognition a
    // hard ceiling and surface a real error instead
    const { data } = await Promise.race([
      worker.recognize(sourceUrl, {}, { text: false, blocks: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Text scan timed out — try a cleaner or smaller image')), 120_000)),
    ])
    const samples: TextSample[] = []
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          const text = line.text.trim().replace(/\s+/g, ' ')
          if (text.length < MIN_CHARS || line.confidence < MIN_CONFIDENCE) continue
          const x = Math.min(imgW, Math.max(0, (line.bbox.x0 + line.bbox.x1) / 2 / ocrScale))
          const y = Math.min(imgH, Math.max(0, (line.bbox.y0 + line.bbox.y1) / 2 / ocrScale))
          samples.push({ text, p: { x, y }, confidence: line.confidence / 100 })
        }
      }
    }
    return samples
  } finally {
    if (worker) await worker.terminate().catch(() => {})
  }
}

/**
 * Second OCR pass: read each room's PRINTED dimension line properly. The full-page
 * pass finds the labels but mangles the tiny italic size strings beneath them
 * ("20'-8\"x14'-7\"" came back as just "20'"), so this crops a strip under each
 * label, upscales it 3–4×, and re-recognises with a digits-and-marks whitelist —
 * the standard detect-then-zoom pattern. Mutates rooms in place (fills dimM).
 */
export async function ocrRefineDimensions(
  imageDataUrl: string,
  imgW: number,
  imgH: number,
  rooms: { p: { x: number; y: number }; dimM?: { w: number; h: number } }[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const targets = rooms.filter((r) => !r.dimM)
  if (targets.length === 0) return
  const { parseDimensions } = await import('./roomDetect')
  const { createWorker, PSM } = await import('tesseract.js')
  // onload, not decode() — decode() stalls indefinitely in hidden tabs
  const img = new Image()
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = imageDataUrl })
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null
  try {
    worker = await createWorker('eng', 1, {
      workerPath: `${TESSDATA_BASE}/worker.min.js`,
      corePath: `${TESSDATA_BASE}/tesseract-core-simd-lstm.js`,
      langPath: TESSDATA_BASE,
      workerBlobURL: false,
      gzip: true,
    })
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      // dimension strings are digits, feet/inch marks and an x — nothing else
      tessedit_char_whitelist: '0123456789\'"xX×-.mM ',
    })
    const halfW = Math.max(90, Math.round(imgW * 0.08))
    const above = Math.max(6, Math.round(imgW * 0.004))
    const below = Math.max(30, Math.round(imgW * 0.032))
    let done = 0
    for (const room of targets) {
      const x0 = Math.max(0, Math.round(room.p.x) - halfW)
      const y0 = Math.max(0, Math.round(room.p.y) - above)
      const cw = Math.min(imgW - x0, halfW * 2)
      const ch = Math.min(imgH - y0, above + below)
      if (cw < 20 || ch < 10) continue
      const nat = document.createElement('canvas')
      nat.width = cw; nat.height = ch
      const ng = nat.getContext('2d', { willReadFrequently: true })
      if (!ng) continue
      ng.drawImage(img, x0, y0, cw, ch, 0, 0, cw, ch)
      const up = Math.min(4, Math.max(2, Math.round(200 / ch)))
      const cv = document.createElement('canvas')
      cv.width = cw * up
      cv.height = ch * up
      const cx = cv.getContext('2d')
      if (!cx) continue
      cx.imageSmoothingQuality = 'high'
      try {
        // plain read first; only if it doesn't parse, retry with underlines erased —
        // the strip rescues underlined dim lines but can nick clean ones
        for (const stripped of [false, true]) {
          if (stripped) stripUnderlines(nat)
          cx.drawImage(nat, 0, 0, cv.width, cv.height)
          const { data } = await worker.recognize(cv.toDataURL('image/png'))
          const dim = parseDimensions(data.text ?? '')
          if (dim) { room.dimM = dim; break }
        }
      } catch { /* one bad crop must not kill the rest */ }
      onProgress?.(++done, targets.length)
    }
  } finally {
    if (worker) await worker.terminate().catch(() => {})
  }
}

/** Erase long horizontal dark runs (label underlines, table borders) from a crop —
 *  underlines slice through italic descenders and can make a word unreadable
 *  (measured: PUJA ROOM's dimension line went from garbage to exact after this). */
function stripUnderlines(cv: HTMLCanvasElement) {
  const g = cv.getContext('2d', { willReadFrequently: true })
  if (!g) return
  const { width: w, height: h } = cv
  const id = g.getImageData(0, 0, w, h)
  const px = id.data
  const MAX_RUN = 25
  for (let y = 0; y < h; y++) {
    let run = 0
    for (let x = 0; x <= w; x++) {
      const o = (y * w + x) * 4
      const dark = x < w && (px[o] * 299 + px[o + 1] * 587 + px[o + 2] * 114) / 1000 < 150
      if (dark) run++
      else {
        if (run > MAX_RUN) {
          for (let k = x - run; k < x; k++) { const e = (y * w + k) * 4; px[e] = px[e + 1] = px[e + 2] = 255 }
        }
        run = 0
      }
    }
  }
  g.putImageData(id, 0, 0)
}

/**
 * Zoomed re-read of suspicious label spots (see roomDetect.recoverySpots): the
 * full-page pass mangles small italic labels ("PUJA ROOM" → "1A ROOM") or drops
 * them while keeping their dimension line. A 3–4× crop read with the full charset
 * recovers them. 'at' re-reads the sample's own strip; 'above' looks over an
 * orphan dimension line for its lost label. Returns one raw text per spot.
 */
export async function ocrRecoverLabels(
  imageDataUrl: string,
  imgW: number,
  imgH: number,
  spots: { p: { x: number; y: number }; where: 'at' | 'above' }[],
): Promise<{ p: { x: number; y: number }; text: string }[]> {
  if (spots.length === 0) return []
  const { createWorker, PSM } = await import('tesseract.js')
  // onload, not decode() — decode() stalls indefinitely in hidden tabs
  const img = new Image()
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = imageDataUrl })
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null
  const out: { p: { x: number; y: number }; text: string }[] = []
  try {
    worker = await createWorker('eng', 1, {
      workerPath: `${TESSDATA_BASE}/worker.min.js`,
      corePath: `${TESSDATA_BASE}/tesseract-core-simd-lstm.js`,
      langPath: TESSDATA_BASE,
      workerBlobURL: false,
      gzip: true,
    })
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    const lineH = Math.max(14, Math.round(imgW * 0.011))
    for (const spot of spots) {
      // 'at' crops stay NARROW — a wide crop swallows the neighbouring room's label
      // and the mixed line matches nothing (measured on side-by-side KIT.WASH/PUJA)
      const halfW = spot.where === 'at' ? Math.max(84, Math.round(imgW * 0.05)) : Math.max(100, Math.round(imgW * 0.09))
      const cx0 = Math.round(spot.p.x), cy0 = Math.round(spot.p.y)
      const yTop = spot.where === 'at' ? cy0 - lineH * 1.4 : cy0 - lineH * 3.4
      const yBot = spot.where === 'at' ? cy0 + lineH * 2.6 : cy0 - lineH * 0.2
      const x0 = Math.max(0, cx0 - halfW)
      const y0 = Math.max(0, Math.round(yTop))
      const cw = Math.min(imgW - x0, halfW * 2)
      const ch = Math.min(imgH - y0, Math.max(12, Math.round(yBot - yTop)))
      if (cw < 24 || ch < 10) continue
      const nat = document.createElement('canvas')
      nat.width = cw; nat.height = ch
      const ng = nat.getContext('2d', { willReadFrequently: true })
      if (!ng) continue
      ng.drawImage(img, x0, y0, cw, ch, 0, 0, cw, ch)
      stripUnderlines(nat)
      const up = Math.min(6, Math.max(2, Math.round(180 / ch)))
      const cv = document.createElement('canvas')
      cv.width = cw * up
      cv.height = ch * up
      const cx = cv.getContext('2d')
      if (!cx) continue
      cx.imageSmoothingQuality = 'high'
      cx.drawImage(nat, 0, 0, cv.width, cv.height)
      try {
        const { data } = await worker.recognize(cv.toDataURL('image/png'))
        out.push({ p: spot.p, text: data.text ?? '' })
      } catch { /* skip a bad crop, keep the rest */ }
    }
  } finally {
    if (worker) await worker.terminate().catch(() => {})
  }
  return out
}

/** 2× upscale for genuinely small plans only (label text under ~15px reads poorly).
 *  Lossless PNG — a lossy re-encode measurably wrecks sparse-text recognition. */
async function upscaleIfSmall(
  dataUrl: string, imgW: number, imgH: number,
): Promise<{ url: string; scale: number }> {
  try {
    if (Math.max(imgW, imgH) >= 1200) return { url: dataUrl, scale: 1 }
    const scale = 2
    // onload, not decode() — decode() stalls indefinitely in hidden tabs
    const img = new Image()
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = dataUrl })
    const c = document.createElement('canvas')
    c.width = Math.round(imgW * scale)
    c.height = Math.round(imgH * scale)
    const ctx = c.getContext('2d')
    if (!ctx) return { url: dataUrl, scale: 1 }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return { url: c.toDataURL('image/png'), scale }
  } catch {
    return { url: dataUrl, scale: 1 }
  }
}
