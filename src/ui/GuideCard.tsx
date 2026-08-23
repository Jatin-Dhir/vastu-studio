import { useEffect, useState } from 'react'
import { ArrowRight, Check, Compass, MapPin, MousePointerClick, X } from 'lucide-react'
import { useStore } from '../store'
import { formatScale } from '../format'
import { goToStep, markReportSeen, useGuide } from './steps'

const HIDE_KEY = 'vastu.guide.hidden'

/**
 * The guide: one calm card that always says what to do next, in plain words,
 * with the action right there. It follows the practitioner's real journey —
 * import → outline → scale → north → compass → markers → report — ticks
 * itself off, and disappears when the work is done (or when dismissed; the
 * step chip in the top bar brings it back).
 */
export function GuideCard() {
  const { track, step } = useGuide()
  const tool = useStore((s) => s.tool)
  const sheetPos = useStore((s) => s.sheetPos)
  const hasBg = useStore((s) => s.bg.kind !== 'none')
  const suggestion = useStore((s) => s.scaleSuggestion)
  const unit = useStore((s) => s.unit)
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(HIDE_KEY) === '1')

  useEffect(() => {
    const show = () => {
      sessionStorage.removeItem(HIDE_KEY)
      setHidden(false)
    }
    window.addEventListener('vastu:show-guide', show)
    return () => window.removeEventListener('vastu:show-guide', show)
  }, [])

  // never fight the canvas: gone while a tool is armed (the tool hint leads),
  // while the sheet is up on phones, before import (EmptyState leads), when done
  if (hidden || !hasBg || step === 'done' || tool !== 'select') return null
  if (sheetPos !== 'peek' && window.innerWidth <= 760) return null

  const s = useStore.getState()
  const dismiss = () => {
    sessionStorage.setItem(HIDE_KEY, '1')
    setHidden(true)
  }

  let hint = ''
  let actions: { label: string; icon?: typeof Check; primary?: boolean; onTap: () => void }[] = []

  if (step === 'outline') {
    hint = 'Trace the boundary: tap each corner, then the tick to close it. Two fingers pan and zoom.'
    actions = [{ label: 'Start tracing', icon: MousePointerClick, primary: true, onTap: () => goToStep('outline') }]
  } else if (step === 'scale') {
    hint = suggestion
      ? `This drawing states its scale (${suggestion.label}). Apply it, or measure a known wall instead.`
      : 'Give the plan real-world size: drag the ruler along a wall you know, and type its length. No known length? Skip — zones work without it.'
    actions = suggestion
      ? [
          {
            label: `Use ${suggestion.label}`,
            primary: true,
            onTap: () => {
              s.setMetersPerPx(suggestion.metersPerPx, 'pdf')
              s.toast(`Scale set — ${formatScale(suggestion.metersPerPx, unit)}`, 'ok')
            },
          },
          { label: 'Measure instead', onTap: () => goToStep('scale') },
          { label: 'Skip', onTap: () => s.setScaleSkipped(true) },
        ]
      : [
          { label: 'Set the scale', primary: true, onTap: () => goToStep('scale') },
          { label: 'Skip for now', onTap: () => s.setScaleSkipped(true) },
        ]
  } else if (step === 'north') {
    hint = 'Which way is north? Tap the tail then the tip of the plan’s north arrow — or confirm that up is north.'
    actions = [
      { label: 'Point at the arrow', primary: true, onTap: () => goToStep('north') },
      {
        label: 'Up is north',
        icon: Check,
        onTap: () => {
          s.setNorth(s.northDeg, 'manual')
          s.toast('North confirmed straight up', 'ok')
        },
      },
    ]
  } else if (step === 'analyse') {
    hint = 'The boundary is set. Lay the 16-zone compass on the centre to see zones, gates and the Brahmasthan.'
    actions = [{
      label: 'Show the compass',
      icon: Compass,
      primary: true,
      onTap: () => {
        s.setCompass({ id: 'zones16' })
        if (window.innerWidth <= 760) s.setSheetPos('half')
      },
    }]
  } else if (step === 'mark') {
    hint = 'Now mark what matters: the main door, kitchen, bedrooms. Each mark gets an instant zone verdict.'
    actions = [{
      label: 'Mark the entrance',
      icon: MapPin,
      primary: true,
      onTap: () => {
        s.setTool('marker')
        if (window.innerWidth <= 760) s.setSheetPos('peek')
      },
    }]
  } else if (step === 'report') {
    hint = 'Everything’s in place — build the client report: findings, zone balance, and the plan to scale.'
    actions = [{
      label: 'Open the report',
      icon: ArrowRight,
      primary: true,
      onTap: () => {
        s.setReportOpen(true)
        markReportSeen()
      },
    }]
  }

  return (
    <aside className="guide-card" aria-label="Guide">
      <div className="guide-rows">
        {track.map((t, i) => (
          <button
            key={t.id}
            className={`guide-row ${t.done ? 'done' : ''} ${t.skipped ? 'skipped' : ''} ${!t.done && !t.skipped && track.findIndex((q) => !q.done && !q.skipped) === i ? 'now' : ''}`}
            onClick={() => goToStep(t.id)}
          >
            <span className="guide-dot">
              {t.done ? <Check size={10} strokeWidth={3.5} /> : t.skipped ? '–' : i + 1}
            </span>
            <span className="guide-name">{t.label}</span>
          </button>
        ))}
        <button className="guide-close" aria-label="Hide the guide" onClick={dismiss}>
          <X size={13} strokeWidth={2.4} />
        </button>
      </div>
      <p className="guide-hint">{hint}</p>
      <div className="guide-actions">
        {actions.map((a) => (
          <button key={a.label} className={a.primary ? 'guide-cta' : 'guide-alt'} onClick={a.onTap}>
            {a.label} {a.icon && <a.icon size={13} strokeWidth={2.4} />}
          </button>
        ))}
      </div>
    </aside>
  )
}
