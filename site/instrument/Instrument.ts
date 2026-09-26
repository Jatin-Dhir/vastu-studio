/* The instrument on the table: the plan on paper, a brass-rimmed acetate over it, a sun that
 * crosses the sky. One WebGL context, rendered only when something changed, driven by GSAP's
 * ticker so it shares the page's one frame loop. The scene is the pitch: this is the act a
 * practitioner performs with a printed chakra sheet, and the studio's own drawing underneath. */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import gsap from 'gsap'
import { CENTER, PAPER_H, PAPER_W, R_PLOT, SHEET, gatesTexture, planTexture, zonesTexture, type Sheet } from './textures'
import { NORTH_DEG } from '../sample'

export type Disc = 'zones16' | 'gates32'
export interface Projected { x: number; y: number; visible: boolean }

const UMBER = 0x100d0a
const PW = 10 // the paper's width in world units
const PH = PW * (PAPER_H / PAPER_W)
const R_DISC = (R_PLOT / PAPER_W) * PW
const ALIGN_TOL = 5 // degrees within which the acetate snaps to north
const START_ROT = -38

const shortest = (a: number) => ((a + 540) % 360) - 180

export class Instrument {
  readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private sun: THREE.DirectionalLight
  private acetate = new THREE.Group()
  private disc!: THREE.Mesh<THREE.CircleGeometry, THREE.MeshPhysicalMaterial>
  private bezel!: THREE.Mesh<THREE.TorusGeometry, THREE.MeshPhysicalMaterial>
  private paper!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>
  private sheets: Partial<Record<Sheet, THREE.CanvasTexture>> = {}
  private acetates: { zones?: THREE.CanvasTexture; gates?: THREE.CanvasTexture } = {}
  private sheet: Sheet = 'plain'
  private centre = new THREE.Vector3()
  private lookAt = new THREE.Vector3()
  private baseDist = 14
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  private rot = START_ROT
  private rotTarget = START_ROT
  private settle: { t0: number; from: number } | null = null
  private drag: { angle0: number; rot0: number; moved: boolean; id: number } | null = null
  private touchIntent: { x: number; y: number; decided: boolean; rotate: boolean } | null = null
  private sunT = 0.08
  private discAlpha = 1
  private discAlphaTarget = 1
  private dolly = 0
  private dollyTarget = 0
  private glint = 0
  private dirty = true
  private active = true
  private idleSince = performance.now()
  private lastT = 0
  aligned = false
  onAligned: (() => void) | null = null
  onFrame: ((project: (dx: number, dy: number) => Projected) => void) | null = null
  ready: Promise<void>
  private disposed = false
  private tick = () => this.frame(performance.now())

