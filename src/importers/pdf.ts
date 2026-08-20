import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

let currentDoc: PDFDocumentProxy | null = null

export async function openPdf(data: ArrayBuffer): Promise<number> {
  if (currentDoc) { void currentDoc.destroy().catch(() => {}); currentDoc = null }
  currentDoc = await pdfjs.getDocument({ data }).promise
  return currentDoc.numPages
}

export function hasPdfOpen(): boolean {
  return currentDoc !== null
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
