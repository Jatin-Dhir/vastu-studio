import { Crosshair, Map as MapIcon, MousePointer2, Navigation, PenLine, Ruler, Upload } from 'lucide-react'
import { useStore } from '../store'
import type { Tool } from '../types'

const TOOLS: { id: Tool; icon: typeof MousePointer2; label: string; kbd: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select · Pan', kbd: 'V' },
  { id: 'calibrate', icon: Ruler, label: 'Set scale', kbd: 'C' },
  { id: 'trace', icon: PenLine, label: 'Trace outline', kbd: 'T' },
  { id: 'center', icon: Crosshair, label: 'Pin centre', kbd: 'M' },
  { id: 'north', icon: Navigation, label: 'Align north — tap the plan arrow, tail then tip', kbd: 'N' },
]

export function ToolRail() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const setMapOpen = useStore((s) => s.setMapOpen)

  return (
    <div className="tool-rail">
      {TOOLS.map(({ id, icon: Icon, label, kbd }) => (
        <button
          key={id}
          className={`rail-btn ${tool === id ? 'on' : ''}`}
          onClick={() => setTool(id)}
          data-tip={`${label}  ·  ${kbd}`}
        >
          <Icon size={17} />
        </button>
      ))}
      <div className="hsep" />
      <button className="rail-btn" data-tip="Import PDF / DXF / image"
        onClick={() => window.dispatchEvent(new CustomEvent('vastu:open-file'))}>
        <Upload size={17} />
      </button>
      <button className="rail-btn" data-tip="Import from Maps"
        onClick={() => setMapOpen(true)}>
        <MapIcon size={17} />
      </button>
    </div>
  )
}
