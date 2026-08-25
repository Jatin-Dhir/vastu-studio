import { create } from 'zustand'
import { splitBulge } from './geometry'
import type { BgState, CompassState, Marker, MarkerKind, NorthSource, Pt, ProjectFile, ReportMeta, RoomShape, RoomShapeKind, ScaleSource, Stroke, TextNote, Tool, Unit, ViewState } from './types'

export interface Toast {
  id: number
  msg: string
  kind: 'ok' | 'warn' | 'info'
  actionLabel?: string
  onAction?: () => void
}

interface Snapshot { pts: Pt[]; closed: boolean; bulges: number[]; markers: Marker[]; strokes: Stroke[]; roomShapes: RoomShape[]; texts?: TextNote[]; compass?: CompassState }

export type ThemeMode = 'ink' | 'paper'
export type AccentId = 'gold' | 'teal' | 'rose' | 'sage'
const THEME_KEY = 'vastu-studio.theme.v1'
function loadThemePrefs(): { theme: ThemeMode; accent: AccentId; angleSnap: boolean; showEdgeLabels: boolean } {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw) return { theme: 'ink', accent: 'gold', angleSnap: true, showEdgeLabels: true, ...JSON.parse(raw) }
  } catch { /* private mode or corrupt value */ }
  return { theme: 'ink', accent: 'gold', angleSnap: true, showEdgeLabels: true }
}

export interface VastuStore {
  bg: BgState
  metersPerPx: number | null
  scaleSource: ScaleSource
  unit: Unit
  pts: Pt[]
  bulges: number[]
  closed: boolean
  centerOverride: Pt | null
  northDeg: number
  northSource: NorthSource
  compass: CompassState
  tool: Tool
  view: ViewState
  calA: Pt | null
  calB: Pt | null
  northA: Pt | null
  sheetPos: 'peek' | 'half' | 'full'
  calDialogOpen: boolean
  angleSnap: boolean
  showEdgeLabels: boolean
  locked: boolean
  selectedVertex: number | null
  selectedEdge: number | null
  markers: Marker[]
  selectedMarker: string | null
  markerKind: MarkerKind
  strokes: Stroke[]
  selectedStroke: string | null
  drawMode: 'pen' | 'line' | 'arrow' | 'text' | 'erase'
  penColor: string
  lineColor: string
  drawWidth: number
  addStroke: (s: Stroke) => void
  deleteStroke: (id: string) => void
  clearStrokes: () => void
  setSelectedStroke: (id: string | null) => void
  setDrawMode: (m: 'pen' | 'line' | 'arrow' | 'text' | 'erase') => void
  setDrawColor: (c: string) => void
  setDrawWidth: (w: number) => void
  texts: TextNote[]
  selectedText: string | null
  textEditing: boolean
  addText: (p: Pt, color: string, size: number) => string
  updateText: (id: string, patch: Partial<Omit<TextNote, 'id'>>) => void
  moveText: (id: string, p: Pt) => void
  deleteText: (id: string) => void
  setSelectedText: (id: string | null) => void
  setTextEditing: (on: boolean) => void
  /** erase-tool sweep — strokes/notes vanish live; the CALLER pushes history once per gesture */
  eraseHits: (strokeIds: string[], textIds: string[]) => void
  /** in-progress free-traced room corners (Room tool, trace mode) */
  roomDraft: Pt[] | null
  setRoomDraft: (pts: Pt[] | null) => void
  closeRoomDraft: () => void
  report: ReportMeta
  reportOpen: boolean
  /** the report has been opened for THIS plan — the guide's last step keys off it */
  reportOpened: boolean
  projectsOpen: boolean
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void
  /** TopBar's sheets live here (not component state) so the Android back button can peel them */
  moreOpen: boolean
  clearOpen: boolean
  appearanceOpen: boolean
  setMoreOpen: (open: boolean) => void
  setClearOpen: (open: boolean) => void
  setAppearanceOpen: (open: boolean) => void
  currentProjectId: string | null
  projectName: string
  setProjectMeta: (meta: { id: string | null; name?: string }) => void
  mapOpen: boolean
  dwgNotice: boolean
  busy: string | null
  /** a scale read from the import itself (printed 1:N, DXF units, map capture) — offered until used or replaced */
  scaleSuggestion: { metersPerPx: number; label: string; source: 'pdf' | 'dxf' } | null
  setScaleSuggestion: (s: { metersPerPx: number; label: string; source: 'pdf' | 'dxf' } | null) => void
  /** the user chose to work unscaled for now — the guide moves on */
  scaleSkipped: boolean
  setScaleSkipped: (on: boolean) => void
  /** which import produced the current background — steers the calibrate hint */
  bgHint: 'map-screenshot' | null
  setBgHint: (h: 'map-screenshot' | null) => void
  theme: ThemeMode
  accent: AccentId
  setTheme: (t: ThemeMode) => void
  setAccent: (a: AccentId) => void
  /** remove just the background image — keeps the traced outline, scale and everything else */
  clearBackground: () => void
  /** remove all room/door/object markers — keeps the outline and everything else */
  clearMarkers: () => void
  toasts: Toast[]
  undoStack: Snapshot[]
  redoStack: Snapshot[]

