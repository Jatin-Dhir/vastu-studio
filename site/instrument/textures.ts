/* The instrument's surfaces, drawn from the product's own data.
 *
 * The paper is the studio's Scene renderer rasterised (the same SVG the app draws and exports),
 * with the practitioner's north arrow, a drafting border and a title block added in the margin.
 * The acetates are ink on clear film, drawn on a canvas from the app's tables: the sixteen zones,
 * the thirty-two gates with their devtas. Nothing here is an illustration of the product's
 * output; it is the output, printed. */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import interWoff2 from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline'
import { Scene } from '../../src/canvas/Scene'
import { centroid, circumradius, sampledPolygon } from '../../src/geometry'
import { GATES32, GATE_QUALITY, GATE_START_DEG, ZONES16 } from '../../src/vastu'
import { BG, COMPASS, DXF, MARKERS, NORTH_DEG, OUTLINE, ROOMS } from '../sample'

export const PAPER = '#F4EEDF'
const INK = '#221E18'
const BRASS = '#B08A36'
const inkA = (a: number) => `rgba(30, 26, 20, ${a})`

const sampled = sampledPolygon(OUTLINE, OUTLINE.map(() => 0), true)
export const CENTER = centroid(sampled)
export const R_PLOT = circumradius(CENTER, sampled) * 1.03
/** The sheet: big enough that the whole acetate lies on paper, with a margin, in drawing units. */
const REACH = R_PLOT * 1.22
const MARGIN = DXF.w * 0.04
export const SHEET = {
  x0: Math.min(0, CENTER.x - REACH) - MARGIN, y0: Math.min(0, CENTER.y - REACH) - MARGIN,
  x1: Math.max(DXF.w, CENTER.x + REACH) + MARGIN, y1: Math.max(DXF.h, CENTER.y + REACH) + MARGIN,
}
export const PAPER_W = SHEET.x1 - SHEET.x0
export const PAPER_H = SHEET.y1 - SHEET.y0

export type Sheet = 'plain' | 'zones16' | 'gates32' | 'grid9'

/** The plan on paper, with whichever of the studio's overlays the act calls for printed on it. */
export async function planTexture(sheet: Sheet, px = 2048): Promise<HTMLCanvasElement> {
  const k = px / PAPER_W
  const W = px, H = Math.round(PAPER_H * k)
  // the Scene sets its stroke widths and type in screen pixels through `k`; a print wants them
  // heavier than a screen does, so the sheet is rendered as if seen at half the zoom
  const scene = createElement(Scene, {
    bg: BG, dxf: DXF, pts: OUTLINE, bulges: OUTLINE.map(() => 0), closed: true, center: CENTER, R: R_PLOT,
    northDeg: NORTH_DEG, compass: sheet === 'plain' ? { ...COMPASS, id: 'none' as const } : { ...COMPASS, id: sheet, labels: sheet === 'grid9', degreeRing: false },
    metersPerPx: DXF.metersPerPx, unit: 'ft' as const, k: k * 0.5, showEdgeLabels: true, markers: MARKERS, roomShapes: ROOMS,
    paper: true, idPrefix: `tex-${sheet}`,
  })
  // a drafting border, the way a printed sheet carries one
  const inset = PAPER_W * 0.02
  const border = createElement('rect', { x: SHEET.x0 + inset, y: SHEET.y0 + inset, width: PAPER_W - inset * 2, height: PAPER_H - inset * 2, fill: 'none', stroke: inkA(0.42), strokeWidth: PAPER_W * 0.0011 })
  // the drawing's north arrow, in the top margin — the mark a practitioner aligns the chakra to
  const ax = SHEET.x1 - PAPER_W * 0.085, ay = SHEET.y0 + PAPER_H * 0.09, ar = PAPER_W * 0.034
  const north = createElement('g', { transform: `translate(${ax} ${ay}) rotate(${NORTH_DEG})` },
    createElement('circle', { r: ar, fill: 'none', stroke: INK, strokeWidth: PAPER_W * 0.0016 }),
    createElement('path', { d: `M0 ${-ar * 1.35} L${ar * 0.42} ${ar * 0.55} L0 ${ar * 0.2} L${-ar * 0.42} ${ar * 0.55} Z`, fill: INK }),
    createElement('text', { x: 0, y: -ar * 1.55, textAnchor: 'middle', fontFamily: 'Inter Variable, Inter, sans-serif', fontSize: ar * 0.62, fontWeight: 700, fill: INK }, 'N'),
  )
  const tb = PAPER_W * 0.0125
  const tx = SHEET.x0 + PAPER_W * 0.045, ty = SHEET.y1 - PAPER_H * 0.062
  const title = createElement('g', { fontFamily: 'Inter Variable, Inter, sans-serif', fill: INK },
    createElement('text', { x: tx, y: ty, fontSize: tb * 1.15, fontWeight: 700, letterSpacing: tb * 0.06 }, 'SAMPLE RESIDENCE · GROUND FLOOR'),
    createElement('text', { x: tx, y: ty + tb * 1.55, fontSize: tb * 0.95, fontWeight: 500, opacity: 0.72 }, `Scale 1 : 100 · north ${NORTH_DEG}° from the sheet · 945 sq ft · drawn in Vastu Studio`),
  )
  const svg = renderToStaticMarkup(
    createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', width: W, height: H, viewBox: `${SHEET.x0} ${SHEET.y0} ${PAPER_W} ${PAPER_H}` },
      createElement('style', null, `@font-face{font-family:'Inter Variable';src:url(${interWoff2}) format('woff2-variations');font-weight:100 900;font-style:normal;}`),
      createElement('rect', { x: SHEET.x0, y: SHEET.y0, width: PAPER_W, height: PAPER_H, fill: PAPER }),
      border, scene, north, title,
    ),
  )
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('paper raster failed')); img.src = url })
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, W, H)
    // paper grain: a whisper of noise so the sheet reads as matter under the lamp
    const grain = ctx.getImageData(0, 0, W, H)
    const d = grain.data
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n }
    ctx.putImageData(grain, 0, 0)
    return c
  } finally { URL.revokeObjectURL(url) }
}