  constructor(private container: HTMLElement, private wide: () => boolean) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'instrument-canvas'
    container.appendChild(this.canvas)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.3
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene.background = new THREE.Color(UMBER)
    this.scene.fog = new THREE.Fog(UMBER, 16, 34) // rescaled to the camera distance in resize()
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.5
    pmrem.dispose()

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 80)

    // the sun, and the little light the room gives back
    this.sun = new THREE.DirectionalLight(0xffb36b, 2.6)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(window.innerWidth < 900 ? 1024 : 2048, window.innerWidth < 900 ? 1024 : 2048)
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 50
    this.sun.shadow.camera.left = -9; this.sun.shadow.camera.right = 9; this.sun.shadow.camera.top = 9; this.sun.shadow.camera.bottom = -9
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.02
    this.sun.shadow.radius = 3
    this.scene.add(this.sun, this.sun.target)
    this.scene.add(new THREE.HemisphereLight(0x9a8d78, 0x1a120c, 1.25))
    // a soft fill from the reader's side, so the sheet reads even at dawn
    const fill = new THREE.DirectionalLight(0xfff1dd, 0.55)
    fill.position.set(-4, 9, 10)
    this.scene.add(fill)

    // the table
    const table = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x1d1712, roughness: 0.94, metalness: 0 }))
    table.rotation.x = -Math.PI / 2
    table.receiveShadow = true
    this.scene.add(table)

    // the paper, the acetate, the brass
    this.paper = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 }))
    this.paper.rotation.x = -Math.PI / 2
    this.paper.position.y = 0.012
    this.paper.receiveShadow = true
    this.paper.castShadow = true
    this.scene.add(this.paper)

    this.disc = new THREE.Mesh(new THREE.CircleGeometry(R_DISC, 160), new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, depthWrite: false, side: THREE.DoubleSide,
    }))
    this.disc.rotation.x = -Math.PI / 2
    this.bezel = new THREE.Mesh(new THREE.TorusGeometry(R_DISC + 0.07, 0.07, 24, 200), new THREE.MeshPhysicalMaterial({
      color: 0xb8903e, metalness: 1, roughness: 0.32, clearcoat: 0.4, clearcoatRoughness: 0.2, envMapIntensity: 1.3, emissive: 0x3a2a08, emissiveIntensity: 0,
      transparent: true, opacity: 1,
    }))
    this.bezel.rotation.x = -Math.PI / 2
    this.bezel.castShadow = true
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.42), this.bezel.material)
    lug.position.set(0, 0.02, -(R_DISC + 0.07))
    lug.castShadow = true
    this.acetate.add(this.disc, this.bezel, lug)
    this.acetate.position.set(this.dx(CENTER.x), 0.062, this.dz(CENTER.y))
    this.acetate.rotation.y = -THREE.MathUtils.degToRad(this.rot)
    this.scene.add(this.acetate)
    this.centre.copy(this.acetate.position)

    this.resize()
    this.ready = this.load()
    this.bind()
    gsap.ticker.add(this.tick)
  }

  /** drawing units → world */
  private dx(x: number) { return ((x - SHEET.x0) / PAPER_W) * PW - PW / 2 }
  private dz(y: number) { return ((y - SHEET.y0) / PAPER_H) * PH - PH / 2 }

  private tex(c: HTMLCanvasElement) {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    return t
  }
  private async load() {
    // what the opening needs first; the later acts' sheets arrive behind it
    const small = window.innerWidth < 900
    const px = small ? 1536 : 2560, apx = small ? 1536 : 2048
    const [plain, zonesA] = await Promise.all([planTexture('plain', px), zonesTexture(apx)])
    this.sheets.plain = this.tex(plain)
    this.acetates.zones = this.tex(zonesA)
    this.paper.material.map = this.sheets.plain; this.paper.material.needsUpdate = true
    this.disc.material.map = this.acetates.zones; this.disc.material.needsUpdate = true
    this.dirty = true
    void Promise.all([planTexture('zones16', px), planTexture('gates32', px), planTexture('grid9', px), gatesTexture(apx)]).then(([z, g, m, ga]) => {
      if (this.disposed) return
      this.sheets.zones16 = this.tex(z); this.sheets.gates32 = this.tex(g); this.sheets.grid9 = this.tex(m)
      this.acetates.gates = this.tex(ga)
      this.applySheet()
    })
  }
  /** which of the studio's renders is printed on the paper right now */
  private applySheet() {
    const m = this.sheets[this.sheet] ?? this.sheets.plain
    if (m && this.paper.material.map !== m) { this.paper.material.map = m; this.paper.material.needsUpdate = true; this.dirty = true }
  }
  setSheet(s: Sheet) { this.sheet = s; this.applySheet() }

  /* ---------- state the page drives ---------- */

  /** 0 = dawn in the north-east, 0.5 = noon in the south, 1 = dusk in the west */
  setSun(t: number) {
    this.sunT = t
    const az = THREE.MathUtils.lerp(52, 285, t) // degrees clockwise from north
    const el = THREE.MathUtils.degToRad(10 + 58 * Math.sin(Math.PI * t))
    const a = THREE.MathUtils.degToRad(az)
    const r = 18
    // north is -z; east is +x
    this.sun.position.set(r * Math.cos(el) * Math.sin(a), r * Math.sin(el), -r * Math.cos(el) * Math.cos(a))
    this.sun.target.position.set(this.centre.x, 0, this.centre.z)
    const warm = new THREE.Color(0xffb36b), noon = new THREE.Color(0xfff3e2)
    const w = Math.pow(Math.abs(t - 0.5) * 2, 1.6)
    this.sun.color.copy(noon).lerp(warm, w)
    this.sun.intensity = 3.0 + 2.4 * Math.sin(Math.PI * t)
    this.dirty = true
  }
  setDisc(kind: Disc) {
    const m = kind === 'zones16' ? this.acetates.zones : this.acetates.gates
    if (m && this.disc.material.map !== m) { this.disc.material.map = m; this.disc.material.needsUpdate = true; this.dirty = true }
  }
  /** the mandala is fitted to the plot, so it prints on the paper and the acetate lifts away */
  setMandala(on: boolean) { this.discAlphaTarget = on ? 0 : 1; this.dirty = true }
  setDolly(v: number) { this.dollyTarget = v; this.dirty = true }
  setActive(on: boolean) { this.active = on; if (on) this.dirty = true }

  rotateTo(deg: number) { this.rotTarget = deg; this.settle = { t0: performance.now(), from: this.rot }; this.dirty = true }
  setNorth() { this.rotateTo(NORTH_DEG) }

  /* ---------- pointer: turn the acetate ---------- */

  private bind() {
    const c = this.canvas
    c.addEventListener('pointerdown', this.onDown)
    c.addEventListener('pointermove', this.onMove)
    c.addEventListener('pointerup', this.onUp)
    c.addEventListener('pointercancel', this.onUp)
    c.addEventListener('pointerleave', this.onUp)
    window.addEventListener('pointermove', this.onHover, { passive: true })
    window.addEventListener('resize', this.onResize)
  }
  private angleAt(e: PointerEvent) {
    const p = this.project(CENTER.x, CENTER.y)
    const r = this.canvas.getBoundingClientRect()
    return (Math.atan2(e.clientY - r.top - p.y, e.clientX - r.left - p.x) * 180) / Math.PI
  }
  private onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    this.idleSince = performance.now()
    if (e.pointerType === 'touch') { this.touchIntent = { x: e.clientX, y: e.clientY, decided: false, rotate: false } }
    this.drag = { angle0: this.angleAt(e), rot0: this.rot, moved: false, id: e.pointerId }
    this.settle = null
    this.canvas.classList.add('grabbing')
  }
  private onMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return
    if (this.touchIntent && !this.touchIntent.decided) {
      const dx = Math.abs(e.clientX - this.touchIntent.x), dy = Math.abs(e.clientY - this.touchIntent.y)
      if (dx < 8 && dy < 8) return
      this.touchIntent.decided = true
      this.touchIntent.rotate = dx > dy
      if (!this.touchIntent.rotate) { this.drag = null; this.canvas.classList.remove('grabbing'); return }
      this.canvas.setPointerCapture(e.pointerId)
      this.drag.angle0 = this.angleAt(e); this.drag.rot0 = this.rot
    } else if (e.pointerType !== 'touch' && !this.drag.moved) {
      this.canvas.setPointerCapture(e.pointerId)
    }
    const d = shortest(this.angleAt(e) - this.drag.angle0)
    this.drag.moved = true
    this.rot = this.drag.rot0 + d
    this.dirty = true
  }
  private onUp = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return
    const moved = this.drag.moved
    this.drag = null
    this.touchIntent = null
    this.canvas.classList.remove('grabbing')
    if (moved && !this.aligned && Math.abs(shortest(this.rot - NORTH_DEG)) <= ALIGN_TOL) this.setNorth()
    else if (moved) { this.rotTarget = this.rot; this.settle = null }
  }
  private onHover = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1
    this.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1
    this.dirty = true
  }
  private onResize = () => { this.resize(); this.dirty = true }

  resize() {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // the acetate must fit whichever side is tighter; on a wide screen it sits right of the copy
    const need = this.wide() ? (R_DISC + 1.2) * 2 : PW * 1.04
    const vfov = THREE.MathUtils.degToRad(this.camera.fov)
    const distH = (need / 2) / Math.tan(vfov / 2)
    const distW = (need / 2) / (Math.tan(vfov / 2) * this.camera.aspect)
    this.baseDist = Math.max(distH, distW) * 1.02
    const fog = this.scene.fog as THREE.Fog
    fog.near = this.baseDist * 1.25; fog.far = this.baseDist * 2.4
    const wide = this.wide()
    // wide: the acetate sits right of the copy; narrow: it sits in the upper half, above the copy
    const hh = this.baseDist * Math.tan(vfov / 2)
    this.lookAt.set(this.centre.x + (wide ? -3.4 : 0), 0, this.centre.z + (wide ? -0.15 : 0.36 * hh))
    this.camera.updateProjectionMatrix()
    this.placeCamera()
  }
  private placeCamera() {
    const d = this.baseDist * (1 - 0.14 * this.dolly)
    const tilt = THREE.MathUtils.degToRad(24) // from the vertical: a sheet seen from above, with a little depth
    const px = this.pointer.x * 0.35, py = this.pointer.y * 0.2
    this.camera.position.set(this.lookAt.x + px * 1.4, d * Math.cos(tilt) + py, this.lookAt.z + d * Math.sin(tilt) + px * 0.2)
    this.camera.lookAt(this.lookAt.x, 0, this.lookAt.z)
  }

  /** drawing units on the paper → screen pixels within the canvas */
  project(dx: number, dy: number): Projected {
    const v = new THREE.Vector3(this.dx(dx), 0.08, this.dz(dy)).project(this.camera)
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, visible: v.z < 1 }
  }

  private frame(t: number) {
    if (this.disposed || !this.active) { this.lastT = t; return }
    // real elapsed time, clamped, so the spring settles in the same second on every machine
    const real = this.lastT ? Math.min(0.5, Math.max(0.004, (t - this.lastT) / 1000)) : 1 / 60
    const dt = Math.min(0.05, real)
    this.lastT = t
    let moving = false
    // the pointer's parallax settles softly
    const pe = 1 - Math.exp(-real * 4)
    const nx = this.pointer.x + (this.pointer.tx - this.pointer.x) * pe
    const ny = this.pointer.y + (this.pointer.ty - this.pointer.y) * pe
    if (Math.abs(nx - this.pointer.x) > 1e-4 || Math.abs(ny - this.pointer.y) > 1e-4) { this.pointer.x = nx; this.pointer.y = ny; moving = true }
    // the acetate eases onto north when released near it — on the clock, whatever the frame rate
    if (this.settle) {
      const span = shortest(this.rotTarget - this.settle.from)
      const k = Math.min(1, (t - this.settle.t0) / 900)
      const e = 1 - Math.pow(1 - k, 3)
      this.rot = this.settle.from + span * e
      moving = true
      if (k >= 1) {
        this.rot = this.rotTarget; this.settle = null
        if (!this.aligned && Math.abs(shortest(this.rot - NORTH_DEG)) < 0.5) { this.aligned = true; this.glint = 1; if (this.sheet === 'plain') this.setSheet('zones16'); this.onAligned?.() }
      }
    } else if (!this.aligned && !this.drag && t - this.idleSince > 4500) {
      // an untouched acetate breathes, so a visitor sees it can turn
      const breathe = Math.sin((t - this.idleSince) / 900) * 1.6
      const target = this.rotTarget + breathe
      if (Math.abs(target - this.rot) > 0.01) { this.rot = target; moving = true }
    }
    if (this.glint > 0) { this.glint = Math.max(0, this.glint - real * 1.2); this.bezel.material.emissiveIntensity = this.glint * 1.6; moving = true }
    const ease = 1 - Math.exp(-real * 5)
    if (Math.abs(this.discAlpha - this.discAlphaTarget) > 0.002) { this.discAlpha += (this.discAlphaTarget - this.discAlpha) * ease; moving = true }
    else this.discAlpha = this.discAlphaTarget
    if (Math.abs(this.dolly - this.dollyTarget) > 0.002) { this.dolly += (this.dollyTarget - this.dolly) * ease; moving = true }

    if (this.dirty || moving) {
      this.acetate.rotation.y = -THREE.MathUtils.degToRad(this.rot)
      this.acetate.position.y = 0.062 + (1 - this.discAlpha) * 1.4
      this.acetate.visible = this.discAlpha > 0.02
      this.disc.material.opacity = this.discAlpha
      this.bezel.material.opacity = this.discAlpha
      this.bezel.castShadow = this.discAlpha > 0.5
      this.placeCamera()
      this.renderer.render(this.scene, this.camera)
      this.onFrame?.((x, y) => this.project(x, y))
      this.dirty = false
    }
  }

  dispose() {
    this.disposed = true
    gsap.ticker.remove(this.tick)
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onDown); c.removeEventListener('pointermove', this.onMove)
    c.removeEventListener('pointerup', this.onUp); c.removeEventListener('pointercancel', this.onUp); c.removeEventListener('pointerleave', this.onUp)
    window.removeEventListener('pointermove', this.onHover); window.removeEventListener('resize', this.onResize)
    Object.values(this.sheets).forEach((m) => m?.dispose()); Object.values(this.acetates).forEach((m) => m?.dispose())
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | undefined; if (mat && 'dispose' in mat) mat.dispose() })
    this.renderer.dispose()
    c.remove()
  }
}

