import { Fragment } from 'react'
import { Crosshair, Map as MapIcon, MapPin, MousePointer2, Navigation, Pencil, PenLine, Ruler, Square, Trash2, Upload } from 'lucide-react'
import { useStore } from '../store'
import type { Tool } from '../types'

interface ToolDef { id: Tool; icon: typeof MousePointer2; label: string; short: string; kbd: string }

// grouped like a real toolbar — setup, then the two ways to draw, then annotate, then fine-tune
const GROUPS: ToolDef[][] = [
  [
    { id: 'select', icon: MousePointer2, label: 'Select · Pan', short: 'Select', kbd: 'V' },
  ],
  [
    { id: 'trace', icon: PenLine, label: 'Trace outline', short: 'Trace', kbd: 'T' },
    { id: 'calibrate', icon: Ruler, label: 'Set scale', short: 'Scale', kbd: 'C' },
    { id: 'north', icon: Navigation, label: 'Align north — tap the plan arrow, tail then tip', short: 'North', kbd: 'N' },
  ],
  [
    { id: 'room', icon: Square, label: 'Draw a room or area — rectangle, circle', short: 'Room', kbd: 'R' },
    { id: 'marker', icon: MapPin, label: 'Mark doors & single objects', short: 'Mark', kbd: 'P' },
    { id: 'draw', icon: Pencil, label: 'Draw on the plan — pen & straight lines', short: 'Draw', kbd: 'D' },
  ],
  [
    { id: 'center', icon: Crosshair, label: 'Move the centre — only if the auto-centre looks off', short: 'Centre', kbd: 'M' },
  ],
]
const TOOLS = GROUPS.flat()

export function ToolRail() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const setMapOpen = useStore((s) => s.setMapOpen)
  const hasBg = useStore((s) => s.bg.kind !== 'none')

  const need = (fn: () => void) => () => {
    if (!hasBg) {
      useStore.getState().toast('Import a plan first — everything else builds on it', 'info')
      window.dispatchEvent(new CustomEvent('vastu:open-file'))
      return
    }
    fn()
  }

  return (
    <div className="tool-rail">
      {GROUPS.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <div className="hsep" />}
          {group.map(({ id, icon: Icon, label, short, kbd }) => (
            <button
              key={id}
              className={`rail-btn ${tool === id ? 'on' : ''}`}
              disabled={!hasBg && id !== 'select'}
              onClick={need(() => setTool(id))}
              data-tip={`${label}  ·  ${kbd}`}
              aria-label={label}
            >
              <Icon size={17} />
              <span className="rail-label">{short}</span>
            </button>
          ))}
        </Fragment>
      ))}
      <div className="hsep" />
      <button className="rail-btn hide-mobile" data-tip="Import PDF / DXF / image" aria-label="Import PDF / DXF / image"
        onClick={() => window.dispatchEvent(new CustomEvent('vastu:open-file'))}>
        <Upload size={17} />
        <span className="rail-label">Import</span>
      </button>
      <button className="rail-btn hide-mobile" data-tip="Import from Maps" aria-label="Import from Maps"
        onClick={() => setMapOpen(true)}>
        <MapIcon size={17} />
        <span className="rail-label">Maps</span>
      </button>
      <div className="hsep hide-mobile" />
      <button className="rail-btn danger hide-mobile" data-tip="Start fresh — clears plan, outline & scale"
        aria-label="Start fresh — clears plan, outline & scale"
        onClick={() => {
          useStore.getState().toast('Clear the plan, outline and scale?', 'warn', 'Clear everything', () => {
            window.dispatchEvent(new CustomEvent('vastu:reset'))
          })
        }}>
        <Trash2 size={17} />
      </button>
    </div>
  )
}
