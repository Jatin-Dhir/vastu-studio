/* The page's motion, in one place: GSAP + ScrollTrigger over Lenis (wheel only; touch scrolling
 * stays native). The pace is a watch house's: one settling moment in the hero, parts that rise
 * into place once, and a statement whose words light up as it is read. With motion reduced —
 * by the system or by the switch in the footer — nothing here runs and every final state is
 * already in the DOM. */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)
/** the long, settling reveal curve the reference page uses: cubic-bezier(0.32, 0.94, 0.6, 1) */
const SETTLE = 'power3.out'
gsap.defaults({ ease: SETTLE, duration: 0.8 })

const MOTION_KEY = 'vastu-site.reduce-motion'
const systemReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The visitor's own choice from the footer switch, falling back to the system setting. */
export function motionReduced(): boolean {
  try {
    const v = localStorage.getItem(MOTION_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch { /* private mode */ }
  return systemReduced
}
export function setMotionReduced(on: boolean) {
  try { localStorage.setItem(MOTION_KEY, on ? '1' : '0') } catch { /* private mode */ }
  document.documentElement.classList.toggle('reduce-motion', on)
}

/** One scroll engine for the whole page, driven by GSAP's ticker so ScrollTrigger stays in step. */
export function initSmoothScroll(): () => void {
  if (motionReduced()) return () => {}
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.9, anchors: { offset: -72 } })
  lenis.on('scroll', ScrollTrigger.update)
  const tick = (t: number) => lenis.raf(t * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)
  return () => { gsap.ticker.remove(tick); lenis.destroy() }
}

/** Wraps each word of `el` in spans for the reveal, walking text nodes so inline markup (strong,
 *  em, links) survives; whitespace is kept exactly. The words are decoration — the element keeps
 *  its unsplit text as its accessible name. Returns the word spans. */
export function splitWords(el: HTMLElement): HTMLElement[] {
  if (el.dataset.splitDone) return Array.from(el.querySelectorAll<HTMLElement>('.w'))
  el.setAttribute('aria-label', el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  for (const node of nodes) {
    const text = node.textContent ?? ''
    if (!text.trim()) continue
    const frag = document.createDocumentFragment()
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue }
      const w = document.createElement('span')
      w.className = 'w'
      w.setAttribute('aria-hidden', 'true')
      w.textContent = part
      frag.appendChild(w)
    }
    node.parentNode?.replaceChild(frag, node)
  }
  el.dataset.splitDone = '1'
  return Array.from(el.querySelectorAll<HTMLElement>('.w'))
}

/** The statement: every word starts pale and settles into full ink as the sentence passes
 *  through the middle of the screen — reading progress made visible. */
export function scrubWords(el: HTMLElement): () => void {
  if (motionReduced()) return () => {}
  const words = splitWords(el)
  const n = words.length
  const st = ScrollTrigger.create({
    trigger: el, start: 'top 82%', end: 'bottom 38%', scrub: 0.4,
    onUpdate: (self) => {
      const p = self.progress * (n + 2)
      for (let i = 0; i < n; i++) words[i].style.setProperty('--p', String(Math.min(1, Math.max(0, p - i))))
    },
  })
  words.forEach((w) => w.style.setProperty('--p', '0'))
  el.classList.add('scrubbing')
  return () => { st.kill(); el.classList.remove('scrubbing'); words.forEach((w) => w.style.removeProperty('--p')) }
}

/** Parts and their stories arrive once: [data-rise] lifts and settles, [data-heading] words rise
 *  out of their line, [data-stagger] children follow one another. */
export function armReveals(root: HTMLElement): () => void {
  if (motionReduced()) return () => {}
  const ctx = gsap.context(() => {
    root.querySelectorAll<HTMLElement>('[data-heading]').forEach((h) => {
      const words = splitWords(h)
      gsap.from(words, {
        yPercent: 60, autoAlpha: 0, duration: 0.9, stagger: 0.035,
        scrollTrigger: { trigger: h, start: 'top 88%', once: true },
      })
    })
    root.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) => {
      gsap.from(el, {
        y: 36, scale: 0.97, autoAlpha: 0, duration: 1.1,
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      })
    })
    root.querySelectorAll<HTMLElement>('[data-stagger]').forEach((group) => {
      gsap.from(group.children, {
        y: 22, autoAlpha: 0, duration: 0.8, stagger: 0.07,
        scrollTrigger: { trigger: group, start: 'top 88%', once: true },
      })
    })
  }, root)
  return () => ctx.revert()
}

/** The opening: the header, then the instrument settling onto its north, then the name block.
 *  `turn` animates the chakra's bearing; the static first frame is already complete. */
export function heroIntro(root: HTMLElement, turn: (from: number) => void): () => void {
  if (motionReduced()) return () => {}
  const ctx = gsap.context(() => {
    const tl = gsap.timeline()
    tl.from(root.querySelectorAll('[data-intro="head"]'), { y: -10, autoAlpha: 0, duration: 0.7 }, 0.05)
      .from(root.querySelectorAll('[data-intro="object"]'), { scale: 0.94, autoAlpha: 0, duration: 1.4 }, 0.15)
      .add(() => turn(-38), 0.25)
      .from(root.querySelectorAll('[data-intro="copy"] > *'), { y: 16, autoAlpha: 0, duration: 0.8, stagger: 0.08 }, 0.6)
      .from(root.querySelectorAll('[data-intro="foot"]'), { autoAlpha: 0, duration: 0.8 }, 1.1)
  }, root)
  return () => ctx.revert()
}

/** Tweens a bearing from `from` to `to` (degrees) and reports each step. */
export function tweenBearing(from: number, to: number, onStep: (deg: number) => void): () => void {
  if (motionReduced()) { onStep(to); return () => {} }
  const s = { d: from }
  const t = gsap.to(s, { d: to, duration: 1.6, ease: 'power4.out', onUpdate: () => onStep(Math.round(s.d * 10) / 10) })
  return () => t.kill()
}

/** Calls back with whether the hero has scrolled out of view. */
export function pastHero(hero: HTMLElement, onChange: (past: boolean) => void): () => void {
  const io = new IntersectionObserver(([e]) => onChange(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 })
  io.observe(hero)
  return () => io.disconnect()
}

export function refreshTriggers() { ScrollTrigger.refresh() }

/** Once the opening has everything it needs, the images further down start loading in the
 *  background, so a reader who scrolls finds them there. Skipped when the browser asks to save
 *  data; lazy loading still covers that reader. */
export function warmImages(root: HTMLElement): () => void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return () => {}
  let idle = 0
  const warm = () => { root.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((im) => { im.loading = 'eager' }) }
  const start = () => { idle = window.setTimeout(warm, 1200) }
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
  return () => { window.removeEventListener('load', start); window.clearTimeout(idle) }
}
