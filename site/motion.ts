/* The page's motion, in one place. GSAP + ScrollTrigger on native scroll — no smooth-scroll
 * engine on purpose: practitioners read this on mid-range phones, and hijacked scrolling is
 * the one thing that reliably feels broken there. Under reduced motion nothing here runs:
 * the DOM already holds every final state, so the page is simply complete. */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const EASE_OUT = 'power3.out'

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
      const parts = text.split(/(\s+)/)
      for (const part of parts) {
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

/** Arms every [data-split] heading, [data-reveal] block and [data-reveal-group] list under
 *  `root`. Returns a cleanup that kills the triggers it made. */
export function armReveals(root: HTMLElement): () => void {
  if (reducedMotion) return () => {}
  const ctx = gsap.context(() => {
    root.querySelectorAll<HTMLElement>('[data-split]').forEach((h) => {
      splitWords(h)
      gsap.from(h.querySelectorAll('.wi'), {
        yPercent: 108, duration: 0.95, ease: EASE_OUT, stagger: 0.035,
        scrollTrigger: { trigger: h, start: 'top 86%', once: true },
      })
    })
    root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        y: 28, autoAlpha: 0, duration: 0.9, ease: 'power2.out',
        delay: Number(el.dataset.reveal || 0),
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      })
    })
    root.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
      gsap.from(group.children, {
        y: 26, autoAlpha: 0, duration: 0.8, ease: 'power2.out', stagger: 0.09,
        scrollTrigger: { trigger: group, start: 'top 86%', once: true },
      })
    })
    root.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) => {
      gsap.from(el, {
        y: 48, scale: 0.985, autoAlpha: 0, duration: 1.1, ease: EASE_OUT,
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      })
    })
  }, root)
  return () => ctx.revert()
}

/** The hero's entrance: nav and copy first, so the message reads before the drawing acts. */
export function heroIntro(root: HTMLElement): () => void {
  if (reducedMotion) return () => {}
  const ctx = gsap.context(() => {
    const h = root.querySelector<HTMLElement>('[data-hero-title]')
    if (h) splitWords(h)
    const tl = gsap.timeline({ defaults: { ease: EASE_OUT } })
    tl.from(root.querySelectorAll('[data-hero-nav]'), { y: -10, autoAlpha: 0, duration: 0.6 }, 0)
      .from(root.querySelectorAll('[data-hero-eyebrow]'), { y: 12, autoAlpha: 0, duration: 0.6 }, 0.1)
      .from(h ? h.querySelectorAll('.wi') : [], { yPercent: 108, duration: 1, stagger: 0.05 }, 0.15)
      .from(root.querySelectorAll('[data-hero-copy] > *'), { y: 18, autoAlpha: 0, duration: 0.7, stagger: 0.08 }, 0.55)
  }, root)
  return () => ctx.revert()
}

/** Drives a value across a section's scroll: 0 as it enters, 1 as it leaves. */
export function scrubSection(el: HTMLElement, onProgress: (p: number) => void): () => void {
  if (reducedMotion) { onProgress(0.5); return () => {} }
  const st = ScrollTrigger.create({
    trigger: el, start: 'top 85%', end: 'bottom 30%', scrub: 0.8,
    onUpdate: (self) => onProgress(self.progress),
  })
  return () => st.kill()
}

export function refreshTriggers() { ScrollTrigger.refresh() }
