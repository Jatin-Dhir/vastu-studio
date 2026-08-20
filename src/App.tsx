import { useEffect, useRef } from 'react'
import { useStore, DEFAULT_COMPASS } from './store'
import { CanvasStage } from './canvas/CanvasStage'
import { requestFit } from './canvas/fit'
import { TopBar } from './ui/TopBar'
import { ToolRail } from './ui/ToolRail'
import { RightPanel } from './ui/RightPanel'
import { EmptyState } from './ui/EmptyState'
import { Toasts } from './ui/Toasts'
import { CalibrateDialog, DwgDialog } from './ui/Dialogs'
import { MapModal } from './ui/MapModal'
import { CloseChip, QuickBar, RotateChip, SelectionChips } from './ui/CanvasOverlays'
import { importFiles, importFromUrl, loadDemo } from './importFile'
import { autosave, clearAutosave, loadAutosave } from './importers/project'
import { formatLen, formatScale } from './format'
import type { ProjectFile } from './types'

const EMPTY_PROJECT: ProjectFile = {
  app: 'vastu-studio', version: 1,
  bg: { kind: 'none', w: 0, h: 0, opacity: 1, grayscale: false, invert: false },
  metersPerPx: null, scaleSource: null, unit: 'ft',
  pts: [], closed: false, centerOverride: null, northDeg: 0,
  compass: { ...DEFAULT_COMPASS },
}

function CalibrateBar() {
  const tool = useStore((s) => s.tool)
  const calA = useStore((s) => s.calA)
  const calB = useStore((s) => s.calB)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const unit = useStore((s) => s.unit)
  const dialogOpen = useStore((s) => s.calDialogOpen)
  if (tool !== 'calibrate' || !calA || !calB || dialogOpen) return null
  const px = Math.hypot(calB.x - calA.x, calB.y - calA.y)
  return (
    <div className="cal-bar">
      <span className="cal-bar-len">
        {px.toFixed(0)} px{metersPerPx ? ` · ${formatLen(px * metersPerPx, unit)}` : ''}
      </span>
      <button className="btn-ghost" onClick={() => useStore.getState().setCal(null, null)}>Redraw</button>
      <button className="btn-primary" onClick={() => useStore.getState().setCalDialogOpen(true)}>
        Enter length
      </button>
    </div>
  )
}

function StatusChip() {
  const k = useStore((s) => s.view.k)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const unit = useStore((s) => s.unit)
  const northDeg = useStore((s) => s.northDeg)
  const hasBg = useStore((s) => s.bg.kind !== 'none')
  if (!hasBg) return null
  return (
    <div className="status-chip">
      {Math.round(k * 100)}% · {formatScale(metersPerPx, unit)} · N {northDeg}°
    </div>
  )
}

export default function App() {
  const hasContent = useStore((s) => s.bg.kind !== 'none' || s.pts.length > 0)
  const mapOpen = useStore((s) => s.mapOpen)
  const fileRef = useRef<HTMLInputElement>(null)

  /* file picker trigger */
  useEffect(() => {
    const open = () => fileRef.current?.click()
    const reset = () => {
      clearAutosave()
      useStore.getState().loadProject(EMPTY_PROJECT)
      useStore.getState().toast('Cleared — start with a fresh import', 'ok')
    }
    window.addEventListener('vastu:open-file', open)
    window.addEventListener('vastu:reset', reset)
    return () => {
      window.removeEventListener('vastu:open-file', open)
      window.removeEventListener('vastu:reset', reset)
    }
  }, [])

  /* keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const s = useStore.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo(); else s.undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); return }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case 'v': case 'V': s.setTool('select'); break
        case 'c': case 'C': s.setTool('calibrate'); break
        case 't': case 'T': s.setTool('trace'); break
        case 'm': case 'M': s.setTool('center'); break
        case 'n': case 'N': s.setTool('north'); break
        case 'f': case 'F': requestFit(); break
        case 'Enter': if (!s.closed && s.pts.length >= 3) s.closePolygon(); break
        case 'Backspace': case 'Delete':
          if (s.tool === 'trace' && !s.closed && s.pts.length > 0) { e.preventDefault(); s.popPoint() }
          break
        case 'Escape':
          if (s.calDialogOpen) s.setCalDialogOpen(false)
          else if (s.selectedVertex != null || s.selectedEdge != null) s.setSelection({ vertex: null, edge: null })
          else if (s.tool === 'calibrate' && s.calA) s.setCal(null, null)
          else if (s.tool === 'trace' && !s.closed && s.pts.length > 0) s.popPoint()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* paste + drag-drop */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const blob = it.getAsFile()
          if (blob) {
            e.preventDefault()
            void importFiles([new File([blob], 'Pasted image.png', { type: blob.type })])
          }
          return
        }
      }
    }
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer?.files?.length) void importFiles(e.dataTransfer.files)
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  /* autosave + restore */
  useEffect(() => {
    const saved = loadAutosave()
    if (saved && (saved.bg.kind !== 'none' || saved.pts.length > 0)) {
      useStore.getState().loadProject(saved)
      setTimeout(requestFit, 120)
      useStore.getState().toast('Restored your last session', 'info', 'Start fresh', () => {
        clearAutosave()
        useStore.getState().loadProject(EMPTY_PROJECT)
      })
    }
    let timer = 0
    const unsub = useStore.subscribe((s, prev) => {
      if (
        s.pts !== prev.pts || s.bulges !== prev.bulges || s.bg !== prev.bg || s.closed !== prev.closed ||
        s.compass !== prev.compass || s.northDeg !== prev.northDeg ||
        s.metersPerPx !== prev.metersPerPx || s.centerOverride !== prev.centerOverride ||
        s.unit !== prev.unit || s.locked !== prev.locked
      ) {
        window.clearTimeout(timer)
        timer = window.setTimeout(autosave, 900)
      }
    })
    return () => { unsub(); window.clearTimeout(timer) }
  }, [])

  /* dev/test hooks */
  useEffect(() => {
    ;(window as any).vastu = { loadDemo, importFiles, importFromUrl, store: useStore, fit: requestFit }
  }, [])

  return (
    <div className="app">
      <TopBar />
      <div className="stage-wrap">
        <CanvasStage />
        <QuickBar />
        <RotateChip />
        <CloseChip />
        <SelectionChips />
        {hasContent && <RightPanel />}
        <ToolRail />
        {!hasContent && <EmptyState />}
        <CalibrateBar />
        <StatusChip />
      </div>
      <Toasts />
      <CalibrateDialog />
      <DwgDialog />
      {mapOpen && <MapModal />}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.dxf,.dwg,.vastu,.json,image/*"
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void importFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