/** compass degrees (0 = north, clockwise) → canvas radians */
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180
const polar = (cx: number, cy: number, r: number, deg: number) => ({ x: cx + r * Math.cos(rad(deg)), y: cy + r * Math.sin(rad(deg)) })

function ringText(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, deg: number, text: string, font: string, color: string, upright = true) {
  const p = polar(cx, cy, r, deg)
  ctx.save()
  ctx.translate(p.x, p.y)
  let a = (deg * Math.PI) / 180
  if (upright && deg > 90 && deg < 270) a += Math.PI
  ctx.rotate(a)
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/** clear film: the glass and its tint are separate meshes, so the print carries ink only */
function film(px: number) {
  const c = document.createElement('canvas')
  c.width = px; c.height = px
  const ctx = c.getContext('2d')!
  return { c, ctx, cx: px / 2, cy: px / 2, R: px / 2 }
}

/** The sixteen-zone chakra, as printed on the acetate a practitioner lays over a plan. */
export async function zonesTexture(px = 2048): Promise<HTMLCanvasElement> {
  await document.fonts?.ready
  const { c, ctx, cx, cy, R } = film(px)
  const rOut = R * 0.985, rBand = R * 0.9, rZone = R * 0.82, rBrahma = R * 0.16
  // the sixteen spokes
  ctx.strokeStyle = inkA(0.62); ctx.lineWidth = px * 0.0014
  for (let i = 0; i < 16; i++) {
    const p = polar(cx, cy, rBand, i * 22.5 - 11.25)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke()
  }
  // the degree ring: a frosted band with ticks and numerals
  ctx.beginPath(); ctx.arc(cx, cy, rOut, 0, Math.PI * 2); ctx.arc(cx, cy, rBand, 0, Math.PI * 2, true)
  ctx.fillStyle = 'rgba(244, 238, 223, 0.55)'; ctx.fill('evenodd')
  ctx.strokeStyle = inkA(0.7); ctx.lineWidth = px * 0.0018
  ctx.beginPath(); ctx.arc(cx, cy, rOut, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy, rBand, 0, Math.PI * 2); ctx.stroke()
  for (let d = 0; d < 360; d += 2) {
    const major = d % 30 === 0, mid = d % 10 === 0
    const len = major ? R * 0.045 : mid ? R * 0.028 : R * 0.014
    const a = polar(cx, cy, rOut, d), b = polar(cx, cy, rOut - len, d)
    ctx.strokeStyle = major ? inkA(0.9) : inkA(0.55); ctx.lineWidth = major ? px * 0.0018 : px * 0.001
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    if (major && d !== 0) ringText(ctx, cx, cy, rOut - R * 0.075, d, String(d), `500 ${px * 0.019}px "Inter Variable", Inter, sans-serif`, inkA(0.9), false)
  }
  for (let i = 0; i < 16; i++) {
    const z = ZONES16[i]
    const cardinal = i % 4 === 0
    ringText(ctx, cx, cy, rZone, i * 22.5, z.key, `${cardinal ? 700 : 600} ${px * (cardinal ? 0.044 : 0.029)}px "Cormorant Garamond", Georgia, serif`, cardinal ? BRASS : inkA(0.92))
    ringText(ctx, cx, cy, rZone - R * 0.07, i * 22.5, z.theme.split(' · ')[0], `500 ${px * 0.0135}px "Inter Variable", Inter, sans-serif`, inkA(0.7))
  }
  // the Brahmasthan
  ctx.setLineDash([px * 0.006, px * 0.005]); ctx.strokeStyle = inkA(0.7); ctx.lineWidth = px * 0.0014
  ctx.beginPath(); ctx.arc(cx, cy, rBrahma, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
  ctx.font = `600 ${px * 0.021}px "Cormorant Garamond", Georgia, serif`; ctx.fillStyle = inkA(0.85); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('Brahmasthan', cx, cy - rBrahma - px * 0.018)
  // north: the brass pointer the practitioner lines up with the drawing's arrow
  const n0 = polar(cx, cy, rOut, 0), n1 = polar(cx, cy, rOut - R * 0.09, -3.2), n2 = polar(cx, cy, rOut - R * 0.09, 3.2)
  ctx.beginPath(); ctx.moveTo(n0.x, n0.y); ctx.lineTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.closePath()
  ctx.fillStyle = BRASS; ctx.fill()
  return c
}

/** The thirty-two gates: the entrance ring, with each pada's devta and its verdict. */
export async function gatesTexture(px = 2048): Promise<HTMLCanvasElement> {
  await document.fonts?.ready
  const { c, ctx, cx, cy, R } = film(px)
  const rOut = R * 0.985, rIn = R * 0.7
  const quality = GATE_QUALITY // filled by the charts a seat brings; empty here, so every gate prints neutral
  for (let i = 0; i < 32; i++) {
    const a0 = GATE_START_DEG + i * 11.25, a1 = a0 + 11.25
    const g = GATES32[i]
    const q = quality[g.code]?.v
    const fill = q === 'good' ? 'rgba(99, 181, 111, 0.24)' : q === 'caution' || q === 'avoid' ? 'rgba(224, 104, 79, 0.22)' : i % 2 ? 'rgba(244, 238, 223, 0.36)' : 'rgba(244, 238, 223, 0.18)'
    ctx.beginPath(); ctx.arc(cx, cy, rOut, rad(a0), rad(a1)); ctx.arc(cx, cy, rIn, rad(a1), rad(a0), true); ctx.closePath()
    ctx.fillStyle = fill; ctx.fill()
    ctx.strokeStyle = inkA(0.5); ctx.lineWidth = px * 0.0011; ctx.stroke()
    const mid = a0 + 5.625
    ringText(ctx, cx, cy, rOut - R * 0.06, mid, g.code, `700 ${px * 0.017}px "Inter Variable", Inter, sans-serif`, inkA(0.92))
    ringText(ctx, cx, cy, rOut - R * 0.16, mid, g.devta, `600 ${px * 0.021}px "Cormorant Garamond", Georgia, serif`, inkA(0.9))
  }
  ctx.strokeStyle = inkA(0.72); ctx.lineWidth = px * 0.0018
  ctx.beginPath(); ctx.arc(cx, cy, rOut, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy, rIn, 0, Math.PI * 2); ctx.stroke()
  // the cardinal lines inside, so the ring still reads as a compass
  ctx.strokeStyle = inkA(0.35); ctx.lineWidth = px * 0.0011
  for (let d = 0; d < 360; d += 45) { const p = polar(cx, cy, rIn, d); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke() }
  for (const [d, l] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']] as const) ringText(ctx, cx, cy, rIn - R * 0.07, d, l, `700 ${px * 0.032}px "Cormorant Garamond", Georgia, serif`, BRASS)
  const n0 = polar(cx, cy, rOut, 0), n1 = polar(cx, cy, rOut - R * 0.09, -3.2), n2 = polar(cx, cy, rOut - R * 0.09, 3.2)
  ctx.beginPath(); ctx.moveTo(n0.x, n0.y); ctx.lineTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.closePath()
  ctx.fillStyle = BRASS; ctx.fill()
  return c
}
