// The legacy build, not the default one: pdf.js 5's modern build calls Uint8Array#toHex,
// Map#getOrInsertComputed, Math.sumPrecise and Promise.try, so PDF import failed outright
// on Safari 18, Chrome 131 and any WebView that is not brand new. The legacy build carries
// its own polyfills and reads the same files.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Safari has no async iteration on ReadableStream, and pdf.js reads a page's text layer with
// `for await` over one — so the printed "1 : 100" scale was never found there. Only the
// missing method is added; engines that have it keep their own.
if (typeof ReadableStream !== 'undefined' && !(Symbol.asyncIterator in ReadableStream.prototype)) {
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    value: async function* <T>(this: ReadableStream<T>) {
      const reader = this.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) return
          yield value
        }
      } finally {
        reader.releaseLock()
      }
    },
  })
}

// pdfjs fetches the worker lazily, so a PDF imported for the first time offline would fail —
// warm the service-worker cache once it controls the page (the native shell has no SW; no-op there)
if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.ready.then(() => fetch(workerUrl)).catch(() => {})
}

let currentDoc: PDFDocumentProxy | null = null
let currentKey: string | null = null

export async function openPdf(data: ArrayBuffer, key: string): Promise<number> {
  if (currentDoc) { void currentDoc.destroy().catch(() => {}); currentDoc = null; currentKey = null }
  currentDoc = await pdfjs.getDocument({ data }).promise
  currentKey = key
  return currentDoc.numPages
}

/** True only when the PDF identified by `key` is the one loaded — a plan opened from another
 *  tab or the library must never have its page swapped for another document's page. */
export function hasPdfOpen(key: string | undefined): boolean {
  return currentDoc !== null && !!key && key === currentKey
}

export async function renderPdfPage(pageNum: number): Promise<{ dataUrl: string; w: number; h: number; pxPerPt: number }> {
  if (!currentDoc) throw new Error('No PDF open')
  const page = await currentDoc.getPage(pageNum)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(6, Math.max(1, 3000 / Math.max(base.width, base.height)))
  const vp = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(vp.width)
  canvas.height = Math.round(vp.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // print intent renders via setTimeout, so it completes even in hidden/background tabs
  await page.render({ canvas, canvasContext: ctx, viewport: vp, intent: 'print' }).promise
  return { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height, pxPerPt: scale }
}

/**
 * Architectural drawings usually state their scale ("SCALE 1:100"). Read the page text
 * and return the ratio when exactly one sensible value appears — never guess between two.
 */
export async function detectPdfScaleRatio(pageNum: number): Promise<number | null> {
  if (!currentDoc) return null
  try {
    const page = await currentDoc.getPage(pageNum)
    const tc = await page.getTextContent()
    const text = tc.items.map((it: any) => it.str ?? '').join(' ')
    const found = new Set<number>()
    for (const m of text.matchAll(/\b1\s*[:∶]\s*(\d{1,4})\b/g)) {
      const r = parseInt(m[1], 10)
      if (r >= 20 && r <= 2000) found.add(r)
    }
    return found.size === 1 ? [...found][0] : null
  } catch {
    return null
  }
}
