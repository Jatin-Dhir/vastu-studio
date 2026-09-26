import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Monitor, RotateCw, Smartphone } from 'lucide-react'
import type { Instrument } from './instrument/Instrument'
import { FINAL_STATE, PlanStage } from './HeroPlan'
import { reducedMotion, storyProgress } from './motion'
import { APP_URL, DOWNLOADS } from './config'
import { CALLOUTS } from './sample'

/* The opening act. A real instrument on a table: the studio's own drawing on paper, the sixteen-
 * zone acetate over it in a brass rim, a sun that crosses the sky as the page scrolls. The visitor
 * turns the acetate to the drawing's north with their hand — the thing every practitioner does
 * with a printed chakra sheet — and the rooms give up their verdicts. Then, still pinned, the sun
 * climbs while the acetate becomes the thirty-two gates and the mandala prints on the sheet. */

const ACTS = [
  { key: 'zones', num: '16', word: 'zones', body: 'Sixteen directions, each with what it governs, clipped to the plot around a Brahmasthan found by area. A room’s verdict is how much of it sits in which.' },
  { key: 'gates', num: '32', word: 'gates', body: 'The entrance ring: thirty-two padas of 11¼° each, with their devtas. A door reads by the pada it falls in, and the favourable gates on the same wall are named.' },
  { key: 'padas', num: '81', word: 'padas', body: 'The nine-by-nine Vastu Purusha Mandala, fitted to the plot’s own orientation with all forty-five devtas in place — printed on the sheet for the report.' },
]
const phaseOf = (p: number) => (p < 0.24 ? 0 : p < 0.5 ? 1 : p < 0.76 ? 2 : 3)

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

export function Act({ version, returning }: { version: string; returning: boolean }) {
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const labels = useRef<(HTMLSpanElement | null)[]>([])
  const inst = useRef<Instrument | null>(null)
  const [webgl] = useState(() => !reducedMotion && webglAvailable())
  const [phase, setPhase] = useState(0)
  const [aligned, setAligned] = useState(!webgl)
  const [ready, setReady] = useState(!webgl)
  const live = webgl

  useEffect(() => {
    if (!live || !stage.current || !section.current) return
    const el = stage.current
    const sec = section.current
    let it: Instrument | null = null
    let cancelled = false
    let cleanup: (() => void) | null = null
    void import('./instrument/Instrument').then(({ Instrument }) => {
      if (cancelled) return
      it = new Instrument(el, () => window.innerWidth >= 1000)
      inst.current = it
      if (import.meta.env.DEV) (window as unknown as { __inst?: Instrument }).__inst = it
      cleanup = wire(it)
    })
    const wire = (it: Instrument) => {
    it.ready.then(() => setReady(true)).catch(() => setReady(true))
    it.onAligned = () => setAligned(true)
    it.onFrame = (project) => {
      if (!it.aligned) return
      CALLOUTS.forEach((c, i) => {
        const node = labels.current[i]
        if (!node) return
        const p = project(c.to.x, c.to.y)
        const flip = p.x + 12 + node.offsetWidth > el.clientWidth - 8 // a tag that would run off the edge hangs to the left
        node.classList.toggle('flip', flip)
        node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)${flip ? ' translateX(-100%)' : ''}`
        node.style.opacity = p.visible ? '1' : '0'
      })
    }
    it.setSun(0.08)
    const io = new IntersectionObserver(([e]) => it.setActive(e.isIntersecting), { threshold: 0 })
    io.observe(sec)
    let last = 0
    const off = storyProgress(sec, (p) => {
      it.setSun(0.08 + p * 0.88)
      const ph = phaseOf(p)
      if (ph >= 1 && !it.aligned) it.setNorth() // scrolling on is setting north: the acts need it
      it.setDisc(ph >= 2 ? 'gates32' : 'zones16')
      it.setSheet(ph === 3 ? 'grid9' : ph === 2 ? 'gates32' : it.aligned || ph >= 1 ? 'zones16' : 'plain')
      it.setMandala(ph === 3)
      it.setDolly(ph === 0 ? 0 : 1)
      if (ph !== last) { last = ph; setPhase(ph) }
    })
    return () => { off(); io.disconnect(); it.dispose(); inst.current = null }
    }
    return () => { cancelled = true; cleanup?.() }
  }, [live])

  return (
    <section className={`act ${live ? 'live' : 'still'} ${ready ? 'ready' : ''} ${aligned ? 'aligned' : ''} ${phase <= 1 ? 'tags-on' : ''}`} id="top" ref={section} data-nav="ink" style={live ? { height: '520vh' } : undefined}>
      <div className="act-pin">
        <div className="act-stage" ref={stage}>
          {!live && <PlanStage state={FINAL_STATE} paper={false} className="act-fallback" />}
        </div>

        {/* verdict tags ride on the paper once north is set */}
        {live && (
          <div className="act-labels" aria-hidden="true">
            {CALLOUTS.map((c, i) => (
              <span key={c.id} ref={(n) => { labels.current[i] = n }} className={`tag v-${c.verdict}`}>
                <b>{c.label}</b><i>{c.verdict}</i><small>{c.where}</small>
              </span>
            ))}
          </div>
        )}

        {live && (
          <div className={`act-prompt ${phase === 0 ? 'on' : ''}`}>
            {!aligned ? (
              <>
                <RotateCw size={16} aria-hidden="true" />
                <span>Turn the chakra until its north meets the drawing’s arrow.</span>
                <button type="button" onClick={() => inst.current?.setNorth()}>Set north for me</button>
              </>
            ) : (
              <span className="act-set">North set at 8°. Five rooms read.</span>
            )}
          </div>
        )}

        <div className="act-copy">
          <div className={`act-open ${phase === 0 ? 'on' : ''}`} data-hero-copy>
            <h1 data-hero-title>Vastu Studio</h1>
            <p className="act-lede">The instrument for Vastu practitioners. Lay the chakra over any plan, set north, and read every room to the degree — with a verdict and the move that fixes it.</p>
            <div className="hero-ctas">
              <a className="btn-gold lg" href={DOWNLOADS.windows}><Monitor size={17} aria-hidden="true" /> Download for Windows</a>
              <a className="btn-line lg" href={DOWNLOADS.android}><Smartphone size={17} aria-hidden="true" /> Get it on Android</a>
            </div>
            <p className="hero-note"><a href={APP_URL}>{returning ? 'Back to the studio' : 'Open the studio in your browser'}</a> · version {version}</p>
          </div>
          {ACTS.map((a, i) => (
            <div key={a.key} className={`act-card ${phase === i + 1 ? 'on' : ''}`} aria-hidden={phase !== i + 1}>
              <div className="act-num"><span>{a.num}</span><em>{a.word}</em></div>
              <p>{a.body}</p>
              {i === ACTS.length - 1 && <a className="act-next" href="#read">What the studio says <ArrowRight size={16} aria-hidden="true" /></a>}
            </div>
          ))}
        </div>
        {!live && (
          <ol className="act-still-list">
            {ACTS.map((a) => <li key={a.key}><b>{a.num}</b> <span>{a.word}</span><p>{a.body}</p></li>)}
          </ol>
        )}
      </div>
    </section>
  )
}
