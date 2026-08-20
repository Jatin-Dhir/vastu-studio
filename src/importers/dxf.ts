import DxfParser from 'dxf-parser'

export interface DxfText { x: number; y: number; size: number; str: string; rotDeg: number }
export interface DxfImport {
  paths: string[]
  texts: DxfText[]
  w: number
  h: number
  metersPerPx: number | null
  /** Largest extent of the drawing in its own (possibly unitless) drawing units. */
  unitsMaxDim: number
}

interface XY { x: number; y: number }
/** Affine transform: [a c e; b d f]. */
interface Mat { a: number; b: number; c: number; d: number; e: number; f: number }

const IDENT: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

function mul(m: Mat, n: Mat): Mat {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  }
}
function apply(m: Mat, p: XY): XY {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }
}
function translate(x: number, y: number): Mat { return { a: 1, b: 0, c: 0, d: 1, e: x, f: y } }
function rotateDeg(deg: number): Mat {
  const r = (deg * Math.PI) / 180
  return { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 }
}
function scaleXY(sx: number, sy: number): Mat { return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 } }
function avgScale(m: Mat): number {
  return (Math.hypot(m.a, m.b) + Math.hypot(m.c, m.d)) / 2
}

/** $INSUNITS → metres per drawing unit. */
const UNIT_METERS: Record<number, number> = {
  1: 0.0254, 2: 0.3048, 3: 1609.344, 4: 0.001, 5: 0.01, 6: 1, 7: 1000,
  8: 2.54e-5, 9: 1e-6, 10: 0.9144, 14: 0.1,
}

/** Some dxf-parser versions give arc angles in radians, others leave degrees. */
function toRad(angle: number): number {
  return Math.abs(angle) > Math.PI * 2 + 1e-6 ? (angle * Math.PI) / 180 : angle
}

function sampleArc(cx: number, cy: number, r: number, a0: number, a1: number, out: XY[]) {
  if (a1 <= a0) a1 += Math.PI * 2
  const span = a1 - a0
  const n = Math.max(6, Math.ceil((span / (Math.PI * 2)) * 64))
  for (let i = 0; i <= n; i++) {
    const t = a0 + (span * i) / n
    out.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) })
  }
}

/** Bulge segment between p1 and p2 (bulge = tan(sweep/4)), sampled. */
function sampleBulge(p1: XY, p2: XY, bulge: number, out: XY[]) {
  const theta = 4 * Math.atan(bulge)
  const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (chord < 1e-9 || Math.abs(theta) < 1e-6) { out.push(p2); return }
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2))
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
  const h = Math.sqrt(Math.max(0, r * r - (chord / 2) * (chord / 2)))
  // perpendicular to chord; bulge > 0 = CCW arc
  const ux = -(p2.y - p1.y) / chord, uy = (p2.x - p1.x) / chord
  const sign = bulge > 0 ? 1 : -1
  const cx = mx - sign * h * ux, cy = my - sign * h * uy
  let sa = Math.atan2(p1.y - cy, p1.x - cx)
  let ea = Math.atan2(p2.y - cy, p2.x - cx)
  if (bulge > 0 && ea < sa) ea += Math.PI * 2
  if (bulge < 0 && ea > sa) ea -= Math.PI * 2
  const n = Math.max(4, Math.ceil((Math.abs(ea - sa) / (Math.PI * 2)) * 64))
  for (let i = 1; i <= n; i++) {
    const t = sa + ((ea - sa) * i) / n
    out.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) })
  }
}

/** Uniform-ish B-spline sampling via de Boor; falls back to control polygon. */
function sampleSpline(ctrl: XY[], degree: number, knots: number[] | undefined, out: XY[]) {
  const n = ctrl.length
  if (n < 2) return
  if (!knots || knots.length < n + degree + 1 || degree < 1) {
    for (const p of ctrl) out.push(p)
    return
  }
  const kMin = knots[degree]
  const kMax = knots[n]
  const SAMPLES = 48
  for (let s = 0; s <= SAMPLES; s++) {
    const u = kMin + ((kMax - kMin) * s) / SAMPLES
    // find span
    let k = degree
    for (let i = degree; i < n; i++) {
      if (u >= knots[i] && u <= knots[i + 1]) { k = i; break }
      if (i === n - 1) k = n - 1
    }
    const d: XY[] = []
    for (let j = 0; j <= degree; j++) d[j] = { ...ctrl[j + k - degree] }
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const den = knots[j + 1 + k - r] - knots[j + k - degree]
        const alpha = den === 0 ? 0 : (u - knots[j + k - degree]) / den
        d[j] = {
          x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
          y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
        }
      }
    }
    out.push(d[degree])
  }
}

function stripMtext(s: string): string {
  return s
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\\\/g, '\\')
    .trim()
}

