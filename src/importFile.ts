import { useStore } from './store'
import { newProjectId } from './db'
import { importRaster } from './importers/raster'
import { detectPdfScaleRatio, openPdf, renderPdfPage } from './importers/pdf'
import { importDxf } from './importers/dxf'
import { generateDemoPlan } from './importers/demo'
import { parseProject } from './importers/project'
import { requestFit } from './canvas/fit'
import { formatLen, formatScale } from './format'

function freshBgDefaults() {
  return { opacity: 1, grayscale: false, invert: false }
}

/** Returns true only when a file actually landed — callers chaining follow-up steps must check. */
export async function importFiles(files: FileList | File[] | Blob[], opts?: { force?: boolean; nameHint?: string }): Promise<boolean> {
  const all = Array.from(files as ArrayLike<File>)
  const file = all[0]
  if (!file) return false
  const s = useStore.getState()
  const name = (file as File).name ?? opts?.nameHint ?? 'imported'
  const ext = name.toLowerCase().split('.').pop() ?? ''
  // opening a project swaps the whole workspace (the lock travels with it) — everything else edits this plan
  const isProject = ext === 'vastu' || (ext === 'json' && name.includes('.vastu'))
  if (s.locked && !isProject) {
    s.toast('Plan is locked — tap the padlock to edit', 'warn')
    return false
  }

  try {
    if (ext === 'dwg') {
      s.setDwgNotice(true)
      return false
    }
    // a traced outline, markers and drawings are real work — never let a stray paste or mis-tap wipe them silently
    if ((s.pts.length >= 3 || s.markers.length > 0 || s.strokes.length > 0 || s.roomShapes.length > 0) && !opts?.force) {
      s.toast(`Importing “${name}” replaces the current plan, outline, scale, markers and drawings`, 'warn', 'Replace', () => {
        void importFiles(all, { force: true })
      })
      return false
    }
    if (all.length > 1) {
      s.toast(`One file at a time — importing “${name}”`, 'info')
    }
    if (isProject) {
      const text = await (file as File).text()
      const p = parseProject(text)
      s.loadProject(p)
      // a file open becomes its own library entry — never autosave over the previously open project's record
      s.setProjectMeta({ id: newProjectId(), name: name.replace(/\.[^.]+$/, '') })
      requestFit()
      s.toast('Project restored', 'ok')
      return true
    }
    if (ext === 'pdf' || file.type === 'application/pdf') {
      s.setBusy('Rendering PDF…')
      const data = await file.arrayBuffer()
      const pages = await openPdf(data)
      const { dataUrl, w, h, pxPerPt } = await renderPdfPage(1)
      s.replaceBg(
        { kind: 'raster', name, dataUrl, w, h, ...freshBgDefaults(), pdfPages: pages, pdfPage: 1 },
        null, null,
      )
      requestFit()
      s.toast(pages > 1 ? `PDF imported — page 1 of ${pages} (switch in Background panel)` : 'PDF imported', 'ok')
      afterImportGuide()
      // the drawing often states its own scale — offer it, never apply silently
      const ratio = await detectPdfScaleRatio(1)
      if (ratio) {
        const mpp = (ratio * 0.0254) / 72 / pxPerPt
        const st = useStore.getState()
        // the offer outlives the toast — the guide and calibrate bar keep it available
        st.setScaleSuggestion({ metersPerPx: mpp, label: `printed 1 : ${ratio}`, source: 'pdf' })
        st.toast(
          `Drawing states 1 : ${ratio} — that makes it ${formatLen(w * mpp, st.unit)} wide`,
          'info', 'Apply scale',
          () => {
            const s2 = useStore.getState()
            s2.setMetersPerPx(mpp, 'pdf')
            s2.toast(`Scale set from the printed 1 : ${ratio}`, 'ok')
            if (s2.pts.length === 0) s2.setTool('trace')
          },
        )
      }
      return true
    }
    if (ext === 'dxf') {
      s.setBusy('Parsing DXF…')
      const text = await (file as File).text()
      const dxf = importDxf(text) // validate before storing
      s.replaceBg(
        { kind: 'dxf', name, dxfText: text, w: dxf.w, h: dxf.h, ...freshBgDefaults() },
        dxf.metersPerPx, dxf.metersPerPx ? 'dxf' : null,
      )
      requestFit()
      s.toast(
        dxf.metersPerPx
          ? `DXF imported — scale read from drawing units (${formatScale(dxf.metersPerPx, s.unit)})`
          : 'DXF imported — set the scale next',
        'ok',
      )
      afterImportGuide()
      if (!dxf.metersPerPx) {
        // no $INSUNITS — offer the most plausible unit, sized so the user can sanity-check
        const extU = dxf.unitsMaxDim
        let unitM = 0, unitName = ''
        if (extU >= 3000 && extU <= 400000) { unitM = 0.001; unitName = 'millimetres' }
        else if (extU >= 300) { unitM = 0.01; unitName = 'centimetres' }
        else if (extU >= 3) { unitM = 1; unitName = 'metres' }
        if (unitM > 0) {
          const mpp = (unitM * extU) / Math.max(dxf.w, dxf.h)
          const widthM = dxf.w * mpp
          if (widthM >= 3 && widthM <= 1000) {
            const st = useStore.getState()
            st.setScaleSuggestion({ metersPerPx: mpp, label: `read as ${unitName}`, source: 'dxf' })
            st.toast(
              `No units in the DXF — read as ${unitName} it is ${formatLen(widthM, st.unit)} wide`,
              'info', 'Apply scale',
              () => {
                const s2 = useStore.getState()
                s2.setMetersPerPx(mpp, 'dxf')
                s2.toast('Scale applied — recalibrate any time if it looks off', 'ok')
                if (s2.pts.length === 0) s2.setTool('trace')
              },
            )
          }
        }
      }
      return true
    }
    if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'heic', 'heif'].includes(ext)) {
      s.setBusy('Loading image…')
      const { dataUrl, w, h } = await importRaster(file)
      s.replaceBg({ kind: 'raster', name, dataUrl, w, h, ...freshBgDefaults() }, null, null)
      requestFit()
      s.toast('Image imported', 'ok')
      afterImportGuide()
      return true
    }
    s.toast(`Unsupported file type: .${ext}`, 'warn')
    return false
  } catch (err) {
    console.error(err)
    // Chromium has no HEIC decode — name the real problem instead of the generic decode error
    if (['heic', 'heif'].includes(ext) || /hei[cf]/.test(file.type)) {
      s.toast('This looks like an iPhone HEIC photo, which this device cannot decode — share or export it as JPEG and import that', 'warn')
    } else {
      s.toast(err instanceof Error ? err.message : 'Import failed', 'warn')
    }
    return false
  } finally {
    useStore.getState().setBusy(null)
  }
}

