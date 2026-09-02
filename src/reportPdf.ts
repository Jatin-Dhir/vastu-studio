import { downloadBlob } from './importers/project'
import type { Severity } from './evaluate'
import type { Assessment } from './reportText'

/**
 * A real, selectable-text PDF of the client report — laid out for density (the
 * browser print path wastes page space; this one doesn't). jsPDF loads lazily so
 * the main bundle never pays for it. On the native shells downloadBlob routes the
 * finished file straight into the share sheet, which is exactly where a
 * practitioner sends a client deliverable from a phone.
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
  findings: { severity: Severity; text: string }[]
  entrances: { title: string; badge: string | null; badgeSev: Severity; lines: string[] }[]
  rooms: { item: string; type: string; zone: string; pada: string; verdict: string; verdictSev: Severity; why: string | null }[]
  zones: { color: string; key: string; name: string; theme: string; share: string; area: string | null; status: string; statusSev: Severity | null }[]
}

const SEV_COLOR: Record<Severity, [number, number, number]> = {
  good: [62, 142, 82],
  warn: [176, 122, 30],
  bad: [194, 59, 46],
  info: [90, 100, 120],
}

const INK: [number, number, number] = [30, 34, 44]
const MUTED: [number, number, number] = [95, 102, 118]
const GOLD: [number, number, number] = [169, 120, 46]
const RULE: [number, number, number] = [214, 210, 200]

export async function exportReportPdf(data: ReportPdfData): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 44
  const CW = W - M * 2
  let y = M

  const ensure = (h: number) => {
    if (y + h > H - M - 16) { doc.addPage(); y = M }
  }
  const setColor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2])
  const text = (
    s: string,
    opts: { size?: number; bold?: boolean; italic?: boolean; color?: [number, number, number]; x?: number; width?: number; gap?: number; lh?: number },
  ) => {
    const size = opts.size ?? 10
    doc.setFont('helvetica', opts.bold ? 'bold' : opts.italic ? 'italic' : 'normal')
    doc.setFontSize(size)
    setColor(opts.color ?? INK)
    const x = opts.x ?? M
    const width = opts.width ?? (CW - (x - M))
    const lines: string[] = doc.splitTextToSize(s, width)
    const lh = opts.lh ?? size * 1.32
    for (const ln of lines) {
      ensure(lh)
      doc.text(ln, x, y)
      y += lh
    }
    y += opts.gap ?? 0
  }
  const secHead = (s: string) => {
    ensure(40)
    y += 10
    doc.setDrawColor(RULE[0], RULE[1], RULE[2])
    doc.setLineWidth(0.7)
    doc.line(M, y, W - M, y)
    y += 14
    text(s.toUpperCase(), { size: 9, bold: true, color: GOLD, gap: 4, lh: 11 })
  }
  const chip = (label: string, sev: Severity, x: number): number => {
    const c = SEV_COLOR[sev]
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.2)
    const w = doc.getTextWidth(label) + 10
    doc.setFillColor(c[0], c[1], c[2])
    doc.roundedRect(x, y - 7.4, w, 10.4, 5.2, 5.2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.text(label, x + 5, y)
    return w
  }

  /* ---- header ---- */
  text('Vastu Analysis Report', { size: 20, bold: true, lh: 22 })
  text(data.projectName, { size: 12, color: MUTED, gap: 2 })
  const cover = [
    `Date  ${data.date}`,
    data.practitioner ? `Prepared by  ${data.practitioner}` : null,
    data.client ? `Client  ${data.client}` : null,
    data.address ? `Site  ${data.address}` : null,
  ].filter(Boolean).join('     ')
  text(cover, { size: 9, color: MUTED, gap: 6 })

  /* ---- summary ---- */
  if (data.verdictLine) {
    const parts: [string, Severity][] = [
      [`${data.sevCounts.good} favourable`, 'good'],
      [`${data.sevCounts.warn} caution`, 'warn'],
      [`${data.sevCounts.bad} to address`, 'bad'],
      [`${data.sevCounts.info} noted`, 'info'],
    ]
    ensure(16)
    let x = M
    for (const [label, sev] of parts) x += chip(label, sev, x) + 6
    y += 10
    text(data.verdictLine, { size: 10.5, bold: true, gap: 4 })
  }

  /* ---- plan image ---- */
  if (data.plan) {
    const maxH = 300
    const scale = Math.min(CW / data.plan.w, maxH / data.plan.h)
    const iw = data.plan.w * scale
    const ih = data.plan.h * scale
    ensure(ih + 18)
    doc.addImage(data.plan.dataUrl, 'JPEG', M + (CW - iw) / 2, y, iw, ih)
    y += ih + 10
    text(data.planCaption, { size: 8, color: MUTED, gap: 2 })
  }

  /* ---- facts ---- */
  if (data.facts.length) {
    secHead('Property facts')
    const colW = CW / 2
    for (let i = 0; i < data.facts.length; i += 2) {
      const row = data.facts.slice(i, i + 2)
      const startY = y
      let maxY = y
      row.forEach((f, j) => {
        y = startY
        const x = M + j * colW
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(INK)
        doc.text(f.label, x, y)
        const labelW = doc.getTextWidth(f.label) + 6
        doc.setFont('helvetica', 'normal'); setColor(MUTED)
        const lines: string[] = doc.splitTextToSize(f.value, colW - labelW - 12)
        lines.forEach((ln, li) => doc.text(ln, x + labelW, y + li * 11))
        maxY = Math.max(maxY, y + (lines.length - 1) * 11)
      })
      y = maxY + 13
      ensure(24)
    }
  }

  /* ---- assessment ---- */
  if (data.assessment) {
    secHead('Assessment — what can change, and what cannot')
    text(data.assessment.summary, { size: 10, gap: 6 })
    if (data.assessment.improvable.length) {
      text('Can be improved', { size: 9.5, bold: true, color: SEV_COLOR.good, gap: 2 })
      for (const it of data.assessment.improvable) {
        ensure(24)
        text(`•  ${it.title}`, { size: 9.5, bold: true, lh: 12 })
        text(it.detail, { size: 9, color: MUTED, x: M + 12, gap: 4 })
      }
    }
    if (data.assessment.structural.length) {
      text('Fixed characteristics — plan around these', { size: 9.5, bold: true, color: SEV_COLOR.info, gap: 2 })
      for (const it of data.assessment.structural) {
        ensure(24)
        text(`•  ${it.title}`, { size: 9.5, bold: true, lh: 12 })
        text(it.detail, { size: 9, color: MUTED, x: M + 12, gap: 4 })
      }
    }
  }

  /* ---- findings ---- */
  if (data.findings.length) {
    secHead('Vastu findings')
    for (const f of data.findings) {
      ensure(20)
      const c = SEV_COLOR[f.severity]
      doc.setFillColor(c[0], c[1], c[2])
      doc.circle(M + 3, y - 3, 2.6, 'F')
      text(f.text, { size: 9.5, x: M + 12, gap: 3 })
    }
  }

  /* ---- entrances ---- */
  if (data.entrances.length) {
    secHead('Entrances')
    for (const e of data.entrances) {
      ensure(26)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setColor(INK)
      doc.text(e.title, M, y)
      if (e.badge) chip(e.badge, e.badgeSev, M + doc.getTextWidth(e.title) + 10)
      y += 13
      for (const ln of e.lines) text(ln, { size: 9, color: MUTED, gap: 0 })
      y += 5
    }
  }

  /* ---- rooms table ---- */
  if (data.rooms.length) {
    secHead('Rooms & objects')
    const cols = [0.2, 0.12, 0.26, 0.2, 0.12, 0.1]
    const xs = cols.map((_, i) => M + cols.slice(0, i).reduce((a, b) => a + b * CW, 0))
    const head = ['Item', 'Type', 'Zone', 'Pada', 'Verdict', '']
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setColor(MUTED)
    head.forEach((h, i) => doc.text(h, xs[i], y))
    y += 11
    for (const r of data.rooms) {
      ensure(26)
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]); doc.setLineWidth(0.4)
      doc.line(M, y - 8, W - M, y - 8)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); setColor(INK)
      const cells = [r.item, r.type, r.zone, r.pada]
      cells.forEach((cell, i) => {
        const lines: string[] = doc.splitTextToSize(cell, cols[i] * CW - 8)
        doc.text(lines[0] ?? '', xs[i], y)
      })
      chip(r.verdict, r.verdictSev, xs[4])
      y += 12
      if (r.why) text(r.why, { size: 8, italic: true, color: MUTED, x: M + 10, gap: 2 })
      y += 1
    }
  }

  /* ---- zone balance ---- */
  if (data.zones.length) {
    secHead('Zone balance (16 zones)')
    const half = Math.ceil(data.zones.length / 2)
    const colW = CW / 2
    const rowH = 13
    ensure(half * rowH + 8)
    const startY = y
    data.zones.forEach((z, i) => {
      const col = i < half ? 0 : 1
      const x = M + col * colW
      const ry = startY + (i % half) * rowH
      if (ry + rowH > H - M) return // safety; 16 rows fit one block in practice
      const rgb = hexToRgb(z.color)
      doc.setFillColor(rgb[0], rgb[1], rgb[2])
      doc.rect(x, ry - 6.5, 7, 7, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.4); setColor(INK)
      doc.text(z.key, x + 11, ry)
      doc.setFont('helvetica', 'normal'); setColor(MUTED)
      doc.text(`${z.share}${z.area ? ` · ${z.area}` : ''}`, x + 42, ry)
      if (z.statusSev) {
        const c = SEV_COLOR[z.statusSev]
        doc.setTextColor(c[0], c[1], c[2])
        doc.setFontSize(7.6)
        doc.text(z.status, x + colW - 14 - doc.getTextWidth(z.status), ry)
      }
    })
    y = startY + half * rowH + 6
  }

  /* ---- notes ---- */
  if (data.notes.trim()) {
    secHead('Observations & remedies')
    text(data.notes, { size: 9.5, gap: 2 })
  }

  /* ---- footer on every page ---- */
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(MUTED)
    doc.text(`${data.projectName} — Vastu analysis · Vastu Studio`, M, H - 22)
    doc.text(`${p} / ${pages}`, W - M - doc.getTextWidth(`${p} / ${pages}`), H - 22)
  }

  downloadBlob(doc.output('blob'), `${data.projectName.replace(/[^\w\- ]+/g, '') || 'plan'}-vastu-report.pdf`)
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
