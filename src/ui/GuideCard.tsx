import { useEffect, useState } from 'react'
import { ArrowRight, Check, X } from 'lucide-react'
import { useStore } from '../store'
import { goToStep, useSteps } from './steps'

const HIDE_KEY = 'vastu.guide.hidden'

/**
 * The guide: a live checklist that walks a first-timer through the whole
 * journey — always says what to do next in plain words, ticks itself off,
 * and gets out of the way the moment the plan is analysed (or dismissed).
 * The step chip in the top bar brings it back.
 */
export function GuideCard() {
  const { steps, active } = useSteps()
  const hasBg = useStore((s) => s.bg.kind !== 'none')
  const tool = useStore((s) => s.tool)
  const sheetPos = useStore((s) => s.sheetPos)
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(HIDE_KEY) === '1')

  // re-open requests from the step chip
  useEffect(() => {
    const show = () => {
      sessionStorage.removeItem(HIDE_KEY)
      setHidden(false)
    }
    window.addEventListener('vastu:show-guide', show)
    return () => window.removeEventListener('vastu:show-guide', show)
  }, [])

  // the guide never fights the canvas: hidden while actively tracing/adjusting,
  // finished, dismissed, before any import, or under an open sheet
  const working = tool !== 'select'
  if (hidden || !hasBg || active === -1 || working || sheetPos === 'full') return null

  const step = steps[active]

  return (
    <aside className="guide-card" aria-label="Next step">
      <div className="guide-rows">
        {steps.map((s, i) => (
          <button
            key={s.id}
            className={`guide-row ${s.done ? 'done' : ''} ${i === active ? 'now' : ''}`}
            onClick={() => goToStep(s.id)}
          >
            <span className="guide-dot">{s.done ? <Check size={10} strokeWidth={3.5} /> : i + 1}</span>
            <span className="guide-name">{s.label}</span>
          </button>
        ))}
        <button className="guide-close" aria-label="Hide the guide" onClick={() => {
          sessionStorage.setItem(HIDE_KEY, '1')
          setHidden(true)
        }}>
          <X size={13} strokeWidth={2.4} />
        </button>
      </div>
      <p className="guide-hint">{step.hint}</p>
      <button className="guide-cta" onClick={() => goToStep(step.id)}>
        {step.cta} <ArrowRight size={14} strokeWidth={2.4} />
      </button>
    </aside>
  )
}
