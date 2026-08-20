import { useStore } from './store'
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

export async function importFiles(files: FileList | File[] | Blob[], nameHint?: string) {
  const file = Array.from(files as ArrayLike<File>)[0]
  if (!file) return
  const s = useStore.getState()
  const name = (file as File).name ?? nameHint ?? 'imported'
  const ext = name.toLowerCase().split('.').pop() ?? ''

  try {
    if (ext === 'dwg') {
      s.setDwgNotice(true)
      return
    }
    if (ext === 'vastu' || (ext === 'json' && name.includes('.vastu'))) {
      const text = await (file as File).text()
      const p = parseProject(text)
      s.loadProject(p)
      requestFit()
      s.toast('Project restored', 'ok')
      return
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
      return
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
      return
    }
    if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(ext)) {
      s.setBusy('Loading image…')
      const { dataUrl, w, h } = await importRaster(file)
      s.replaceBg({ kind: 'raster', name, dataUrl, w, h, ...freshBgDefaults() }, null, null)
      requestFit()
      s.toast('Image imported', 'ok')
      afterImportGuide()
      return
    }
    s.toast(`Unsupported file type: .${ext}`, 'warn')
  } catch (err) {
    console.error(err)
    s.toast(err instanceof Error ? err.message : 'Import failed', 'warn')
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

/** A screenshot from Google/Apple Maps: north is up by convention; the scale bar calibrates it. */
export async function importMapsScreenshot(file: File) {
  await importFiles([file])
  const s = useStore.getState()
  if (s.bg.kind === 'raster') {
    s.setNorth(0, 'manual')
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