export function importDxf(text: string): DxfImport {
  const parser = new DxfParser()
  const dxf = parser.parseSync(text)
  if (!dxf) throw new Error('Could not parse DXF')

  const polylines: XY[][] = []
  const rawTexts: { p: XY; size: number; str: string; rotDeg: number }[] = []
  let entityCount = 0

  const blocks: Record<string, any> = (dxf as any).blocks ?? {}

  function walk(entities: any[], m: Mat, depth: number) {
    if (!entities || depth > 5) return
    for (const ent of entities) {
      if (entityCount > 60000) return
      entityCount++
      try {
        switch (ent.type) {
          case 'LINE': {
            const v = ent.vertices
            if (v?.length >= 2) polylines.push([apply(m, v[0]), apply(m, v[1])])
            break
          }
          case 'LWPOLYLINE':
          case 'POLYLINE': {
            const v: any[] = ent.vertices ?? []
            if (v.length < 2) break
            const pts: XY[] = [{ x: v[0].x, y: v[0].y }]
            for (let i = 0; i < v.length - 1; i++) {
              const b = v[i].bulge ?? 0
              if (Math.abs(b) > 1e-9) sampleBulge(v[i], v[i + 1], b, pts)
              else pts.push({ x: v[i + 1].x, y: v[i + 1].y })
            }
            const closed = ent.shape === true || (ent.flag !== undefined && (ent.flag & 1) === 1)
            if (closed) {
              const b = v[v.length - 1].bulge ?? 0
              if (Math.abs(b) > 1e-9) sampleBulge(v[v.length - 1], v[0], b, pts)
              else pts.push({ x: v[0].x, y: v[0].y })
            }
            polylines.push(pts.map((p) => apply(m, p)))
            break
          }
          case 'CIRCLE': {
            const pts: XY[] = []
            sampleArc(ent.center.x, ent.center.y, ent.radius, 0, Math.PI * 2, pts)
            polylines.push(pts.map((p) => apply(m, p)))
            break
          }
          case 'ARC': {
            const pts: XY[] = []
            sampleArc(ent.center.x, ent.center.y, ent.radius, toRad(ent.startAngle), toRad(ent.endAngle), pts)
            polylines.push(pts.map((p) => apply(m, p)))
            break
          }
          case 'ELLIPSE': {
            const c = ent.center
            const M = ent.majorAxisEndPoint
            const ratio = ent.axisRatio ?? 1
            const a0 = ent.startAngle ?? 0
            let a1 = ent.endAngle ?? Math.PI * 2
            if (a1 <= a0) a1 += Math.PI * 2
            const pts: XY[] = []
            const n = Math.max(8, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 64))
            for (let i = 0; i <= n; i++) {
              const t = a0 + ((a1 - a0) * i) / n
              pts.push({
                x: c.x + Math.cos(t) * M.x - Math.sin(t) * ratio * M.y,
                y: c.y + Math.cos(t) * M.y + Math.sin(t) * ratio * M.x,
              })
            }
            polylines.push(pts.map((p) => apply(m, p)))
            break
          }
          case 'SPLINE': {
            const ctrl: XY[] = (ent.controlPoints ?? []).map((p: any) => ({ x: p.x, y: p.y }))
            const pts: XY[] = []
            sampleSpline(ctrl, ent.degreeOfSplineCurve ?? ent.degree ?? 3, ent.knotValues, pts)
            if (pts.length >= 2) polylines.push(pts.map((p) => apply(m, p)))
            break
          }
          case 'INSERT': {
            const block = blocks[ent.name]
            if (!block?.entities) break
            const bp = block.position ?? { x: 0, y: 0 }
            let t = mul(m, translate(ent.position?.x ?? 0, ent.position?.y ?? 0))
            t = mul(t, rotateDeg(ent.rotation ?? 0))
            t = mul(t, scaleXY(ent.xScale ?? 1, ent.yScale ?? ent.xScale ?? 1))
            t = mul(t, translate(-bp.x, -bp.y))
            walk(block.entities, t, depth + 1)
            break
          }
          case 'TEXT':
          case 'MTEXT': {
            const p = ent.startPoint ?? ent.position
            if (!p) break
            const str = stripMtext(String(ent.text ?? ''))
            if (!str) break
            rawTexts.push({
              p: apply(m, p),
              size: (ent.textHeight ?? ent.height ?? 2.5) * avgScale(m),
              str,
              rotDeg: ent.rotation ?? 0,
            })
            break
          }
          default:
            break
        }
      } catch {
        // skip malformed entity
      }
    }
  }

  walk((dxf as any).entities ?? [], IDENT, 0)

  if (polylines.length === 0 && rawTexts.length === 0) {
    throw new Error('No drawable geometry found in this DXF')
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const line of polylines) {
    for (const p of line) {
      if (!isFinite(p.x) || !isFinite(p.y)) continue
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
    }
  }
  for (const t of rawTexts) {
    minX = Math.min(minX, t.p.x); minY = Math.min(minY, t.p.y)
    maxX = Math.max(maxX, t.p.x); maxY = Math.max(maxY, t.p.y)
  }
  if (!isFinite(minX) || maxX - minX < 1e-9 || maxY - minY < 1e-9) {
    throw new Error('DXF extents are degenerate')
  }

  const s = 2000 / Math.max(maxX - minX, maxY - minY)
  const w = (maxX - minX) * s
  const h = (maxY - minY) * s
  const mapPt = (p: XY): XY => ({ x: (p.x - minX) * s, y: (maxY - p.y) * s })

  const paths: string[] = []
  for (const line of polylines.slice(0, 20000)) {
    const mapped = line.map(mapPt)
    let d = `M${mapped[0].x.toFixed(2)} ${mapped[0].y.toFixed(2)}`
    for (let i = 1; i < mapped.length; i++) d += `L${mapped[i].x.toFixed(2)} ${mapped[i].y.toFixed(2)}`
    paths.push(d)
  }

  const texts: DxfText[] = rawTexts.slice(0, 2000).map((t) => {
    const p = mapPt(t.p)
    return { x: p.x, y: p.y, size: Math.max(4, t.size * s), str: t.str.slice(0, 80), rotDeg: -t.rotDeg }
  })

  const insunits = Number((dxf as any).header?.$INSUNITS ?? 0)
  const unitM = UNIT_METERS[insunits]
  const metersPerPx = unitM ? unitM / s : null

  return { paths, texts, w, h, metersPerPx, unitsMaxDim: Math.max(maxX - minX, maxY - minY) }
}
