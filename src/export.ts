import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import interWoff2 from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline'
import { Scene } from './canvas/Scene'
import { importDxf } from './importers/dxf'
import { centroid, circumradius, perimeter, polygonArea, sampledPolygon } from './geometry'
import { formatArea, formatLen, formatScale, M_PER_FT } from './format'
import { useStore } from './store'
import { downloadBlob } from './importers/project'
import type { Pt } from './types'

const FONT = "'Inter Variable', Inter, system-ui, sans-serif"

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
  const R = center && s.pts.length >= 3 ? circumradius(center, sampled) * 1.03 : 0
  const RS = R * (s.compass.scalePct / 100)

  let minX = 0, minY = 0, maxX = Math.max(1, s.bg.w), maxY = Math.max(1, s.bg.h)
  if (s.bg.kind === 'none') {
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity
  }
  for (const p of sampled) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  if (center && RS > 0 && s.compass.id !== 'none') {
    minX = Math.min(minX, center.x - RS * 1.16)
    minY = Math.min(minY, center.y - RS * 1.16)
    maxX = Math.max(maxX, center.x + RS * 1.16)
    maxY = Math.max(maxY, center.y + RS * 1.16)
  }
  const pad = (maxX - minX) * 0.02 + 24
  minX -= pad; minY -= pad; maxX += pad; maxY += pad

  // reserve bands for the title strip and the stats footer
  const w0 = maxX - minX
  const bandTop = w0 * 0.055
  const bandBottom = w0 * 0.06
  minY -= bandTop
  maxY += bandBottom
  const w = maxX - minX, h = maxY - minY

  const k0 = Math.min(4, Math.max(0.6, 2800 / Math.max(w, h)))
  const outW = Math.round(w * k0), outH = Math.round(h * k0)

  const dxf = s.bg.kind === 'dxf' && s.bg.dxfText ? importDxf(s.bg.dxfText) : null

  const scene = createElement(Scene, {
    bg: s.bg, dxf, pts: s.pts, bulges: s.bulges, closed: s.closed, center, R,
    centerOverridden: !!s.centerOverride,
    northDeg: s.northDeg, compass: s.compass, metersPerPx: s.metersPerPx,
    unit: s.unit, k: k0 / 1.9, showEdgeLabels: s.showEdgeLabels,
    markers: s.markers, idPrefix: 'exp',
  })

  /* title + footer furniture, drawn in world coordinates */
  const title = (s.bg.name?.replace(/\.[^.]+$/, '') || 'Vastu plan')
  const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const t1 = w * 0.024, t2 = w * 0.0145
  const northLabel =
    s.northSource === 'map' ? 'north auto (map)'
      : s.northSource === 'plan' ? 'north from plan arrow'
        : `north ${s.northDeg}°`
  const statBits: string[] = []
  if (s.closed && s.pts.length >= 3 && s.metersPerPx) {
    statBits.push(`Area ${formatArea(polygonArea(sampled) * s.metersPerPx ** 2, s.unit)}`)
    statBits.push(`Perimeter ${formatLen(perimeter(sampled, true) * s.metersPerPx, s.unit)}`)
  }
  if (s.metersPerPx) statBits.push(formatScale(s.metersPerPx, s.unit))
  statBits.push(`North ${s.northDeg}° · ${northLabel}`)

  const bar = s.metersPerPx ? pickScaleBar(s.metersPerPx, s.unit, w * 0.24) : null
  const barY = maxY - bandBottom * 0.42
  const furniture = createElement('g', { fontFamily: FONT },
    createElement('text', {
      x: minX + w * 0.02, y: minY + bandTop * 0.62, fontSize: t1, fontWeight: 800, fill: '#F3E5C0',
    }, `${title} — Vastu analysis`),
    createElement('text', {
      x: maxX - w * 0.02, y: minY + bandTop * 0.62, fontSize: t2, fontWeight: 600,
      fill: '#98A1B3', textAnchor: 'end',
    }, dateStr),
    createElement('line', {
      x1: minX + w * 0.02, y1: minY + bandTop * 0.86, x2: maxX - w * 0.02, y2: minY + bandTop * 0.86,
      stroke: '#D9B45B', strokeWidth: w * 0.0012, opacity: 0.55,
    }),
    createElement('text', {
      x: maxX - w * 0.02, y: barY + t2 * 0.35, fontSize: t2, fontWeight: 600,
      fill: '#C9CFDD', textAnchor: 'end',
    }, statBits.join('   ·   ')),
    ...(bar ? [
      ...[0, 1, 2, 3].map((i) => createElement('rect', {
        key: `sb${i}`,
        x: minX + w * 0.02 + (bar.worldPx / 4) * i,
        y: barY - t2 * 0.42,
        width: bar.worldPx / 4,
        height: t2 * 0.5,
        fill: i % 2 === 0 ? '#D9B45B' : '#232733',
        stroke: '#D9B45B', strokeWidth: w * 0.0006,
      })),
      createElement('text', {
        key: 'sbl',
        x: minX + w * 0.02 + bar.worldPx + w * 0.012,
        y: barY + t2 * 0.28, fontSize: t2 * 0.95, fontWeight: 650, fill: '#C9CFDD',
      }, bar.label),
    ] : []),
  )

  const svg = renderToStaticMarkup(
    createElement(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', width: outW, height: outH, viewBox: `${minX} ${minY} ${w} ${h}` },
      createElement('style', null,
        `@font-face{font-family:'Inter Variable';src:url(${interWoff2}) format('woff2-variations');font-weight:100 900;font-style:normal;}`),
      createElement('rect', { x: minX, y: minY, width: w, height: h, fill: '#0B0C10' }),
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
