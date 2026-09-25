import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Monitor, Smartphone } from 'lucide-react'
import { FINAL_STATE, PlanStage, type StageState } from './HeroPlan'
import { reducedMotion, storyProgress } from './motion'
import { APP_URL, DOWNLOADS } from './config'

/* The opening and the story are one pinned stage. The first viewport is the title over the
 * imported drawing; scrolling then traces the boundary corner by corner, lays the zones, judges
 * the rooms, switches to the thirty-two gates and to the mandala — the whole workflow, performed
 * by the product's own renderer, at the pace of the reader's thumb. */

const STEPS = [
  { n: '01', key: 'trace', label: 'Trace', title: <>Trace the <em>boundary.</em></>, body: 'Tap the corners of the plot. Fifteen-degree snapping keeps the walls true, a curved wall bends with a drag, and the centre is found by area — never by eye.' },
  { n: '02', key: 'zones', label: 'Zones', title: <>Read the <em>sixteen zones.</em></>, body: 'Clipped to the plot, the Brahmasthan at the centre, north set from the plan’s own arrow. Every wall reads in feet or metres.' },
  { n: '03', key: 'judge', label: 'Verdicts', title: <>A verdict for <em>every room.</em></>, body: 'Mark a room and the studio measures how much of it sits in which zone, judges the seat against the charts, and names the move that fixes it.' },
  { n: '04', key: 'gates', label: 'Gates', title: <>Thirty-two <em>gates.</em></>, body: 'The entrance tied to its pada — N2 Naga on this plan — with the favourable gates on the same wall named beside it.' },
  { n: '05', key: 'grid', label: 'Mandala', title: <>The nine-by-nine <em>mandala.</em></>, body: 'Fitted to the plot’s own orientation, all forty-five devtas in place, ready for the report.' },
]
const SLOTS = STEPS.length + 1 // the opening, then a slot per step

function stateFor(slot: number, local: number): StageState {
  if (slot === 0) return { corners: 0, closed: false, overlay: 'none', rooms: false, callouts: 'none' }
  if (slot === 1) {
    const corners = Math.min(6, Math.floor(local * 7.5))
    return { corners, closed: local > 0.9, overlay: 'none', rooms: false, callouts: 'none' }
  }
  return {
    corners: 6, closed: true,
    overlay: slot <= 3 ? 'zones16' : slot === 4 ? 'gates32' : 'grid9',
    rooms: slot >= 3,
    callouts: slot === 3 ? 'all' : slot === 4 ? 'door' : 'none',
  }
}
const same = (a: StageState, b: StageState) => a.corners === b.corners && a.closed === b.closed && a.overlay === b.overlay && a.rooms === b.rooms && a.callouts === b.callouts

export function Story({ version, returning }: { version: string; returning: boolean }) {
  const section = useRef<HTMLElement>(null)
  const [slot, setSlot] = useState(reducedMotion ? 3 : 0)
  const [state, setState] = useState<StageState>(reducedMotion ? FINAL_STATE : stateFor(0, 0))
  const last = useRef({ slot: reducedMotion ? 3 : 0, state })

  useEffect(() => {
    const el = section.current
    if (!el || reducedMotion) return
    return storyProgress(el, (p) => {
      const s = Math.min(STEPS.length, Math.floor(p * SLOTS))
      const local = p * SLOTS - s
      const next = stateFor(s, local)
      if (s !== last.current.slot) { last.current.slot = s; setSlot(s) }
      if (!same(next, last.current.state)) { last.current.state = next; setState(next) }
    })
  }, [])

  return (
    <section className={`story ${reducedMotion ? 'static' : ''}`} id="top" ref={section} data-nav="ink" style={reducedMotion ? undefined : { height: `${SLOTS * 100 + 40}vh` }}>
      <div className="story-pin">
        <ol className="story-rail" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s.key} className={slot === i + 1 ? 'on' : slot > i + 1 ? 'done' : ''}><span>{s.n}</span>{s.label}</li>
          ))}
        </ol>

        <div className="story-copy">
          <div className={`story-open ${slot === 0 ? 'on' : ''}`} data-hero-copy>
            <p className="eyebrow" data-hero-eyebrow>For Vastu practitioners</p>
            <h1 data-hero-title>The drawing board <em>for Vastu.</em></h1>
            <p className="hero-sub">Import a floor plan, trace its boundary, and the sixteen zones, thirty-two gates and the Brahmasthan are laid over it to scale — with a verdict, in percentages, for every room you mark.</p>
            <div className="hero-ctas">
              <a className="btn-gold lg" href={DOWNLOADS.windows}><Monitor size={17} aria-hidden="true" /> Download for Windows</a>
              <a className="btn-line lg" href={DOWNLOADS.android}><Smartphone size={17} aria-hidden="true" /> Get it on Android</a>
            </div>
            <p className="hero-note"><a href={APP_URL}>{returning ? 'Back to the studio' : 'Open the studio in your browser'}</a> · version {version}</p>
            {!reducedMotion && <p className="hero-scroll" aria-hidden="true"><span /> Scroll to trace the plan</p>}
          </div>

          {STEPS.map((s, i) => (
            <article key={s.key} className={`story-card ${slot === i + 1 ? 'on' : slot > i + 1 ? 'past' : ''}`} aria-hidden={slot !== i + 1}>
              <span className="story-num">{s.n}</span>
              <h2>{s.title}</h2>
              <p>{s.body}</p>
              {i === STEPS.length - 1 && (
                <a className="story-next" href="#read">See the verdicts <ArrowRight size={16} aria-hidden="true" /></a>
              )}
            </article>
          ))}
        </div>

        <div className="story-stage" data-zoom={slot <= 1 ? 'in' : 'out'}>
          <PlanStage state={state} paper={false} drawIn />
        </div>
      </div>
    </section>
  )
}
