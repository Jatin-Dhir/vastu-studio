import { createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Scene } from './canvas/Scene'
import { importDxf } from './importers/dxf'
import { centroid, circumradius, perimeter, polygonArea, sampledPolygon } from './geometry'
import { formatArea, formatLen, formatScale, M_PER_FT } from './format'
import { useStore } from './store'
import { downloadBlob } from './importers/project'
import type { Pt } from './types'

const FONT = "'Inter Variable', Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/** Serialise a React SVG tree with the client renderer the app already ships — react-dom/server
 *  put ~58 KB (gz) on every start just for exports — and as XML, which an SVG image requires. */
function svgMarkup(el: ReactElement): string {
  const host = document.createElement('div')
  const root = createRoot(host)
  flushSync(() => root.render(el))
  const svg = host.firstElementChild
  const out = svg ? new XMLSerializer().serializeToString(svg) : ''
  root.unmount()
  return out
}

let fontFaces: Promise<string> | null = null
/** Inter for the rasterised SVG (an SVG image cannot fetch its own fonts), as @font-face rules
 *  with data URLs, read once at the first export. The two static faces the PDF report already
 *  ships, not the variable font: inside an SVG image WebKit ignores a variable font's weight and
 *  draws its thin master for every weight (measured: the same ink at 300 and 800), which left
 *  the figure's title and date faint. Regular covers weights to 550, semibold everything above;
 *  no format() hint, which WebKit's SVG-image loader has rejected before. */
function interFontFaces(): Promise<string> {
  const read = (file: string) => fetch(`${import.meta.env.BASE_URL}fonts/${file}`)
    .then((r) => { if (!r.ok) throw new Error(file); return r.blob() })
    .then((b) => new Promise<string>((res, rej) => {
      const fr = new FileReader()
      fr.onload = () => res(String(fr.result))
      fr.onerror = () => rej(fr.error)
      fr.readAsDataURL(b)
    }))
  fontFaces ??= Promise.all([read('Inter-400.ttf'), read('Inter-600.ttf')])
    .then(([regular, semibold]) =>
      `@font-face{font-family:'Inter Variable';src:url(${regular});font-weight:100 550;font-style:normal;}` +
      `@font-face{font-family:'Inter Variable';src:url(${semibold});font-weight:551 900;font-style:normal;}`)
    .catch(() => { fontFaces = null; return '' })
  return fontFaces
}

/** A nice round scale-bar length for the current unit, targeting a fraction of the image width. */
function pickScaleBar(mpp: number, unit: 'ft' | 'm', maxWorldPx: number): { worldPx: number; label: string } | null {
  const candidates = unit === 'm' ? [1, 2, 5, 10, 20, 50, 100] : [5, 10, 20, 50, 100, 200]
  const toM = unit === 'm' ? 1 : M_PER_FT
  let best: { worldPx: number; label: string } | null = null
  for (const c of candidates) {
    const worldPx = (c * toM) / mpp
    if (worldPx <= maxWorldPx) best = { worldPx, label: unit === 'm' ? `${c} m` : `${c} ft` }
  }
  return best
}

