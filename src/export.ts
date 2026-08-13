import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import interWoff2 from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline'
import { Scene } from './canvas/Scene'
import { importDxf } from './importers/dxf'
import { centroid, circumradius, sampledPolygon } from './geometry'
import { useStore } from './store'
import { downloadBlob } from './importers/project'
import type { Pt } from './types'

export async function exportPng(): Promise<void> {
  const s = useStore.getState()
  if (s.bg.kind === 'none' && s.pts.length === 0) {
    s.toast('Nothing to export yet', 'warn')
    return
  }
  s.setBusy('Rendering export…')
  try {
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
    const w = maxX - minX, h = maxY - minY

    const k0 = Math.min(4, Math.max(0.6, 2800 / Math.max(w, h)))
    const outW = Math.round(w * k0), outH = Math.round(h * k0)

    const dxf = s.bg.kind === 'dxf' && s.bg.dxfText ? importDxf(s.bg.dxfText) : null

    const scene = createElement(Scene, {
      bg: s.bg, dxf, pts: s.pts, bulges: s.bulges, closed: s.closed, center, R,
      northDeg: s.northDeg, compass: s.compass, metersPerPx: s.metersPerPx,
      unit: s.unit, k: k0 / 1.9, showEdgeLabels: s.showEdgeLabels, idPrefix: 'exp',
    })

    const svg = renderToStaticMarkup(
      createElement(
        'svg',
        { xmlns: 'http://www.w3.org/2000/svg', width: outW, height: outH, viewBox: `${minX} ${minY} ${w} ${h}` },
        createElement('style', null,
          `@font-face{font-family:'Inter Variable';src:url(${interWoff2}) format('woff2-variations');font-weight:100 900;font-style:normal;}`),
        createElement('rect', { x: minX, y: minY, width: w, height: h, fill: '#0B0C10' }),
        scene,
      ),
    )

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
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
      const name = (s.bg.name?.replace(/\.[^.]+$/, '') || 'plan') + '-vastu.png'
      downloadBlob(png, name)
      s.toast('PNG exported', 'ok')
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (err) {
    console.error(err)
    s.toast('Export failed — see console for details', 'warn')
  } finally {
    s.setBusy(null)
  }
}
