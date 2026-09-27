import type { jsPDF } from 'jspdf'
import { downloadBlob } from './importers/project'
import type { Severity } from './evaluate'
import type { Assessment } from './reportText'

/**
 * The client report as a real, selectable-text PDF — set in the studio's own faces
 * (Cormorant Garamond for display, Inter for text) on the Paper palette, so the
 * deliverable reads as the same product the practitioner works in. jsPDF and the
 * fonts load lazily, so the main bundle never pays for them. downloadBlob routes
 * the finished file into the share sheet on the native shells.
 *
 * Typographic system (A4, points):
 *   margins 48 · body 9.5/14 · section heads Cormorant 17 · numerals Cormorant 26
 *   hairlines 0.5 in RULE · one accent (GOLD) for eyebrows, numbers and the move lines
 */

export interface ReportPdfData {
  projectName: string
  date: string
  client: string
  address: string
  practitioner: string
  notes: string
  verdictLine: string | null
  sevCounts: Record<Severity, number>
  plan: { dataUrl: string; w: number; h: number } | null
  planCaption: string
  facts: { label: string; value: string }[]
  assessment: Assessment | null
  findings: { severity: Severity; title: string; detail: string; context: string | null }[]
  entrances: { title: string; badge: string | null; badgeSev: Severity; lines: string[] }[]
  rooms: {
    item: string; type: string; pada: string
    shares: { key: string; pct: number; color: string }[]
    verdict: string; verdictSev: Severity
    why: string | null; move: string | null; note: string | null
  }[]
  zones: { color: string; key: string; name: string; theme: string; share: string; sharePct: number; area: string | null; status: string; statusSev: Severity | null }[]
}

type RGB = [number, number, number]

/* Paper theme, verbatim from theme.css */
const INK: RGB = [38, 37, 30]
const MUTED: RGB = [110, 108, 93]
const GOLD: RGB = [169, 120, 46]
const GOLD_DEEP: RGB = [143, 99, 31]
const RULE: RGB = [221, 216, 204]
const TINT: RGB = [246, 242, 234]
const SEV: Record<Severity, RGB> = {
  good: [62, 142, 82],
  warn: [176, 122, 30],
  bad: [194, 59, 46],
  info: [110, 108, 93],
}
const SEV_LABEL: Record<Severity, string> = { good: 'Favourable', warn: 'Caution', bad: 'To address', info: 'Noted' }

const mix = (c: RGB, t: number): RGB => [
  Math.round(c[0] + (255 - c[0]) * (1 - t)),
  Math.round(c[1] + (255 - c[1]) * (1 - t)),
  Math.round(c[2] + (255 - c[2]) * (1 - t)),
]

