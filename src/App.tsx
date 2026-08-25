import { useEffect, useRef } from 'react'
import { useStore, DEFAULT_COMPASS } from './store'
import { CanvasStage } from './canvas/CanvasStage'
import { requestFit } from './canvas/fit'
import { isGestureActive } from './canvas/gesture'
import { TopBar } from './ui/TopBar'
import { ToolRail } from './ui/ToolRail'
import { RightPanel } from './ui/RightPanel'
import { EmptyState } from './ui/EmptyState'
import { Toasts } from './ui/Toasts'
import { CalibrateDialog, DwgDialog, LineLengthDialog, MarkerDialog, RoomShapeDialog, ShortcutsDialog, TextDialog } from './ui/Dialogs'
import { MapModal } from './ui/MapModal'
import { CloseChip, MarkerChips, QuickBar, RoomCloseChip, RoomShapeChips, RotateChip, SelectionChips, StrokeChips, TextChips } from './ui/CanvasOverlays'
import { GuideCard } from './ui/GuideCard'
import { importFiles, importFromUrl, loadDemo } from './importFile'
import { autosave, clearAutosave, loadAutosave } from './importers/project'
import { getMostRecent, newProjectId, putProject, requestPersistence } from './db'
import { ProjectsModal } from './ui/ProjectsModal'
import { ReportView } from './ui/ReportView'
import { formatLen, formatScale } from './format'
import { syncNativeChrome } from './native'
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
  const hasContent = useStore((s) => s.bg.kind !== 'none' || s.pts.length > 0 || s.markers.length > 0 || s.strokes.length > 0 || s.roomShapes.length > 0)
  const mapOpen = useStore((s) => s.mapOpen)
  const projectsOpen = useStore((s) => s.projectsOpen)
  const reportOpen = useStore((s) => s.reportOpen)
  const theme = useStore((s) => s.theme)
  const accent = useStore((s) => s.accent)
  const fileRef = useRef<HTMLInputElement>(null)

  /* appearance: theme/accent live as plain data-attributes so pure CSS drives every colour;
     OS chrome (meta theme-color, native status bar) follows the same switch */
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.accent = accent
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'paper' ? '#F3F1EA' : '#0B0C10')
    void syncNativeChrome(theme)
  }, [theme, accent])

  /* entering the phone breakpoint (rotation/resize) with the sheet fully raised
     would hide both the guide and the tool dock — drop it back to peek */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const onChange = () => {
      const s = useStore.getState()
      if (mq.matches && s.sheetPos === 'full') s.setSheetPos('peek')
    }
    onChange()
    // resize too: occluded/embedded views can swallow the mq change event
    mq.addEventListener('change', onChange)
    window.addEventListener('resize', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  /* file picker trigger */
  useEffect(() => {
    const open = () => fileRef.current?.click()
    const reset = () => {
      clearAutosave()
      const st = useStore.getState()
      st.loadProject({ ...EMPTY_PROJECT, unit: st.unit })
      st.setProjectMeta({ id: null, name: 'Untitled plan' })
      st.toast('Cleared — start with a fresh import', 'ok')
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
      // modal surfaces own the keyboard while open — each closes itself on Escape
      if (s.calDialogOpen || s.markerEditing || s.roomShapeEditing || s.textEditing || s.strokeLenEditing || s.shortcutsOpen || s.dwgNotice || s.mapOpen || s.projectsOpen || s.reportOpen) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        // a mid-drag undo would pop the entry the drag itself just pushed — wait for the release
        if (isGestureActive()) return
        if (e.shiftKey) s.redo(); else s.undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        if (!isGestureActive()) s.redo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case 'v': case 'V': s.setTool('select'); break
        case 'c': case 'C': s.setTool('calibrate'); break
        case 't': case 'T': s.setTool('trace'); break
        case 'm': case 'M': s.setTool('center'); break
        case 'n': case 'N': s.setTool('north'); break
        case 'p': case 'P': s.setTool('marker'); break
        case 'd': case 'D': s.setTool('draw'); break
        case 'r': case 'R': s.setTool('room'); break
        case 'f': case 'F': requestFit(); break
        case '?': s.setShortcutsOpen(true); break
        case 'Enter': if (!s.closed && s.pts.length >= 3) s.closePolygon(); break
        case 'Backspace': case 'Delete':
          if (s.tool === 'trace' && !s.closed && s.pts.length > 0) { e.preventDefault(); s.popPoint() }
          break
        case 'Escape':
          if (s.selectedMarker) s.setSelectedMarker(null)
          else if (s.selectedStroke) s.setSelectedStroke(null)
          else if (s.selectedRoomShape) s.setSelectedRoomShape(null)
          else if (s.selectedText) s.setSelectedText(null)
          else if (s.roomDraft) s.setRoomDraft(s.roomDraft.length > 1 ? s.roomDraft.slice(0, -1) : null)
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

  /* autosave + restore: legacy localStorage migrates into the IndexedDB library once */
  useEffect(() => {
    requestPersistence()
    const st = useStore.getState()
    const legacy = loadAutosave()
    if (legacy && (legacy.bg.kind !== 'none' || legacy.pts.length > 0)) {
      const id = newProjectId()
      const name = legacy.bg.name?.replace(/\.[^.]+$/, '') || 'Migrated plan'
      void putProject({ id, name, updatedAt: Date.now(), data: legacy }).then(() => clearAutosave())
      st.loadProject(legacy)
      st.setProjectMeta({ id, name })
      setTimeout(requestFit, 120)
      st.toast('Restored your last session', 'info', 'Start fresh', () => {
        window.dispatchEvent(new CustomEvent('vastu:reset'))
      })
    } else {
      void getMostRecent().then((rec) => {
        if (!rec) return
        const s2 = useStore.getState()
        if (s2.bg.kind !== 'none' || s2.pts.length > 0) return // user already started something
        s2.loadProject(rec.data)
        s2.setProjectMeta({ id: rec.id, name: rec.name })
        setTimeout(requestFit, 120)
        s2.toast(`Resumed “${rec.name}” — all projects live under the folder icon`, 'info', 'Start fresh', () => {
          window.dispatchEvent(new CustomEvent('vastu:reset'))
        })
      })
    }
    let timer = 0
    const unsub = useStore.subscribe((s, prev) => {
      if (
        s.pts !== prev.pts || s.bulges !== prev.bulges || s.bg !== prev.bg || s.closed !== prev.closed ||
        s.compass !== prev.compass || s.northDeg !== prev.northDeg ||
        s.metersPerPx !== prev.metersPerPx || s.centerOverride !== prev.centerOverride ||
        s.unit !== prev.unit || s.locked !== prev.locked ||
        s.markers !== prev.markers || s.strokes !== prev.strokes || s.roomShapes !== prev.roomShapes ||
        s.texts !== prev.texts || s.report !== prev.report
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
        <MarkerChips />
        <StrokeChips />
        <RoomShapeChips />
        <TextChips />
        <RoomCloseChip />
        {hasContent && <RightPanel />}
        <ToolRail />
        {!hasContent && <EmptyState />}
        <CalibrateBar />
        <StatusChip />
      </div>
      {/* fixed to the real viewport, like Toasts — .stage-wrap clips absolute children
          with overflow:hidden, which was cramping this against the dock on real phones */}
      <GuideCard />
      <Toasts />
      <CalibrateDialog />
      <MarkerDialog />
      <TextDialog />
      <LineLengthDialog />
      <RoomShapeDialog />
      <ShortcutsDialog />
      <DwgDialog />
      {mapOpen && <MapModal />}
      {projectsOpen && <ProjectsModal />}
      {reportOpen && <ReportView />}
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
