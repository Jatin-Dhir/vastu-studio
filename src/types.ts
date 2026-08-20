export interface Pt { x: number; y: number }

export type Unit = 'ft' | 'm'
export type Tool = 'select' | 'calibrate' | 'trace' | 'center' | 'north' | 'marker'

export type MarkerKind = 'entrance' | 'kitchen' | 'toilet' | 'bed' | 'pooja' | 'water' | 'custom'

export interface Marker {
  id: string
  kind: MarkerKind
  label: string
  p: Pt
  note?: string
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
  report?: ReportMeta
}
