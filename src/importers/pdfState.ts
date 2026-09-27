/** Which PDF pdf.js holds open, kept apart from pdf.ts so the side panel can ask "is this
 *  plan's document the loaded one?" without pulling pdf.js into the startup bundle. pdf.ts
 *  records the key and registers how to close the document; switching projects releases it
 *  (pdf.js kept the whole file in its worker's memory for the rest of the session). */
let currentKey: string | null = null
let closer: (() => void) | null = null

export function setOpenPdf(key: string | null, close: (() => void) | null) {
  currentKey = key
  closer = close
}

/** True only when the PDF identified by `key` is the one loaded — a plan opened from another
 *  tab or the library must never have its page swapped for another document's page. */
export function hasPdfOpen(key: string | undefined): boolean {
  return !!key && key === currentKey
}

export function closeOpenPdf() {
  const c = closer
  currentKey = null
  closer = null
  c?.()
}
