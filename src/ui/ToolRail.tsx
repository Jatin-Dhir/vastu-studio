import { Crosshair, Map as MapIcon, MapPin, MousePointer2, Navigation, Pencil, PenLine, Ruler, Trash2, Upload } from 'lucide-react'
import { useStore } from '../store'
import type { Tool } from '../types'

// ordered to match the taught journey — outline first, then scale/north, then the payoff tools
const TOOLS: { id: Tool; icon: typeof MousePointer2; label: string; short: string; kbd: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select · Pan', short: 'Select', kbd: 'V' },
  { id: 'trace', icon: PenLine, label: 'Trace outline', short: 'Trace', kbd: 'T' },
  { id: 'calibrate', icon: Ruler, label: 'Set scale', short: 'Scale', kbd: 'C' },
  { id: 'north', icon: Navigation, label: 'Align north — tap the plan arrow, tail then tip', short: 'North', kbd: 'N' },
  { id: 'marker', icon: MapPin, label: 'Mark rooms, doors & objects', short: 'Mark', kbd: 'P' },
  { id: 'draw', icon: Pencil, label: 'Draw on the plan — pen & straight lines', short: 'Draw', kbd: 'D' },
  { id: 'center', icon: Crosshair, label: 'Move the centre — only if the auto-centre looks off', short: 'Centre', kbd: 'M' },
]

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
      {TOOLS.map(({ id, icon: Icon, label, short, kbd }) => (
        <button
          key={id}
          className={`rail-btn ${tool === id ? 'on' : ''}`}
          disabled={!hasBg && id !== 'select'}
          onClick={need(() => setTool(id))}
          data-tip={`${label}  ·  ${kbd}`}
        >
          <Icon size={17} />
          <span className="rail-label">{short}</span>
        </button>
      ))}
      <div className="hsep" />
      <button className="rail-btn hide-mobile" data-tip="Import PDF / DXF / image"
        onClick={() => window.dispatchEvent(new CustomEvent('vastu:open-file'))}>
        <Upload size={17} />
        <span className="rail-label">Import</span>
      </button>
      <button className="rail-btn hide-mobile" data-tip="Import from Maps"
        onClick={() => setMapOpen(true)}>
        <MapIcon size={17} />
        <span className="rail-label">Maps</span>
      </button>
      <div className="hsep hide-mobile" />
      <button className="rail-btn danger hide-mobile" data-tip="Start fresh — clears plan, outline & scale"
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
