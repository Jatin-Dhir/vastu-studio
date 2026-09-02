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
