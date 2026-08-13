export interface Pt { x: number; y: number }

export type Unit = 'ft' | 'm'
export type Tool = 'select' | 'calibrate' | 'trace' | 'center' | 'north'
export type CompassId = 'none' | 'zones16' | 'gates32' | 'chakra8' | 'grid9' | 'dial' | 'custom'
export type BgKind = 'none' | 'raster' | 'dxf'
export type ScaleSource = 'manual' | 'dxf' | 'map' | 'demo' | null

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

export interface ViewState { tx: number; ty: number; k: number }

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
  compass: CompassState
}