export async function makePlanPng(): Promise<{ blob: Blob; w: number; h: number } | null> {
  const s = useStore.getState()
  if (s.bg.kind === 'none' && s.pts.length === 0) return null

  const sampled = sampledPolygon(s.pts, s.bulges, s.closed)
  const center: Pt | null = s.centerOverride ?? (s.pts.length >= 3 ? centroid(sampled) : null)
  // mirror the canvas: wheel area = plot area when closed, enclosing circle otherwise
  const R = center && s.pts.length >= 3
    ? (s.closed ? Math.sqrt(Math.abs(polygonArea(sampled)) / Math.PI) : circumradius(center, sampled) * 1.03)
    : 0
  const RS = R * (s.compass.scalePct / 100)

  let minX = 0, minY = 0, maxX = Math.max(1, s.bg.w), maxY = Math.max(1, s.bg.h)
  if (s.bg.kind === 'none') {
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity
  }
  for (const p of sampled) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  // markers, ink, room shapes and notes render wherever they were placed — include them or they crop
  // (room rects/ellipses/polygons all span exactly their stored points' bbox)
  for (const p of [...s.markers.map((m) => m.p), ...s.strokes.flatMap((st) => st.pts), ...s.roomShapes.flatMap((r) => r.pts)]) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  for (const t of s.texts) {
    const lines = (t.text || ' ').split('\n')
    const bw = Math.max(...lines.map((l) => l.length), 1) * t.size * 0.6
    minX = Math.min(minX, t.p.x); minY = Math.min(minY, t.p.y - t.size)
    maxX = Math.max(maxX, t.p.x + bw); maxY = Math.max(maxY, t.p.y + lines.length * t.size * 1.25)
  }
  if (center && RS > 0 && s.compass.id !== 'none' && s.closed) {
    minX = Math.min(minX, center.x - RS * 1.16)
    minY = Math.min(minY, center.y - RS * 1.16)
    maxX = Math.max(maxX, center.x + RS * 1.16)
    maxY = Math.max(maxY, center.y + RS * 1.16)
  } else if (center && R > 0 && s.markers.some((m) => m.kind === 'entrance')) {
    // no wheel drawn, but entrance ties still reach the plot circumradius (Scene's tieR fallback)
    minX = Math.min(minX, center.x - R * 1.08)
    minY = Math.min(minY, center.y - R * 1.08)
    maxX = Math.max(maxX, center.x + R * 1.08)
    maxY = Math.max(maxY, center.y + R * 1.08)
  }
  // the pada grid is the plot's north-aligned bounding square turned by north, with its needle
  // and N above the top edge — its corners reach past the plot whenever north is not 0/90°
  if (center && s.closed && s.compass.id === 'grid9' && sampled.length >= 3) {
    const rad = (-s.northDeg * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity
    for (const p of sampled) {
      const x = center.x + (p.x - center.x) * cos - (p.y - center.y) * sin
      const y = center.y + (p.x - center.x) * sin + (p.y - center.y) * cos
      gx0 = Math.min(gx0, x); gx1 = Math.max(gx1, x); gy0 = Math.min(gy0, y); gy1 = Math.max(gy1, y)
    }
    const ch = (gy1 - gy0) / 9
    const back = (x: number, y: number) => ({
      x: center.x + (x - center.x) * cos + (y - center.y) * sin,
      y: center.y - (x - center.x) * sin + (y - center.y) * cos,
    })
    for (const q of [back(gx0, gy0 - ch * 0.9), back(gx1, gy0 - ch * 0.9), back(gx0, gy1), back(gx1, gy1)]) {
      minX = Math.min(minX, q.x); minY = Math.min(minY, q.y)
      maxX = Math.max(maxX, q.x); maxY = Math.max(maxY, q.y)
    }
  }
  // room for the wall lengths and captions drawn just outside the outermost walls and markers
  const pad = (maxX - minX) * 0.035 + 24
  minX -= pad; minY -= pad; maxX += pad; maxY += pad

  // reserve bands for the title strip and the stats footer
  const w0 = maxX - minX
  const bandTop = w0 * 0.055
  const bandBottom = w0 * 0.06
  minY -= bandTop
  maxY += bandBottom
  const w = maxX - minX, h = maxY - minY

  // second ceiling keeps either output dimension <= 4000px (area under the ~16.7MP iOS canvas cap)
  const k0 = Math.min(4, Math.max(0.6, 2800 / Math.max(w, h)), 4000 / Math.max(w, h))
  const outW = Math.round(w * k0), outH = Math.round(h * k0)
  // The canvas draws captions, wall lengths and markers at a fixed screen size (px / k). Here
  // that size is chosen for the width the image is actually looked at: the report shows it
  // ~730 px wide, where the old 1.9x scale left captions and lengths ~4 px tall. At outW/760
  // every such label reads at its on-screen size there, and the wheel's detail tiers decide
  // what to show from that same apparent size.
  const labelScale = Math.max(1.9, Math.min(4.5, outW / 760))

  const dxf = s.bg.kind === 'dxf' && s.bg.dxfText ? importDxf(s.bg.dxfText) : null

  const scene = createElement(Scene, {
    bg: s.bg, dxf, pts: s.pts, bulges: s.bulges, closed: s.closed, center, R,
    centerOverridden: !!s.centerOverride,
    northDeg: s.northDeg, compass: s.compass, metersPerPx: s.metersPerPx,
    unit: s.unit, k: k0 / labelScale, showEdgeLabels: s.showEdgeLabels,
    markers: s.markers, strokes: s.strokes, roomShapes: s.roomShapes, texts: s.texts, idPrefix: 'exp',
    wallColor: s.wallColor, wallWidthM: s.wallWidthM, wallOpacity: s.wallOpacity,
    paper: true,
  })

  /* title + footer furniture, drawn in world coordinates */
  const rawTitle = (s.projectName && s.projectName !== 'Untitled plan' ? s.projectName : s.bg.name?.replace(/\.[^.]+$/, '')) || 'Vastu plan'
  // long filenames would run under the right-anchored date — trim before composing
  const title = rawTitle.length > 40 ? rawTitle.slice(0, 39).trimEnd() + '…' : rawTitle
  // the same form as the report's own header above the figure
  const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const t1 = w * 0.024, t2 = w * 0.0145
  const northSourceLabel =
    s.northSource === 'map' ? 'auto from map'
      : s.northSource === 'plan' ? 'from plan arrow'
        : s.northSource === 'manual' ? 'confirmed'
          : 'assumed'
  const statBits: string[] = []
  if (s.closed && s.pts.length >= 3 && s.metersPerPx) {
    statBits.push(`Area ${formatArea(polygonArea(sampled) * s.metersPerPx ** 2, s.unit)}`)
    statBits.push(`Perimeter ${formatLen(perimeter(sampled, true) * s.metersPerPx, s.unit)}`)
  }
  if (s.metersPerPx) statBits.push(formatScale(s.metersPerPx, s.unit))
  statBits.push(`North ${s.northDeg}° (${northSourceLabel})`)

  const bar = s.metersPerPx ? pickScaleBar(s.metersPerPx, s.unit, w * 0.24) : null
  const barY = maxY - bandBottom * 0.42
  // a light, paper-toned ground — this image is a deliverable (the client report,
  // or shared straight from Export PNG), not the in-app dark canvas; a dark plan
  // pasted into an otherwise-white report read as a mismatched, unfinished artifact
  const furniture = createElement('g', { fontFamily: FONT },
    createElement('text', {
      x: minX + w * 0.02, y: minY + bandTop * 0.62, fontSize: t1, fontWeight: 800, fill: '#2A2A22',
    }, `${title} — Vastu analysis`),
    createElement('text', {
      x: maxX - w * 0.02, y: minY + bandTop * 0.62, fontSize: t2, fontWeight: 600,
      fill: '#6E6C5D', textAnchor: 'end',
    }, dateStr),
    createElement('line', {
      x1: minX + w * 0.02, y1: minY + bandTop * 0.86, x2: maxX - w * 0.02, y2: minY + bandTop * 0.86,
      stroke: '#A9782E', strokeWidth: w * 0.0012, opacity: 0.55,
    }),
    createElement('text', {
      x: maxX - w * 0.02, y: barY + t2 * 0.35, fontSize: t2, fontWeight: 600,
      fill: '#40402E', textAnchor: 'end',
    }, statBits.join('   ·   ')),
    ...(bar ? [
      ...[0, 1, 2, 3].map((i) => createElement('rect', {
        key: `sb${i}`,
        x: minX + w * 0.02 + (bar.worldPx / 4) * i,
        y: barY - t2 * 0.42,
        width: bar.worldPx / 4,
        height: t2 * 0.5,
        fill: i % 2 === 0 ? '#A9782E' : '#EDEAE1',
        stroke: '#A9782E', strokeWidth: w * 0.0006,
      })),
      createElement('text', {
        key: 'sbl',
        x: minX + w * 0.02 + bar.worldPx + w * 0.012,
        y: barY + t2 * 0.28, fontSize: t2 * 0.95, fontWeight: 650, fill: '#40402E',
      }, bar.label),
    ] : []),
  )

  const faces = await interFontFaces()
  const svg = svgMarkup(
    createElement(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', width: outW, height: outH, viewBox: `${minX} ${minY} ${w} ${h}` },
      createElement('style', null, faces),
      createElement('rect', { x: minX, y: minY, width: w, height: h, fill: '#F3F1EA' }),
      scene,
      furniture,
    ),
  )

  const blobSvg = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blobSvg)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Could not rasterise export'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = outW; canvas.height = outH
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, outW, outH)
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('PNG encode failed')
    return { blob: png, w: outW, h: outH }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function exportPng(): Promise<void> {
  const s = useStore.getState()
  s.setBusy('Rendering export…')
  try {
    const out = await makePlanPng()
    if (!out) { s.toast('Nothing to export yet', 'warn'); return }
    const name = (s.bg.name?.replace(/\.[^.]+$/, '') || 'plan') + '-vastu.png'
    downloadBlob(out.blob, name)
    s.toast('PNG exported', 'ok')
  } catch (err) {
    console.error(err)
    s.toast('Export failed — see console for details', 'warn')
  } finally {
    s.setBusy(null)
  }
}
