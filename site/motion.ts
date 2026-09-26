/* The page's motion, in one place: GSAP + ScrollTrigger over Lenis smooth scroll. Lenis smooths
 * the wheel only — touch scrolling stays native, so phones keep their own feel. Under reduced
 * motion nothing here runs: the DOM already holds every final state, so the page is complete. */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)
gsap.defaults({ ease: 'power3.out', duration: 0.85 })

export const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** One scroll engine for the whole page, driven by GSAP's ticker so ScrollTrigger stays in step. */
export function initSmoothScroll(): () => void {
  if (reducedMotion) return () => {}
  const lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95, anchors: { offset: -64 } })
  lenis.on('scroll', ScrollTrigger.update)
  const tick = (t: number) => lenis.raf(t * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)
  return () => { gsap.ticker.remove(tick); lenis.destroy() }
}

/** Wraps every word of a heading in a clipping span so it can rise into place. The heading
 *  keeps its unsplit text as its accessible name; the split copy is decoration only.
 *  Handles the `<em>` the display headings use — the em stays around its own words. */
export function splitWords(el: HTMLElement) {
  if (el.dataset.splitDone) return
  el.setAttribute('aria-label', el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (!text.trim()) return
      const frag = document.createDocumentFragment()
      for (const part of text.split(/(\s+)/)) {
        if (!part) continue
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); continue }
        const w = document.createElement('span'); w.className = 'w'
        const wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = part
        w.appendChild(wi); frag.appendChild(w)
      }
      node.parentNode?.replaceChild(frag, node)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      Array.from(node.childNodes).forEach(walk)
    }
  }
  Array.from(el.childNodes).forEach(walk)
  el.querySelectorAll('.w').forEach((w) => w.setAttribute('aria-hidden', 'true'))
  el.dataset.splitDone = '1'
}

/** Arms every [data-split] heading, [data-reveal] block, [data-reveal-group] list and
 *  [data-rise] figure under `root`. Returns a cleanup that kills what it made. */
export function armReveals(root: HTMLElement): () => void {
  if (reducedMotion) return () => {}
  const ctx = gsap.context(() => {
    root.querySelectorAll<HTMLElement>('[data-split]').forEach((h) => {
      splitWords(h)
      gsap.from(h.querySelectorAll('.wi'), {
        yPercent: 108, duration: 1, ease: 'power4.out', stagger: 0.04,
        scrollTrigger: { trigger: h, start: 'top 84%', once: true },
      })
    })
    root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        y: 28, autoAlpha: 0, duration: 0.95, ease: 'power4.out', delay: Number(el.dataset.reveal || 0),
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      })
    })
    root.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
      gsap.from(group.children, {
        y: 30, autoAlpha: 0, duration: 0.9, ease: 'power4.out', stagger: 0.08,
        scrollTrigger: { trigger: group, start: 'top 84%', once: true },
      })
    })
    root.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) => {
      gsap.from(el, {
        y: 56, scale: 0.985, autoAlpha: 0, duration: 1.15, ease: 'power4.out',
        scrollTrigger: { trigger: el, start: 'top 84%', once: true },
      })
    })
    root.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
      const speed = Number(el.dataset.parallax || 0.12)
      gsap.to(el, {
        y: () => -window.innerHeight * speed, ease: 'none',
        scrollTrigger: { trigger: el.parentElement ?? el, start: 'top bottom', end: 'bottom top', scrub: 1.1, invalidateOnRefresh: true },
      })
    })
  }, root)
  return () => ctx.revert()
}

/** The opening: nav, eyebrow, title words, then copy and buttons. The drawing plots itself alongside. */
export function heroIntro(root: HTMLElement): () => void {
  if (reducedMotion) return () => {}
  const ctx = gsap.context(() => {
    const h = root.querySelector<HTMLElement>('[data-hero-title]')
    if (h) splitWords(h)
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })
    tl.from(root.querySelectorAll('[data-hero-nav]'), { y: -12, autoAlpha: 0, duration: 0.7 }, 0.1)
    if (h) tl.from(h.querySelectorAll('.wi'), { yPercent: 110, duration: 1.1, stagger: 0.06 }, 0.4)
    const rest = root.querySelectorAll('[data-hero-copy] > :not(h1)')
    if (rest.length) tl.from(rest, { y: 20, autoAlpha: 0, duration: 0.8, stagger: 0.09 }, 0.95)
  }, root)
  return () => ctx.revert()
}

/** The imported drawing plots itself: every wall path draws on in turn, then the labels appear. */
export function drawPaths(paths: SVGPathElement[], texts: SVGTextElement[], onDone: () => void): () => void {
  if (paths.length === 0) { onDone(); return () => {} }
  paths.forEach((p) => p.setAttribute('pathLength', '1'))
  const tl = gsap.timeline({ onComplete: () => { gsap.set(paths, { clearProps: 'strokeDasharray,strokeDashoffset' }); onDone() } })
  tl.fromTo(paths, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut', stagger: 0.09 }, 0.5)
    .from(texts, { autoAlpha: 0, duration: 0.6, stagger: 0.05 }, '-=0.6')
  return () => tl.kill()
}

/** Reports a pinned section's scroll as 0 → 1 from the moment it hits the top to the moment it leaves. */
export function storyProgress(el: HTMLElement, onProgress: (p: number) => void): () => void {
  const st = ScrollTrigger.create({ trigger: el, start: 'top top', end: 'bottom bottom', onUpdate: (self) => onProgress(self.progress) })
  onProgress(st.progress)
  return () => st.kill()
}

/** Drives a value across a section's scroll: 0 as it enters, 1 as it leaves. */
export function scrubSection(el: HTMLElement, onProgress: (p: number) => void): () => void {
  if (reducedMotion) { onProgress(0.5); return () => {} }
  const st = ScrollTrigger.create({
    trigger: el, start: 'top 80%', end: 'bottom 40%', scrub: 1,
    onUpdate: (self) => onProgress(self.progress),
  })
  return () => st.kill()
}

/** Report pages fan out from a stack as the reader arrives. */
export function fanPages(container: HTMLElement): () => void {
  if (reducedMotion) return () => {}
  const pages = Array.from(container.children) as HTMLElement[]
  if (pages.length < 3) return () => {}
  const ctx = gsap.context(() => {
    gsap.fromTo(pages,
      { xPercent: (i) => (1 - i) * 100, rotate: 0, y: 40 },
      { xPercent: 0, rotate: (i) => (i - 1) * 4, y: (i) => (i === 1 ? 0 : 18), ease: 'none',
        scrollTrigger: { trigger: container, start: 'top 90%', end: 'top 30%', scrub: 1 } })
  }, container)
  return () => ctx.revert()
}

/** The nav takes the tone of whichever section is under it. */
export function navTheme(nav: HTMLElement, sections: HTMLElement[]): () => void {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) nav.dataset.on = (e.target as HTMLElement).dataset.nav || 'paper'
  }, { rootMargin: '-64px 0px -85% 0px', threshold: 0 })
  sections.forEach((s) => io.observe(s))
  return () => io.disconnect()
}

export function refreshTriggers() { ScrollTrigger.refresh() }