  setBg: (bg: Partial<BgState>) => void
  replaceBg: (bg: BgState, metersPerPx: number | null, source: ScaleSource) => void
  setTool: (t: Tool) => void
  setView: (v: ViewState) => void
  setUnit: (u: Unit) => void
  setMetersPerPx: (m: number | null, source: ScaleSource) => void
  addPoint: (p: Pt) => void
  movePoint: (i: number, p: Pt) => void
  insertPoint: (i: number, p: Pt) => void
  deletePoint: (i: number) => void
  popPoint: () => void
  setBulge: (i: number, b: number) => void
  insertPointOnEdge: (edge: number, p: Pt, t: number) => void
  pushHistory: () => void
  highlightZone: number | null
  setHighlightZone: (i: number | null) => void
  closePolygon: () => void
  reopenPolygon: () => void
  clearOutline: () => void
  setCenterOverride: (p: Pt | null) => void
  setNorth: (deg: number, source?: NorthSource) => void
  setCompass: (c: Partial<CompassState>) => void
  setCal: (a: Pt | null, b: Pt | null) => void
  setNorthA: (p: Pt | null) => void
  setSheetPos: (pos: 'peek' | 'half' | 'full') => void
  setCalDialogOpen: (open: boolean) => void
  setAngleSnap: (on: boolean) => void
  setShowEdgeLabels: (on: boolean) => void
  setLocked: (on: boolean) => void
  setSelection: (sel: { vertex?: number | null; edge?: number | null }) => void
  addMarker: (p: Pt) => string
  moveMarker: (id: string, p: Pt) => void
  updateMarker: (id: string, patch: Partial<Omit<Marker, 'id'>>) => void
  deleteMarker: (id: string) => void
  setSelectedMarker: (id: string | null) => void
  setMarkerKind: (k: MarkerKind) => void
  markerEditing: boolean
  setMarkerEditing: (on: boolean) => void
  roomShapes: RoomShape[]
  selectedRoomShape: string | null
  roomShapeKind: MarkerKind
  roomDrawMode: RoomShapeKind
  roomShapeEditing: boolean
  addRoomShape: (shape: RoomShapeKind, pts: Pt[]) => string
  updateRoomShapePts: (id: string, pts: Pt[]) => void
  updateRoomShape: (id: string, patch: Partial<Omit<RoomShape, 'id'>>) => void
  deleteRoomShape: (id: string) => void
  clearRoomShapes: () => void
  setSelectedRoomShape: (id: string | null) => void
  setRoomShapeKind: (k: MarkerKind) => void
  setRoomDrawMode: (m: RoomShapeKind) => void
  setRoomShapeEditing: (on: boolean) => void
  setReport: (patch: Partial<ReportMeta>) => void
  setReportOpen: (open: boolean) => void
  setProjectsOpen: (open: boolean) => void
  setMapOpen: (open: boolean) => void
  setDwgNotice: (open: boolean) => void
  setBusy: (msg: string | null) => void
  toast: (msg: string, kind?: Toast['kind'], actionLabel?: string, onAction?: () => void) => void
  dismissToast: (id: number) => void
  undo: () => void
  redo: () => void
  loadProject: (p: ProjectFile) => void
}

