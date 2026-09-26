// The sample residence, exactly as the studio's DXF importer reads public/samples/sample-plan.dxf
// (paths in drawing pixels, y down), plus the outline a practitioner traces over it, the rooms
// they mark, and the verdicts the studio gave — captured from the app, not written by hand.
import type { DxfImport } from '../src/importers/dxf'
import type { BgState, CompassState, Marker, Pt, RoomShape } from '../src/types'

export const DXF: DxfImport = {
  w: 2000, h: 1482.76, metersPerPx: 0.0058, unitsMaxDim: 11600,
  paths: [
    "M0 1482.8L2000 1482.8L2000 448.3L1206.9 448.3L1206.9 0L0 0L0 1482.8",
    "M793.1 1482.8L793.1 620.7",
    "M793.1 620.7L0 620.7",
    "M1206.9 1482.8L1206.9 862.1",
    "M1206.9 706.9L1206.9 448.3",
    "M448.3 620.7L448.3 0",
    "M637.9 620.7L638.7 635.9L640.9 651L644.6 665.7L649.7 680.1L656.3 693.8L664.1 706.9L673.2 719.1L683.4 730.4L694.7 740.6L706.9 749.7L720 757.5L733.7 764.1L748.1 769.2L762.8 772.9L777.9 775.1L793.1 775.9",
    "M1206.9 1017.2L1222.1 1016.5L1237.2 1014.3L1251.9 1010.6L1266.3 1005.4L1280 998.9L1293.1 991.1L1305.3 982L1316.6 971.8L1326.9 960.5L1335.9 948.3L1343.8 935.2L1350.3 921.5L1355.4 907.1L1359.1 892.3L1361.3 877.3L1362.1 862.1",
    "M301.7 310.3L301.4 302.7L300.2 295.2L298.4 287.8L295.8 280.7L292.6 273.8L288.7 267.2L284.1 261.1L279 255.5L273.4 250.4L267.2 245.8L260.7 241.9L253.8 238.7L246.7 236.1L239.3 234.3L231.7 233.1L224.1 232.8L216.5 233.1L209 234.3L201.6 236.1L194.5 238.7L187.6 241.9L181 245.8L174.9 250.4L169.3 255.5L164.2 261.1L159.6 267.2L155.7 273.8L152.5 280.7L149.9 287.8L148 295.2L146.9 302.7L146.6 310.3L146.9 318L148 325.5L149.9 332.9L152.5 340L155.7 346.9L159.6 353.5L164.2 359.6L169.3 365.2L174.9 370.3L181 374.9L187.6 378.8L194.5 382L201.6 384.6L209 386.4L216.5 387.6L224.1 387.9L231.7 387.6L239.3 386.4L246.7 384.6L253.8 382L260.7 378.8L267.2 374.9L273.4 370.3L279 365.2L284.1 359.6L288.7 353.5L292.6 346.9L295.8 340L298.4 332.9L300.2 325.5L301.4 318L301.7 310.3"
  ],
  texts: [{"x":310.3,"y":1069,"size":65.5,"str":"LIVING","rotDeg":0},{"x":913.8,"y":1069,"size":65.5,"str":"KITCHEN","rotDeg":0},{"x":1500,"y":982.8,"size":65.5,"str":"BEDROOM","rotDeg":0},{"x":741.4,"y":327.6,"size":65.5,"str":"COURT","rotDeg":0}],
}

export const BG: BgState = { kind: 'dxf', name: 'sample-plan.dxf', w: DXF.w, h: DXF.h, opacity: 1, grayscale: false, invert: false }

export const OUTLINE: Pt[] = [{ x: 0, y: 1482.76 }, { x: 2000, y: 1482.76 }, { x: 2000, y: 448.28 }, { x: 1206.9, y: 448.28 }, { x: 1206.9, y: 0 }, { x: 0, y: 0 }]
export const NORTH_DEG = 8

export const ROOMS: RoomShape[] = [
  { id: 'r1', kind: 'open', shape: 'rect', label: 'Court', pts: [{ x: 0, y: 0 }, { x: 1206.9, y: 620.69 }] },
  { id: 'r2', kind: 'living', shape: 'rect', label: 'Living', pts: [{ x: 0, y: 620.69 }, { x: 793.1, y: 1482.76 }] },
  { id: 'r3', kind: 'toilet', shape: 'rect', label: 'Bath', pts: [{ x: 793.1, y: 620.69 }, { x: 1206.9, y: 862.07 }] },
  { id: 'r4', kind: 'kitchen', shape: 'rect', label: 'Kitchen', pts: [{ x: 793.1, y: 862.07 }, { x: 1206.9, y: 1482.76 }] },
  { id: 'r5', kind: 'bed', shape: 'rect', label: 'Bedroom', pts: [{ x: 1206.9, y: 448.28 }, { x: 2000, y: 1482.76 }] },
]

export const MARKERS: Marker[] = [
  { id: 'm1', kind: 'entrance', label: 'Main door', p: { x: 600, y: 0 } },
  { id: 'm2', kind: 'pooja', label: 'Pooja', p: { x: 1100, y: 520 } },
  { id: 'm3', kind: 'water', label: 'Bore well', p: { x: 1120, y: 90 } },
]

export type Verdict = 'ideal' | 'good' | 'neutral' | 'caution' | 'avoid'

/** What the studio said about them (Rooms & objects card, 16-zone reading) — shown as
 *  callouts in the margin, each with a leader to its room. `at` is the chip, `to` the room. */
export const CALLOUTS: { id: string; label: string; verdict: Verdict; where: string; at: Pt; to: Pt }[] = [
  { id: 'r3', label: 'Bath', verdict: 'avoid', where: '19% NE · on the Brahmasthan', at: { x: -430, y: 250 }, to: { x: 830, y: 741 } },
  { id: 'm1', label: 'Main door', verdict: 'avoid', where: 'gate N2 · Naga', at: { x: 150, y: -560 }, to: { x: 600, y: -12 } },
  { id: 'r5', label: 'Bedroom', verdict: 'neutral', where: '30% ESE', at: { x: 2420, y: 380 }, to: { x: 1700, y: 1040 } },
  { id: 'r4', label: 'Kitchen', verdict: 'ideal', where: '37% SSE', at: { x: 700, y: 2330 }, to: { x: 1000, y: 1460 } },
]

export const COMPASS: CompassState = {
  id: 'zones16', scalePct: 100, opacity: 0.95, fillPct: 26, clip: true, labels: true, degreeRing: true,
  brahmasthan: true, brahmaPct: 100, devtas: true, customRotDeg: 0,
}
