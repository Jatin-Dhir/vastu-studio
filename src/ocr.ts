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

    const { data } = await worker.recognize(imageDataUrl, {}, { text: false, blocks: true })
    const samples: TextSample[] = []
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          const text = line.text.trim().replace(/\s+/g, ' ')
          if (text.length < MIN_CHARS || line.confidence < MIN_CONFIDENCE) continue
          const x = Math.min(imgW, Math.max(0, (line.bbox.x0 + line.bbox.x1) / 2))
          const y = Math.min(imgH, Math.max(0, (line.bbox.y0 + line.bbox.y1) / 2))
          samples.push({ text, p: { x, y }, confidence: line.confidence / 100 })
        }
      }
    }
    return samples
  } finally {
    if (worker) await worker.terminate().catch(() => {})
  }
}