/* ---------------------------------------------------------------- fonts -- */
const FONT_FILES: [file: string, family: string, style: 'normal' | 'bold'][] = [
  ['CormorantGaramond-600.ttf', 'Cormorant', 'normal'],
  ['Inter-400.ttf', 'Inter', 'normal'],
  ['Inter-600.ttf', 'Inter', 'bold'],
]
const fontCache = new Map<string, string>()

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Embed the studio faces; false → the built-in Helvetica/Times carry the report. */
async function loadFonts(doc: jsPDF): Promise<boolean> {
  try {
    for (const [file, family, style] of FONT_FILES) {
      let b64 = fontCache.get(file)
      if (!b64) {
        const res = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`)
        if (!res.ok) throw new Error(file)
        b64 = toBase64(await res.arrayBuffer())
        fontCache.set(file, b64)
      }
      doc.addFileToVFS(file, b64)
      doc.addFont(file, family, style)
    }
    return true
  } catch {
    return false
  }
}

/** Glyphs the latin subsets lack, or that the built-in fonts cannot show. */
const clean = (s: string) => s.replace(/≈\s?/g, 'approx. ').replace(/[✓✕ℹ]/g, '').replace(/₹/g, 'Rs ')

export async function buildReportPdf(data: ReportPdfData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const custom = await loadFonts(doc)
  const SERIF = custom ? 'Cormorant' : 'times'
  const SANS = custom ? 'Inter' : 'helvetica'

  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 48
  const CW = W - M * 2
  const BOTTOM = H - 56
  let y = 56

  /* ---- primitives ---- */
  const cur = { family: SANS, size: 9.5, bold: false, rgb: INK as RGB }
  const color = (c: RGB) => { cur.rgb = c; doc.setTextColor(c[0], c[1], c[2]) }
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2])
  const stroke = (c: RGB, w = 0.5) => { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(w) }
  const font = (family: string, size: number, bold = false) => {
    cur.family = family; cur.size = size; cur.bold = bold
    doc.setFont(family, bold ? 'bold' : 'normal'); doc.setFontSize(size)
  }

  /* ---- text the embedded faces cannot draw ----
     jsPDF has no complex-script shaping and the faces carry Latin only, so a Hindi client
     name, room label or note used to vanish from the report (and "Śrī" lost its letters
     before the faces grew Latin Extended). A run with any such character is typeset by the
     browser — which shapes Devanagari and every other script with the system's own fonts —
     onto a canvas at print resolution and placed on the same baseline. Everything else stays
     real, selectable PDF text. */
  const COVERED = custom
    ? /^[\u0000-\u02FF\u1D00-\u1DBF\u1E00-\u1EFF\u2000-\u20CF\u2100-\u218F\u2190-\u21FF\u2C60-\u2C7F\uA720-\uA7FF\uFEFF]*$/
    : /^[\u0000-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]*$/
  const covered = (t: string) => COVERED.test(t)
  const PXPT = 4 // canvas pixels per PDF point (~290 dpi)
  const SANS_CSS = "'Inter Variable', Inter, 'Nirmala UI', 'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Devanagari Sangam MN', Mangal, 'Segoe UI', Roboto, Arial, sans-serif"
  const SERIF_CSS = "'Cormorant Garamond', 'Nirmala UI', 'Noto Serif Devanagari', 'Kohinoor Devanagari', 'Devanagari Sangam MN', Mangal, Georgia, serif"
  const cssFont = (px: number) => `${cur.bold || cur.family === SERIF ? 600 : 400} ${px}px ${cur.family === SERIF ? SERIF_CSS : SANS_CSS}`
  const mctx = document.createElement('canvas').getContext('2d')!
  const widthOf = (t: string): number => {
    if (covered(t)) return doc.getTextWidth(t)
    mctx.font = cssFont(cur.size * PXPT)
    return mctx.measureText(t).width / PXPT
  }
  const splitLines = (t: string, width: number): string[] => {
    if (covered(t)) return doc.splitTextToSize(t, width) as string[]
    mctx.font = cssFont(cur.size * PXPT)
    const out: string[] = []
    for (const para of t.split('\n')) {
      let line = ''
      for (const word of para.split(/(\s+)/)) {
        const next = line + word
        if (line.trim() && mctx.measureText(next.trimEnd()).width / PXPT > width) { out.push(line.trimEnd()); line = word.trimStart() }
        else line = next
      }
      out.push(line.trimEnd())
    }
    return out
  }
  const drawLine = (t: string, x: number, at: number, align?: 'left' | 'right') => {
    if (!t) return
    if (covered(t)) { doc.text(t, x, at, align === 'right' ? { align: 'right' } : undefined); return }
    const px = cur.size * PXPT
    mctx.font = cssFont(px)
    const m = mctx.measureText(t)
    const asc = Math.ceil(Math.max(m.actualBoundingBoxAscent || 0, px * 0.95))
    const desc = Math.ceil(Math.max(m.actualBoundingBoxDescent || 0, px * 0.3))
    const pad = 4
    const c = document.createElement('canvas')
    c.width = Math.ceil(m.width) + pad * 2; c.height = asc + desc
    const g = c.getContext('2d')!
    g.font = cssFont(px); g.fillStyle = `rgb(${cur.rgb[0]},${cur.rgb[1]},${cur.rgb[2]})`; g.textBaseline = 'alphabetic'
    g.fillText(t, pad, asc)
    const w = c.width / PXPT
    const left = (align === 'right' ? x - m.width / PXPT : x) - pad / PXPT
    doc.addImage(c.toDataURL('image/png'), 'PNG', left, at - asc / PXPT, w, c.height / PXPT)
  }
  /** How far a shaped run rises above Latin capitals of the same size (Devanagari's ि and
   *  other marks sit above the headline) — the first line gives it that much more room. */
  const tallExtra = (t: string): number => {
    if (covered(t)) return 0
    mctx.font = cssFont(cur.size * PXPT)
    const asc = (mctx.measureText(t).actualBoundingBoxAscent || 0) / PXPT
    return Math.max(0, asc - cur.size * 0.74)
  }
  /** One line that must fit its column: trimmed with an ellipsis instead of running over. */
  const fit = (t: string, width: number): string => {
    if (widthOf(t) <= width) return t
    let lo = 0, hi = t.length
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (widthOf(t.slice(0, mid).trimEnd() + '…') <= width) lo = mid; else hi = mid - 1 }
    return t.slice(0, lo).trimEnd() + '…'
  }
  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = 56 } }
  const hairline = (x1: number, x2: number, at = y) => { stroke(RULE); doc.line(x1, at, x2, at) }

  /** Flowing text. Returns the height used. */
  const text = (
    raw: string,
    o: { family?: string; size?: number; bold?: boolean; color?: RGB; x?: number; width?: number; lh?: number; gap?: number; align?: 'left' | 'right'; space?: number } = {},
  ): number => {
    const s = clean(raw)
    const size = o.size ?? 9.5
    font(o.family ?? SANS, size, o.bold)
    color(o.color ?? INK)
    if (o.space) doc.setCharSpace(o.space)
    const x = o.x ?? M
    const width = o.width ?? (M + CW - x)
    const lines: string[] = splitLines(s, width)
    const lh = o.lh ?? size * 1.45
    const start = y
    lines.forEach((ln, i) => {
      if (i === 0) y += tallExtra(ln)
      ensure(lh)
      drawLine(ln, o.align === 'right' ? x + width : x, y, o.align)
      y += lh
    })
    if (o.space) doc.setCharSpace(0)
    y += o.gap ?? 0
    return y - start
  }
  /** Measure without drawing. */
  const measure = (raw: string, size: number, width: number, bold = false, family = SANS, lh = size * 1.45): number => {
    font(family, size, bold)
    return splitLines(clean(raw), width).length * lh
  }
  /** Tracked uppercase label — eyebrows, table heads, tiny captions. */
  const label = (s: string, x: number, at: number, c: RGB = MUTED, size = 6.5, align: 'left' | 'right' = 'left') => {
    font(SANS, size, true); color(c); doc.setCharSpace(0.7)
    doc.text(clean(s).toUpperCase(), x, at, align === 'right' ? { align: 'right' } : undefined)
    doc.setCharSpace(0)
  }
  /** Tinted verdict pill. Returns its width. */
  const pill = (s: string, sev: Severity, x: number, at: number): number => {
    const c = SEV[sev]
    font(SANS, 6.6, true); doc.setCharSpace(0.5)
    const w = doc.getTextWidth(s.toUpperCase()) + 12
    fill(mix(c, 0.13)); doc.roundedRect(x, at - 7.6, w, 11, 2.5, 2.5, 'F')
    color(c); doc.text(s.toUpperCase(), x + 6, at)
    doc.setCharSpace(0)
    return w
  }
  let section = 0
  const head = (s: string, keepWith = 40) => {
    ensure(64 + keepWith)
    y += 18
    section += 1
    stroke(GOLD, 1.1); doc.line(M, y, M + 22, y)
    y += 15
    font(SANS, 7, true); color(GOLD); doc.setCharSpace(0.7)
    doc.text(String(section).padStart(2, '0'), M, y)
    doc.setCharSpace(0)
    font(SERIF, 17); color(INK)
    doc.text(clean(s), M + 20, y)
    y += 16
  }
  const subhead = (s: string, c: RGB) => {
    ensure(30)
    y += 4
    label(s, M, y, c, 6.8)
    y += 12
  }

  /* ================================================================ header */
  label('Vastu Studio  ·  Analysis report', M, y, GOLD, 7)
  font(SANS, 8.5); color(MUTED)
  doc.text(clean(data.date), M + CW, y, { align: 'right' })
  y += 24
  text(data.projectName, { family: SERIF, size: 30, lh: 32, gap: 6 })

  const meta = [
    data.client ? ['Client', data.client] : null,
    data.address ? ['Site', data.address] : null,
    data.practitioner ? ['Prepared by', data.practitioner] : null,
  ].filter((m): m is [string, string] => !!m)
  if (meta.length) {
    y += 6
    hairline(M, M + CW)
    y += 14
    const colW = CW / Math.max(meta.length, 2)
    let rowH = 0
    meta.forEach(([k, v], i) => {
      const x = M + i * colW
      label(k, x, y)
      font(SANS, 9.5); color(INK)
      const lines = splitLines(clean(v), colW - 14)
      lines.forEach((ln, li) => drawLine(ln, x, y + 12 + li * 12))
      rowH = Math.max(rowH, 12 + lines.length * 12)
    })
    y += rowH + 4
    hairline(M, M + CW)
    y += 8
  }

  /* ============================================================== verdict */
  if (data.verdictLine) {
    y += 14
    ensure(80)
    const counters: [Severity, number][] = [['good', data.sevCounts.good], ['warn', data.sevCounts.warn], ['bad', data.sevCounts.bad], ['info', data.sevCounts.info]]
    const cw = 62
    counters.forEach(([sev, n], i) => {
      const x = M + i * cw
      font(SERIF, 26); color(n > 0 ? SEV[sev] : mix(MUTED, 0.45))
      doc.text(String(n), x, y + 8)
      label(SEV_LABEL[sev], x, y + 20, n > 0 ? SEV[sev] : mix(MUTED, 0.6), 6.2)
    })
    const tx = M + counters.length * cw + 10
    const tw = M + CW - tx
    font(SANS, 10.5); color(INK)
    const lines: string[] = doc.splitTextToSize(clean(data.verdictLine), tw)
    lines.forEach((ln, i) => doc.text(ln, tx, y + 2 + i * 15))
    y += Math.max(30, 2 + lines.length * 15) + 10
  }

  /* ================================================================ facts */
  if (data.facts.length) {
    const cols = 3
    const colW = CW / cols
    const rowsOf = Array.from({ length: Math.ceil(data.facts.length / cols) }, (_, i) => data.facts.slice(i * cols, i * cols + cols))
    const heights = rowsOf.map((row) => {
      let h = 0
      row.forEach((f) => { font(SANS, 9.5); h = Math.max(h, 12 + (doc.splitTextToSize(clean(f.value), colW - 14) as string[]).length * 12) })
      return h
    })
    y += 10
    ensure(heights.reduce((a, b) => a + b + 14, 0) + 10)
    hairline(M, M + CW)
    y += 14
    rowsOf.forEach((row, ri) => {
      row.forEach((f, j) => {
        const x = M + j * colW
        label(f.label, x, y)
        font(SANS, 9.5); color(INK)
        const lines: string[] = doc.splitTextToSize(clean(f.value), colW - 14)
        lines.forEach((ln, li) => doc.text(ln, x, y + 12 + li * 12))
      })
      y += heights[ri] + 4
      hairline(M, M + CW)
      y += ri < rowsOf.length - 1 ? 10 : 0
    })
    y += 4
  }

  /* ================================================================= plan */
  if (data.plan) {
    y += 8
    // the plan is page one's hero: give it whatever the cover strip left, down to a floor,
    // rather than pushing it to a page of its own
    const room = BOTTOM - y - 40
    const maxH = room >= 230 ? Math.min(330, room) : 330
    const inner = CW - 16
    const scale = Math.min(inner / data.plan.w, maxH / data.plan.h)
    const iw = data.plan.w * scale
    const ih = data.plan.h * scale
    ensure(ih + 40)
    stroke(RULE); doc.rect(M, y, CW, ih + 16)
    doc.addImage(data.plan.dataUrl, 'JPEG', M + (CW - iw) / 2, y + 8, iw, ih)
    y += ih + 16 + 10
    text(data.planCaption, { size: 8, color: MUTED, lh: 11, gap: 0 })
  }

  /* =========================================================== assessment */
  if (data.assessment) {
    head('Assessment')
    text(data.assessment.summary, { size: 10.5, lh: 15.5, gap: 8, color: INK })
    const numbered = (items: { title: string; detail: string }[], c: RGB) => {
      items.forEach((it, i) => {
        const titleH = measure(it.title, 9.5, CW - 22, true, SANS, 13)
        const detailH = measure(it.detail, 9, CW - 22, false, SANS, 13)
        ensure(Math.min(titleH + detailH + 8, 60))
        font(SERIF, 14); color(c)
        doc.text(String(i + 1).padStart(2, '0'), M, y)
        text(it.title, { size: 9.5, bold: true, x: M + 22, lh: 13 })
        text(it.detail, { size: 9, color: MUTED, x: M + 22, lh: 13, gap: 7 })
      })
    }
    if (data.assessment.improvable.length) {
      subhead('Can be improved', SEV.good)
      numbered(data.assessment.improvable, GOLD)
    }
    if (data.assessment.structural.length) {
      subhead('Fixed characteristics — plan around these', SEV.info)
      numbered(data.assessment.structural, MUTED)
    }
  }

  /* ============================================================= findings */
  if (data.findings.length) {
    head('Findings')
    for (const f of data.findings) {
      const h = measure(f.title, 9.5, CW - 16, true, SANS, 13) + measure(f.detail, 9, CW - 16, false, SANS, 13)
      ensure(Math.min(h + 8, 52))
      fill(SEV[f.severity]); doc.rect(M, y - 6.5, 5.5, 5.5, 'F')
      text(f.title, { size: 9.5, bold: true, x: M + 16, lh: 13 })
      text(f.detail, { size: 9, color: MUTED, x: M + 16, lh: 13 })
      if (f.context) text(f.context, { size: 7.5, color: mix(MUTED, 0.85), x: M + 16, lh: 10 })
      y += 6
    }
  }

  /* ============================================================ entrances */
  if (data.entrances.length) {
    head('Entrances', 50)
    for (const e of data.entrances) {
      ensure(40)
      let pillW = 0
      if (e.badge) { font(SANS, 6.6, true); doc.setCharSpace(0.5); pillW = doc.getTextWidth(e.badge.toUpperCase()) + 12; doc.setCharSpace(0) }
      font(SANS, 10, true); color(INK)
      const tl = splitLines(clean(e.title), CW - (pillW ? pillW + 10 : 0))
      tl.forEach((ln, i) => drawLine(ln, M, y + i * 13))
      if (e.badge) { const w0 = widthOf(tl[0] ?? ''); pill(e.badge, e.badgeSev, M + w0 + 10, y); font(SANS, 10, true) }
      y += 14 + (tl.length - 1) * 13
      for (const ln of e.lines) text(ln, { size: 9, color: MUTED, lh: 13 })
      y += 8
    }
  }

  /* ================================================================ rooms */
  if (data.rooms.length) {
    head('Rooms & objects', 70)
    const cols = [0.19, 0.18, 0.26, 0.17, 0.2]
    const xs = cols.map((_, i) => M + cols.slice(0, i).reduce((a, b) => a + b * CW, 0))
    const heads = ['Item', 'Type', 'Where it sits', 'Pada', 'Verdict']
    heads.forEach((h, i) => label(h, xs[i], y))
    y += 6
    hairline(M, M + CW)
    y += 16
    for (const r of data.rooms) {
      const subW = CW - 12
      const subH = (r.why ? measure(r.why, 8.5, subW, false, SANS, 12) : 0)
        + (r.move ? measure(r.move, 8.5, subW, false, SANS, 12) : 0)
        + (r.note ? measure(r.note, 8.5, subW, false, SANS, 12) : 0)
      ensure(Math.min(30 + subH, 90))
      font(SANS, 9.5, true); color(INK)
      drawLine(fit(clean(r.item), cols[0] * CW - 10), xs[0], y)
      font(SANS, 9); color(MUTED)
      drawLine(fit(clean(r.type), cols[1] * CW - 8), xs[1], y)
      // the zone split as a stacked bar, then its legend
      const bx = xs[2], bw = cols[2] * CW - 14
      let acc = 0
      for (const s of r.shares) {
        const seg = (s.pct / 100) * bw
        const c = hexToRgb(s.color)
        fill(c); doc.rect(bx + acc, y - 7, Math.max(seg - 0.6, 0.4), 6, 'F')
        acc += seg
      }
      font(SANS, 7.5); color(MUTED)
      doc.text(clean(r.shares.map((s) => `${s.key} ${Math.round(s.pct)}%`).join(' · ')), bx, y + 9)
      font(SANS, 9); color(INK)
      doc.text(clean(r.pada), xs[3], y)
      pill(r.verdict, r.verdictSev, xs[4], y)
      y += 20
      if (r.why) text(r.why, { size: 8.5, color: MUTED, x: M + 12, lh: 12 })
      if (r.move) text(r.move, { size: 8.5, color: GOLD_DEEP, x: M + 12, lh: 12 })
      if (r.note) text(r.note, { size: 8.5, color: MUTED, x: M + 12, lh: 12 })
      y += 6
      hairline(M, M + CW)
      y += 14
    }
  }

  /* ================================================================ zones */
  if (data.zones.length) {
    head('Zone balance', data.zones.length * 14 + 40)
    const keyW = 118, shareW = 40, areaW = 62, statusW = 64
    const barX = M + keyW + 10
    const barW = CW - keyW - 10 - shareW - areaW - statusW - 12
    const maxPct = Math.max(6.25, ...data.zones.map((z) => z.sharePct))
    const rowH = 14
    ensure(data.zones.length * rowH + 30)
    // the even share every zone would hold on a regular plot — the eye reads cut/extended against it
    const evenX = barX + (6.25 / maxPct) * barW
    label('even share 6.25%', evenX - 1, y - 2, mix(MUTED, 0.9), 5.8, 'right')
    y += 6
    const top = y
    data.zones.forEach((z) => {
      const c = hexToRgb(z.color)
      fill(c); doc.rect(M, y - 6, 6, 6, 'F')
      font(SANS, 8, true); color(INK); doc.text(z.key, M + 10, y)
      font(SANS, 7.5); color(MUTED); doc.text(clean(z.name), M + 10 + 26, y)
      fill(TINT); doc.rect(barX, y - 7, barW, 8, 'F')
      fill(c); doc.rect(barX, y - 7, (z.sharePct / maxPct) * barW, 8, 'F')
      font(SANS, 8); color(INK)
      doc.text(clean(z.share), barX + barW + shareW, y, { align: 'right' })
      font(SANS, 7.5); color(MUTED)
      if (z.area) doc.text(clean(z.area), barX + barW + shareW + areaW, y, { align: 'right' })
      if (z.statusSev) {
        font(SANS, 7.2, true); color(SEV[z.statusSev])
        doc.text(z.status, M + CW, y, { align: 'right' })
      }
      y += rowH
    })
    stroke(mix(MUTED, 0.7), 0.5); doc.setLineDashPattern([1.5, 2], 0)
    doc.line(evenX, top - 10, evenX, y - 8)
    doc.setLineDashPattern([], 0)
    y += 2
    font(SANS, 7.5); color(MUTED)
    const flagged = data.zones.filter((z) => z.statusSev).length
    doc.text(flagged === 0
      ? 'Every zone holds close to its even share — the plot is regular.'
      : `${flagged === 1 ? 'One zone is' : `${flagged} zones are`} cut or extended against the even share.`, M, y)
    y += 20
  }

  /* ================================================================ notes */
  if (data.notes.trim()) {
    head('Observations & remedies')
    text(data.notes, { size: 9.5, lh: 14 })
  }

  /* =============================================================== footer */
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    hairline(M, M + CW, H - 40)
    font(SANS, 7); color(MUTED)
    drawLine(fit(clean(`${data.projectName} — Vastu analysis`), CW / 2 - 50), M, H - 28)
    doc.text(`Page ${p} of ${pages}`, M + CW, H - 28, { align: 'right' })
    label('Vastu Studio', M + CW / 2, H - 28, mix(MUTED, 0.85), 6)
  }

  return doc.output('blob')
}

export async function exportReportPdf(data: ReportPdfData): Promise<void> {
  const blob = await buildReportPdf(data)
  const base = data.projectName.replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  downloadBlob(blob, `${base || 'plan'} - Vastu report.pdf`)
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
