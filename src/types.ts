export interface Pt { x: number; y: number }

export type Unit = 'ft' | 'm'
export type Tool = 'select' | 'calibrate' | 'trace' | 'center' | 'north' | 'marker' | 'draw' | 'room'

/** Freehand annotation ink — lives ON the plan, never part of the outline.
 *  'arrow' is a line with a head at pts[last]; 'rect'/'ellipse' are outline
 *  shapes spanning pts[0]..pts[1] as an axis-aligned bounding box. */
export interface Stroke {
  id: string
  kind: 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse'
  pts: Pt[]
  color: string
  /** world px, fixed at draw time so ink zooms with the plan */
  width: number
}

/** A text note pinned to the plan — size in world px so it zooms with the drawing. */
export interface TextNote {
  id: string
  p: Pt
  text: string
  color: string
  size: number
}

export type MarkerKind = 'entrance' | 'kitchen' | 'toilet' | 'bed' | 'pooja' | 'water' | 'custom'

export interface Marker {
  id: string
  kind: MarkerKind
  label: string
  p: Pt
  note?: string
}

/** A drawn room/area outline — same kind vocabulary as point markers, so an
 *  area gets the exact same zone-placement verdict a pin would (by its centroid). */
export type RoomShapeKind = 'rect' | 'ellipse' | 'polygon'
export interface RoomShape {
  id: string
  kind: MarkerKind
  shape: RoomShapeKind
  label: string
  note?: string
  /** rect: [corner1, corner2] axis-aligned in world space
   *  ellipse: [corner1, corner2] of the bounding box — centre = midpoint, rx=|dx|/2, ry=|dy|/2
   *  polygon: the vertices, implicitly closed */
  pts: Pt[]
}

export interface ReportMeta {
  client: string
  address: string
  practitioner: string
  notes: string
}
export type CompassId = 'none' | 'zones16' | 'gates32' | 'chakra8' | 'grid9' | 'dial' | 'custom'
export type BgKind = 'none' | 'raster' | 'dxf'
export type ScaleSource = 'manual' | 'dxf' | 'map' | 'demo' | 'pdf' | null

export interface BgState {
  kind: BgKind
  name?: string
  dataUrl?: string
  dxfText?: string
  w: number
  h: number
  opacity: number
  grayscale: boolean
  invert: boolean
  pdfPages?: number
  pdfPage?: number
}

export interface CompassState {
  id: CompassId
  scalePct: number
  opacity: number
  fillPct: number
  clip: boolean
  labels: boolean
  degreeRing: boolean
  brahmasthan: boolean
  /** manual Brahmasthan size, % of the drawing-derived radius (100 = follow the drawing) */
  brahmaPct: number
  devtas: boolean
  customUrl?: string
  customAspect?: number
  customRotDeg: number
}

export interface ViewState { tx: number; ty: number; k: number; rot: number }

export type NorthSource = 'map' | 'plan' | 'manual' | null

export interface ProjectFile {
  app: 'vastu-studio'
  version: 1
  bg: BgState
  metersPerPx: number | null
  scaleSource: ScaleSource
  unit: Unit
  pts: Pt[]
  /** bulge[i] curves the edge pts[i]→pts[i+1]; tan(sweep/4), 0 = straight */
  bulges?: number[]
  closed: boolean
  centerOverride: Pt | null
  northDeg: number
  northSource?: NorthSource
  compass: CompassState
  locked?: boolean
  markers?: Marker[]
  strokes?: Stroke[]
  roomShapes?: RoomShape[]
  texts?: TextNote[]
  report?: ReportMeta
}
