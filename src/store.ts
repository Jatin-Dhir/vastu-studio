import { create } from 'zustand'
import { splitBulge } from './geometry'
import type { BgState, CompassState, Pt, ProjectFile, ScaleSource, Tool, Unit, ViewState } from './types'

export interface Toast {
  id: number
  msg: string
  kind: 'ok' | 'warn' | 'info'
  actionLabel?: string
  onAction?: () => void
}

interface Snapshot { pts: Pt[]; closed: boolean; bulges: number[] }

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
  compass: CompassState
  tool: Tool
  view: ViewState
  calA: Pt | null
  calB: Pt | null
  northA: Pt | null
  sheetOpen: boolean
  calDialogOpen: boolean
  angleSnap: boolean
  showEdgeLabels: boolean
  locked: boolean
  selectedVertex: number | null
  selectedEdge: number | null
  mapOpen: boolean
  dwgNotice: boolean
  busy: string | null
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
  setNorth: (deg: number) => void
  setCompass: (c: Partial<CompassState>) => void
  setCal: (a: Pt | null, b: Pt | null) => void
  setNorthA: (p: Pt | null) => void
  setSheetOpen: (open: boolean) => void
  setCalDialogOpen: (open: boolean) => void
  setAngleSnap: (on: boolean) => void
  setShowEdgeLabels: (on: boolean) => void
  setLocked: (on: boolean) => void
  setSelection: (sel: { vertex?: number | null; edge?: number | null }) => void
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
  devtas: true,
  customRotDeg: 0,
}

const DEFAULT_BG: BgState = { kind: 'none', w: 0, h: 0, opacity: 1, grayscale: false, invert: false }

let toastSeq = 1

export const useStore = create<VastuStore>()((set, get) => {
  const push = () => {
    const { pts, closed, bulges, undoStack } = get()
    const stack = [...undoStack, { pts, closed, bulges }]
    if (stack.length > 100) stack.shift()
    set({ undoStack: stack, redoStack: [] })
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
    compass: { ...DEFAULT_COMPASS },
    tool: 'select',
    view: { tx: 0, ty: 0, k: 1 },
    calA: null,
    calB: null,
    northA: null,
    sheetOpen: typeof window === 'undefined' || window.innerWidth > 760,
    calDialogOpen: false,
    angleSnap: true,
    showEdgeLabels: true,
    locked: false,
    selectedVertex: null,
    selectedEdge: null,
    mapOpen: false,
    dwgNotice: false,
    busy: null,
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
        calA: null,
        calB: null,
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
      })
    },
    setView: (view) => set({ view }),
    setUnit: (unit) => set({ unit }),
    setMetersPerPx: (metersPerPx, scaleSource) => set({ metersPerPx, scaleSource }),

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
      push()
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
    setNorth: (northDeg) => set({ northDeg: ((northDeg % 360) + 360) % 360 }),
    setCompass: (c) => set((s) => ({ compass: { ...s.compass, ...c } })),
    setCal: (calA, calB) => set({ calA, calB }),
    setNorthA: (northA) => set({ northA }),
    setSheetOpen: (sheetOpen) => set({ sheetOpen }),
    setCalDialogOpen: (calDialogOpen) => set({ calDialogOpen }),
    setAngleSnap: (angleSnap) => set({ angleSnap }),
    setShowEdgeLabels: (showEdgeLabels) => set({ showEdgeLabels }),
    setLocked: (locked) => {
      set({ locked, selectedVertex: null, selectedEdge: null, ...(locked ? { tool: 'select' as const, calA: null, calB: null, northA: null } : {}) })
      get().toast(locked ? 'Plan locked — analysis only. Nothing can shift by accident.' : 'Plan unlocked — editing enabled', locked ? 'ok' : 'info')
    },
    setSelection: (sel) =>
      set((s) => ({
        selectedVertex: sel.vertex !== undefined ? sel.vertex : s.selectedVertex,
        selectedEdge: sel.edge !== undefined ? sel.edge : s.selectedEdge,
      })),
    setMapOpen: (mapOpen) => set({ mapOpen }),
    setDwgNotice: (dwgNotice) => set({ dwgNotice }),
    setBusy: (busy) => set({ busy }),

    toast: (msg, kind = 'info', actionLabel, onAction) => {
      const id = toastSeq++
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, msg, kind, actionLabel, onAction }] }))
      window.setTimeout(() => get().dismissToast(id), actionLabel ? 9000 : 4200)
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    undo: () => {
      const { undoStack, pts, closed } = get()
      if (undoStack.length === 0) return
      const prev = undoStack[undoStack.length - 1]
      const bulgesNow = get().bulges
      set((s) => ({
        pts: prev.pts,
        closed: prev.closed,
        bulges: prev.bulges,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, { pts, closed, bulges: bulgesNow }],
      }))
    },
    redo: () => {
      const { redoStack, pts, closed, bulges } = get()
      if (redoStack.length === 0) return
      const next = redoStack[redoStack.length - 1]
      set((s) => ({
        pts: next.pts,
        closed: next.closed,
        bulges: next.bulges,
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, { pts, closed, bulges }],
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
        compass: { ...DEFAULT_COMPASS, ...p.compass },
        locked: p.locked ?? false,
        selectedVertex: null,
        selectedEdge: null,
        undoStack: [],
        redoStack: [],
        calA: null,
        calB: null,
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
    compass: s.compass,
    locked: s.locked,
  }
}