/** After a plan lands: guide the user to the right next step. */
function afterImportGuide() {
  const s = useStore.getState()
  if (!s.metersPerPx) s.setTool('calibrate')
  else if (s.pts.length === 0) s.setTool('trace')
}

export function loadDemo() {
  const s = useStore.getState()
  const demo = generateDemoPlan()
  s.replaceBg(
    { kind: 'raster', name: 'Sample residence.png', dataUrl: demo.dataUrl, w: demo.w, h: demo.h, ...freshBgDefaults() },
    demo.metersPerPx, 'demo',
  )
  s.setTool('trace')
  requestFit()
  s.toast('Sample plan loaded — scale preset. Tap corners to trace the boundary', 'ok')
}

/**
 * A blank sheet to draw a plan from scratch — nothing on it but a quiet
 * checkerboard, one square = 1 m (2000×1500 px at 1 px ≈ 1 cm). Lengths are
 * real from the first stroke; Recalibrate changes the scale anytime.
 */
export function startBlank() {
  const w = 2000, h = 1500
  const cell = 100
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#FBFAF6'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#F1EFE7'
  for (let gy = 0; gy < h / cell; gy++) {
    for (let gx = 0; gx < w / cell; gx++) {
      if ((gx + gy) % 2 === 1) ctx.fillRect(gx * cell, gy * cell, cell, cell)
    }
  }
  const s = useStore.getState()
  s.replaceBg(
    { kind: 'raster', name: 'Blank sheet.png', dataUrl: c.toDataURL('image/png'), w, h, ...freshBgDefaults() },
    0.01, 'manual',
  )
  s.setNorth(0, 'manual')
  requestFit()
  s.setTool('trace')
  s.toast('Blank sheet — each square is 1 m. Trace, draw and measure from the first stroke (Recalibrate to change scale)', 'ok')
}

/** A screenshot from Google/Apple Maps: north is up by convention; the scale bar calibrates it. */
export async function importMapsScreenshot(file: File, opts?: { force?: boolean }) {
  const s0 = useStore.getState()
  // the replace-confirm lives here, not in importFiles, so an accepted Replace re-runs THIS path
  // and keeps the north-up + scale-bar guidance (locked plans fall through to importFiles' refusal)
  if (!s0.locked && (s0.pts.length >= 3 || s0.markers.length > 0 || s0.strokes.length > 0 || s0.roomShapes.length > 0) && !opts?.force) {
    s0.toast(`Importing “${file.name}” replaces the current plan, outline, scale, markers and drawings`, 'warn', 'Replace', () => {
      void importMapsScreenshot(file, { force: true })
    })
    return
  }
  const ok = await importFiles([file], opts)
  if (!ok) return
  const s = useStore.getState()
  if (s.bg.kind === 'raster') {
    s.setNorth(0, 'manual')
    s.setBgHint('map-screenshot') // the calibrate hint walks the scale-bar steps
    s.setTool('calibrate')
    s.toast('North assumed straight up — now tap BOTH ENDS of the screenshot’s scale bar, then enter its printed distance', 'info')
  }
}

export async function importFromUrl(url: string, name: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch ${name}`)
  const blob = await res.blob()
  const file = new File([blob], name, { type: blob.type })
  await importFiles([file])
}
