import { useStore } from '../store'
import type { Tool } from '../types'

export interface StepInfo {
  id: 'import' | 'outline' | 'scale' | 'north' | 'analyse'
  label: string
  /** one-line plain-language instruction shown in the guide while this step is next */
  hint: string
  cta: string
  done: boolean
}

/**
 * The practitioner journey as one shared model — the top-bar stepper, the
 * mobile chip and the guide card all read the same truth. Map imports
 * auto-complete scale and north, so the list shortens itself for that path.
 */
export function useSteps(): { steps: StepInfo[]; active: number } {
  const bg = useStore((s) => s.bg.kind !== 'none')
  const closed = useStore((s) => s.closed)
  const scaled = useStore((s) => s.metersPerPx != null)
  const north = useStore((s) => s.northSource != null)
  const compassOn = useStore((s) => s.compass.id !== 'none')

  const steps: StepInfo[] = [
    {
      id: 'import',
      label: 'Import',
      hint: 'Bring in the floor plan — a PDF, photo, AutoCAD file, or straight from the satellite map.',
      cta: 'Choose a plan',
      done: bg,
    },
    {
      id: 'outline',
      label: 'Outline',
      hint: 'Tap each corner of the boundary, then the tick to close it. Two fingers pan and zoom.',
      cta: 'Trace the boundary',
      done: closed,
    },
    {
      id: 'scale',
      label: 'Scale',
      hint: 'Drag the ruler along any wall you know the length of, and type that length.',
      cta: 'Set the scale',
      done: scaled,
    },
    {
      id: 'north',
      label: 'North',
      hint: "Tap the tail of the plan's north arrow, then its tip — or fine-tune by degrees.",
      cta: 'Align north',
      done: north,
    },
    {
      id: 'analyse',
      label: 'Analyse',
      hint: 'Lay the 16-zone compass on the centre and read zones, gates and the Brahmasthan.',
      cta: 'Show the compass',
      done: closed && compassOn,
    },
  ]
  return { steps, active: steps.findIndex((s) => !s.done) }
}

/** Fire the right action for a step (shared by stepper, chip and guide card). */
export function goToStep(id: StepInfo['id']): void {
  const s = useStore.getState()
  const arm = (t: Tool) => {
    if (s.locked) s.toast('Editing is locked — unlock it in the top bar first', 'warn')
    s.setTool(t)
  }
  if (id === 'import') window.dispatchEvent(new CustomEvent('vastu:open-file'))
  else if (id === 'outline') arm('trace')
  else if (id === 'scale') arm('calibrate')
  else if (id === 'north') arm('north')
  else if (id === 'analyse') {
    if (!s.closed) {
      s.toast('Close the outline first — the compass sits on its centre', 'warn')
      arm('trace')
      return
    }
    s.setCompass({ id: 'zones16' })
    s.setTool('select')
  }
}