export const DEFAULT_COMPASS: CompassState = {
  id: 'none',
  scalePct: 100,
  opacity: 0.95,
  fillPct: 26,
  clip: true,
  labels: true,
  degreeRing: true,
  brahmasthan: true,
  brahmaPct: 100,
  devtas: true,
  customRotDeg: 0,
}

const DEFAULT_BG: BgState = { kind: 'none', w: 0, h: 0, opacity: 1, grayscale: false, invert: false }

let toastSeq = 1

export const useStore = create<VastuStore>()((set, get) => {
  // compass rides along only for the actions that mutate it (closePolygon) — a blanket capture
  // would make unrelated undos revert panel tweaks, since setCompass never pushes history
  const push = (extra?: { compass: CompassState }) => {
    const { pts, closed, bulges, markers, strokes, roomShapes, texts, undoStack } = get()
    const stack = [...undoStack, { pts, closed, bulges, markers, strokes, roomShapes, texts, ...extra }]
    if (stack.length > 100) stack.shift()
    set({ undoStack: stack, redoStack: [] })
  }

  const savePrefs = () => {
    const { theme, accent, angleSnap, showEdgeLabels } = get()
    try { localStorage.setItem(THEME_KEY, JSON.stringify({ theme, accent, angleSnap, showEdgeLabels })) } catch { /* private mode */ }
  }

  return {
    bg: DEFAULT_BG,
    metersPerPx: null,
    scaleSource: null,
    unit: 'ft',
    pts: [],
    bulges: [],
    closed: false,
    centerOverride: null,
    northDeg: 0,
    northSource: null,
    compass: { ...DEFAULT_COMPASS },
    tool: 'select',
    view: { tx: 0, ty: 0, k: 1, rot: 0 },
    calA: null,
    calB: null,
    northA: null,
    sheetPos: (typeof window === 'undefined' || window.innerWidth > 760 ? 'full' : 'peek') as 'peek' | 'half' | 'full',
    calDialogOpen: false,
    locked: false,
    selectedVertex: null,
    selectedEdge: null,
    markers: [],
    selectedMarker: null,
    markerKind: 'entrance',
    strokes: [],
    selectedStroke: null,
    drawMode: 'pen',
    penColor: '#F26B57',
    lineColor: '#5B8DEF',
    drawWidth: 2,
    addStroke: (stroke) => { push(); set((s) => ({ strokes: [...s.strokes, stroke] })) },
    deleteStroke: (id) => {
      push()
      set((s) => ({
        strokes: s.strokes.filter((x) => x.id !== id),
        selectedStroke: s.selectedStroke === id ? null : s.selectedStroke,
      }))
    },
    clearStrokes: () => { push(); set({ strokes: [], selectedStroke: null, texts: [], selectedText: null, textEditing: false }) },
    setSelectedStroke: (selectedStroke) =>
      set({ selectedStroke, ...(selectedStroke === null ? {} : { selectedMarker: null, markerEditing: false, selectedRoomShape: null, roomShapeEditing: false, selectedText: null, textEditing: false }) }),
    setDrawMode: (drawMode) => set({ drawMode }),
    setDrawColor: (c) => set((s) => (s.drawMode === 'line' || s.drawMode === 'arrow' ? { lineColor: c } : { penColor: c })),
    setDrawWidth: (drawWidth) => set({ drawWidth }),
    texts: [],
    selectedText: null,
    textEditing: false,
    addText: (p, color, size) => {
      push()
      const id = (crypto as any).randomUUID ? crypto.randomUUID() : `tx${Math.floor(performance.now() * 1000)}`
      set((s) => ({
        texts: [...s.texts, { id, p, text: '', color, size }],
        selectedText: id,
        selectedMarker: null, markerEditing: false, selectedStroke: null, selectedRoomShape: null, roomShapeEditing: false,
      }))
      return id
    },
    updateText: (id, patch) => { push(); set((s) => ({ texts: s.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) })) },
    moveText: (id, p) => set((s) => ({ texts: s.texts.map((t) => (t.id === id ? { ...t, p } : t)) })),
    deleteText: (id) => {
      push()
      set((s) => ({ texts: s.texts.filter((t) => t.id !== id), selectedText: s.selectedText === id ? null : s.selectedText, textEditing: false }))
    },
    setSelectedText: (selectedText) =>
      set({ selectedText, ...(selectedText === null ? { textEditing: false } : { selectedMarker: null, markerEditing: false, selectedStroke: null, selectedRoomShape: null, roomShapeEditing: false }) }),
    setTextEditing: (textEditing) => set({ textEditing }),
    eraseHits: (strokeIds, textIds) =>
      set((s) => ({
        strokes: strokeIds.length ? s.strokes.filter((x) => !strokeIds.includes(x.id)) : s.strokes,
        texts: textIds.length ? s.texts.filter((t) => !textIds.includes(t.id)) : s.texts,
      })),
    roomDraft: null,
    setRoomDraft: (roomDraft) => set({ roomDraft }),
    closeRoomDraft: () => {
      const draft = get().roomDraft
      if (!draft || draft.length < 3) return
      get().addRoomShape('polygon', draft)
      set({ roomDraft: null })
    },
    report: { client: '', address: '', practitioner: '', notes: '' },
    reportOpen: false,
    reportOpened: false,
    projectsOpen: false,
    shortcutsOpen: false,
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    moreOpen: false,
    clearOpen: false,
    appearanceOpen: false,
    setMoreOpen: (moreOpen) => set({ moreOpen }),
    setClearOpen: (clearOpen) => set({ clearOpen }),
    setAppearanceOpen: (appearanceOpen) => set({ appearanceOpen }),
    currentProjectId: null,
    projectName: 'Untitled plan',
    setProjectMeta: (meta) =>
      set((s) => ({ currentProjectId: meta.id, projectName: meta.name ?? s.projectName })),
    mapOpen: false,
    dwgNotice: false,
    busy: null,
    scaleSuggestion: null,
    setScaleSuggestion: (scaleSuggestion) => set({ scaleSuggestion }),
    scaleSkipped: false,
    setScaleSkipped: (scaleSkipped) => set({ scaleSkipped }),
    bgHint: null,
    setBgHint: (bgHint) => set({ bgHint }),
    ...loadThemePrefs(),
    setTheme: (theme) => { set({ theme }); savePrefs() },
    setAccent: (accent) => { set({ accent }); savePrefs() },
    clearBackground: () => {
      push()
      set((s) => ({ bg: { ...s.bg, kind: 'none' as const, dataUrl: undefined, dxfText: undefined } }))
    },
    clearMarkers: () => { push(); set({ markers: [], selectedMarker: null }) },
    toasts: [],
    undoStack: [],
    redoStack: [],

    setBg: (bg) => set((s) => ({ bg: { ...s.bg, ...bg } })),
    // a new background defines a new pixel space — the old scale and outline never apply to it
    replaceBg: (bg, metersPerPx, source) => {
      push()
      set(() => ({
        bg,
        metersPerPx,
        scaleSource: metersPerPx != null ? source : null,
        pts: [],
        bulges: [],
        closed: false,
        centerOverride: null,
        markers: [],
        selectedMarker: null,
        strokes: [],
        selectedStroke: null,
        roomShapes: [],
        selectedRoomShape: null,
        texts: [],
        selectedText: null,
        roomDraft: null,
        calA: null,
        calB: null,
        northDeg: 0,
        northSource: null,
        scaleSuggestion: null,
        scaleSkipped: false,
        bgHint: null,
        reportOpened: false,
      }))
    },
    // entering a pick-two-points tool always starts a fresh pair
    setTool: (tool) => {
      if (get().locked && tool !== 'select') {
        get().toast('Plan is locked — tap the padlock to edit', 'warn')
        return
      }
      set({
        tool,
        ...(tool !== 'calibrate' ? { calA: null, calB: null } : {}),
        northA: null,
        selectedVertex: null,
        selectedEdge: null,
        selectedRoomShape: null,
        roomShapeEditing: false,
        selectedText: null,
        textEditing: false,
        ...(tool !== 'room' ? { roomDraft: null } : {}),
      })
    },
    setView: (view) => set({ view }),
    setUnit: (unit) => set({ unit }),
    setMetersPerPx: (metersPerPx, scaleSource) =>
      set({ metersPerPx, scaleSource, ...(metersPerPx != null ? { scaleSuggestion: null } : {}) }),

    addPoint: (p) => { push(); set((s) => ({ pts: [...s.pts, p], bulges: [...s.bulges, 0] })) },
    movePoint: (i, p) =>
      set((s) => ({ pts: s.pts.map((q, j) => (j === i ? p : q)) })),
    insertPoint: (i, p) => {
      push()
      set((s) => {
        const bulges = [...s.bulges]
        if (i > 0) bulges[i - 1] = 0 // the split edge becomes two straight halves
        bulges.splice(i, 0, 0)
        return { pts: [...s.pts.slice(0, i), p, ...s.pts.slice(i)], bulges }
      })
    },
    deletePoint: (i) => {
      push()
      set((s) => {
        const pts = s.pts.filter((_, j) => j !== i)
        const bulges = s.bulges.filter((_, j) => j !== i)
        if (bulges.length > 0) bulges[(i - 1 + bulges.length) % bulges.length] = 0 // merged edge straightens
        return { pts, bulges, closed: pts.length >= 3 ? s.closed : false }
      })
    },
    popPoint: () => {
      const { pts, closed } = get()
      if (closed || pts.length === 0) return
      push()
      set((s) => ({ pts: s.pts.slice(0, -1), bulges: s.bulges.slice(0, -1) }))
    },
    setBulge: (i, b) =>
      set((s) => ({ bulges: s.bulges.map((q, j) => (j === i ? b : q)) })),
    insertPointOnEdge: (edge, p, t) => {
      push()
      set((s) => {
        const [b1, b2] = splitBulge(s.bulges[edge] ?? 0, t)
        const bulges = [...s.bulges]
        bulges[edge] = b1
        bulges.splice(edge + 1, 0, b2)
        return { pts: [...s.pts.slice(0, edge + 1), p, ...s.pts.slice(edge + 1)], bulges }
      })
    },
    pushHistory: () => push(),
    highlightZone: null,
    setHighlightZone: (highlightZone) => set({ highlightZone }),
    closePolygon: () => {
      const s = get()
      if (s.pts.length < 3 || s.closed) return
      push({ compass: s.compass })
      set({
        closed: true,
        tool: 'select',
        // closing re-asserts the automatic compass ratio for the new boundary
        compass: {
          ...s.compass,
          id: s.compass.id === 'none' ? 'zones16' : s.compass.id,
          scalePct: 100,
        },
      })
      get().toast('Outline closed — centre located', 'ok')
    },
    reopenPolygon: () => { push(); set({ closed: false }) },
    clearOutline: () => { push(); set({ pts: [], bulges: [], closed: false, centerOverride: null, highlightZone: null }) },
    setCenterOverride: (centerOverride) => set({ centerOverride }),
    setNorth: (northDeg, source = 'manual') =>
      set({ northDeg: ((northDeg % 360) + 360) % 360, northSource: source }),
    setCompass: (c) => set((s) => ({ compass: { ...s.compass, ...c } })),
    setCal: (calA, calB) => set({ calA, calB }),
    setNorthA: (northA) => set({ northA }),
    setSheetPos: (sheetPos) => set({ sheetPos }),
    setCalDialogOpen: (calDialogOpen) => set({ calDialogOpen }),
    setAngleSnap: (angleSnap) => { set({ angleSnap }); savePrefs() },
    setShowEdgeLabels: (showEdgeLabels) => { set({ showEdgeLabels }); savePrefs() },
    setLocked: (locked) => {
      set({ locked, selectedVertex: null, selectedEdge: null, ...(locked ? { tool: 'select' as const, calA: null, calB: null, northA: null } : {}) })
      get().toast(locked ? 'Plan locked — analysis only. Nothing can shift by accident.' : 'Plan unlocked — editing enabled', locked ? 'ok' : 'info')
    },
    setSelection: (sel) =>
      set((s) => ({
        selectedVertex: sel.vertex !== undefined ? sel.vertex : s.selectedVertex,
        selectedEdge: sel.edge !== undefined ? sel.edge : s.selectedEdge,
      })),
    addMarker: (p) => {
      push()
      const s = get()
      const meta = s.markerKind
      const id = (crypto as any).randomUUID ? crypto.randomUUID() : `mk${Math.floor(performance.now() * 1000)}`
      const count = s.markers.filter((m) => m.kind === meta).length
      const base = meta.charAt(0).toUpperCase() + meta.slice(1)
      const marker: Marker = { id, kind: meta, label: count > 0 ? `${base} ${count + 1}` : base, p }
      set({ markers: [...s.markers, marker], selectedMarker: id, selectedStroke: null, selectedRoomShape: null, roomShapeEditing: false, selectedText: null, textEditing: false })
      return id
    },
    moveMarker: (id, p) =>
      set((s) => ({ markers: s.markers.map((m) => (m.id === id ? { ...m, p } : m)) })),
    updateMarker: (id, patch) => {
      push()
      set((s) => ({ markers: s.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
    },
    deleteMarker: (id) => {
      push()
      set((s) => ({
        markers: s.markers.filter((m) => m.id !== id),
        selectedMarker: s.selectedMarker === id ? null : s.selectedMarker,
      }))
    },
    // selections are mutually exclusive — on phones all the chip bars share one fixed slot
    setSelectedMarker: (selectedMarker) =>
      set({ selectedMarker, ...(selectedMarker === null ? { markerEditing: false } : { selectedStroke: null, selectedRoomShape: null, roomShapeEditing: false, selectedText: null, textEditing: false }) }),
    setMarkerKind: (markerKind) => set({ markerKind }),
    markerEditing: false,
    setMarkerEditing: (markerEditing) => set({ markerEditing }),

    roomShapes: [],
    selectedRoomShape: null,
    roomShapeKind: 'bed',
    roomDrawMode: 'rect',
    roomShapeEditing: false,
    addRoomShape: (shape, pts) => {
      push()
      const s = get()
      const kind = s.roomShapeKind
      const id = (crypto as any).randomUUID ? crypto.randomUUID() : `rm${Math.floor(performance.now() * 1000)}`
      const count = s.roomShapes.filter((r) => r.kind === kind).length
      const base = kind.charAt(0).toUpperCase() + kind.slice(1)
      const room: RoomShape = { id, kind, shape, label: count > 0 ? `${base} ${count + 1}` : base, pts }
      set({ roomShapes: [...s.roomShapes, room], selectedRoomShape: id, selectedMarker: null, markerEditing: false, selectedStroke: null, selectedText: null, textEditing: false })
      return id
    },
    updateRoomShapePts: (id, pts) =>
      set((s) => ({ roomShapes: s.roomShapes.map((r) => (r.id === id ? { ...r, pts } : r)) })),
    updateRoomShape: (id, patch) => {
      push()
      set((s) => ({ roomShapes: s.roomShapes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
    },
    deleteRoomShape: (id) => {
      push()
      set((s) => ({
        roomShapes: s.roomShapes.filter((r) => r.id !== id),
        selectedRoomShape: s.selectedRoomShape === id ? null : s.selectedRoomShape,
      }))
    },
    clearRoomShapes: () => { push(); set({ roomShapes: [], selectedRoomShape: null }) },
    setSelectedRoomShape: (selectedRoomShape) =>
      set({ selectedRoomShape, ...(selectedRoomShape === null ? { roomShapeEditing: false } : { selectedMarker: null, markerEditing: false, selectedStroke: null, selectedText: null, textEditing: false }) }),
    setRoomShapeKind: (roomShapeKind) => set({ roomShapeKind }),
    setRoomDrawMode: (roomDrawMode) => set({ roomDrawMode }),
    setRoomShapeEditing: (roomShapeEditing) => set({ roomShapeEditing }),
    setReport: (patch) => set((s) => ({ report: { ...s.report, ...patch } })),
    setReportOpen: (reportOpen) => set((s) => ({ reportOpen, reportOpened: s.reportOpened || reportOpen })),
    setProjectsOpen: (projectsOpen) => set({ projectsOpen }),
    setMapOpen: (mapOpen) => set({ mapOpen }),
    setDwgNotice: (dwgNotice) => set({ dwgNotice }),
    setBusy: (busy) => set({ busy }),

    toast: (msg, kind = 'info', actionLabel, onAction) => {
      const id = toastSeq++
      // identical repeats replace instead of stacking
      set((s) => ({ toasts: [...s.toasts.filter((t) => t.msg !== msg).slice(-3), { id, msg, kind, actionLabel, onAction }] }))
      window.setTimeout(() => get().dismissToast(id), actionLabel ? 9000 : 4200)
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    undo: () => {
      const { undoStack, pts, closed, bulges, markers, strokes, roomShapes, texts } = get()
      if (undoStack.length === 0) return
      if (get().locked) { get().toast('Plan is locked — tap the padlock to edit', 'warn'); return }
      const prev = undoStack[undoStack.length - 1]
      set((s) => ({
        pts: prev.pts,
        closed: prev.closed,
        bulges: prev.bulges,
        markers: prev.markers,
        strokes: prev.strokes ?? s.strokes,
        roomShapes: prev.roomShapes ?? s.roomShapes,
        texts: prev.texts ?? s.texts,
        ...(prev.compass ? { compass: prev.compass } : {}),
        selectedMarker: null,
        selectedStroke: null,
        selectedRoomShape: null,
        selectedText: null,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, { pts, closed, bulges, markers, strokes, roomShapes, texts, ...(prev.compass ? { compass: s.compass } : {}) }],
      }))
    },
    redo: () => {
      const { redoStack, pts, closed, bulges, markers, strokes, roomShapes, texts } = get()
      if (redoStack.length === 0) return
      if (get().locked) { get().toast('Plan is locked — tap the padlock to edit', 'warn'); return }
      const next = redoStack[redoStack.length - 1]
      set((s) => ({
        pts: next.pts,
        closed: next.closed,
        bulges: next.bulges,
        markers: next.markers,
        strokes: next.strokes ?? s.strokes,
        roomShapes: next.roomShapes ?? s.roomShapes,
        texts: next.texts ?? s.texts,
        ...(next.compass ? { compass: next.compass } : {}),
        selectedMarker: null,
        selectedStroke: null,
        selectedRoomShape: null,
        selectedText: null,
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, { pts, closed, bulges, markers, strokes, roomShapes, texts, ...(next.compass ? { compass: s.compass } : {}) }],
      }))
    },

    loadProject: (p) =>
      set({
        bg: p.bg,
        metersPerPx: p.metersPerPx,
        scaleSource: p.scaleSource,
        unit: p.unit,
        pts: p.pts,
        bulges: p.bulges && p.bulges.length === p.pts.length ? p.bulges : p.pts.map(() => 0),
        closed: p.closed,
        centerOverride: p.centerOverride,
        northDeg: p.northDeg,
        // legacy files predate northSource — a set bearing there was a deliberate manual act
        northSource: p.northSource ?? (p.northDeg ? 'manual' : null),
        compass: { ...DEFAULT_COMPASS, ...p.compass },
        locked: p.locked ?? false,
        markers: p.markers ?? [],
        selectedMarker: null,
        strokes: p.strokes ?? [],
        selectedStroke: null,
        roomShapes: p.roomShapes ?? [],
        selectedRoomShape: null,
        texts: p.texts ?? [],
        selectedText: null,
        textEditing: false,
        roomDraft: null,
        report: { client: '', address: '', practitioner: '', notes: '', ...p.report },
        selectedVertex: null,
        selectedEdge: null,
        undoStack: [],
        redoStack: [],
        calA: null,
        calB: null,
        northA: null,
        scaleSuggestion: null,
        scaleSkipped: false,
        bgHint: null,
        highlightZone: null,
        reportOpened: false,
      }),
  }
})

export function serializeProject(s: VastuStore): ProjectFile {
  return {
    app: 'vastu-studio',
    version: 1,
    bg: s.bg,
    metersPerPx: s.metersPerPx,
    scaleSource: s.scaleSource,
    unit: s.unit,
    pts: s.pts,
    bulges: s.bulges,
    closed: s.closed,
    centerOverride: s.centerOverride,
    northDeg: s.northDeg,
    northSource: s.northSource,
    compass: s.compass,
    locked: s.locked,
    markers: s.markers,
    strokes: s.strokes,
    roomShapes: s.roomShapes,
    texts: s.texts,
    report: s.report,
  }
}
