import { useStore } from './store'
import { importRaster } from './importers/raster'
import { openPdf, renderPdfPage } from './importers/pdf'
import { importDxf } from './importers/dxf'
import { generateDemoPlan } from './importers/demo'
import { parseProject } from './importers/project'
import { requestFit } from './canvas/fit'
import { formatScale } from './format'

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
      const { dataUrl, w, h } = await renderPdfPage(1)
      s.replaceBg(
        { kind: 'raster', name, dataUrl, w, h, ...freshBgDefaults(), pdfPages: pages, pdfPage: 1 },
        null, null,
      )
      requestFit()
      s.toast(pages > 1 ? `PDF imported — page 1 of ${pages} (switch in Background panel)` : 'PDF imported', 'ok')
      afterImportGuide()
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

export async function importFromUrl(url: string, name: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch ${name}`)
  const blob = await res.blob()
  const file = new File([blob], name, { type: blob.type })
  await importFiles([file])
}
