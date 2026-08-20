import { useEffect, useRef, useState } from 'react'
import { Check, Lock, LockOpen, Navigation, Plus, Spline, Trash2, X } from 'lucide-react'
import { useStore } from '../store'
import { edgePoint } from '../geometry'
import { NorthDial } from './NorthDial'
import { COMPASS_META } from '../vastu'
import type { CompassId } from '../types'

const PILLS: { id: CompassId; label: string }[] = [
  { id: 'zones16', label: '16' },
  { id: 'gates32', label: '32' },
  { id: 'chakra8', label: '8' },
  { id: 'grid9', label: 'Grid' },
  { id: 'dial', label: 'Dial' },
]

/** Floating compass switcher + degree pill + lock, top-centre of the canvas. */
export function QuickBar() {
  const closed = useStore((s) => s.closed)
  const hasBg = useStore((s) => s.bg.kind !== 'none')
  const compassId = useStore((s) => s.compass.id)
  const customUrl = useStore((s) => s.compass.customUrl)
  const setCompass = useStore((s) => s.setCompass)
  const northDeg = useStore((s) => s.northDeg)
  const setNorth = useStore((s) => s.setNorth)
  const locked = useStore((s) => s.locked)
  const setLocked = useStore((s) => s.setLocked)
  const setTool = useStore((s) => s.setTool)
  const [degOpen, setDegOpen] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!degOpen) return
    const onDown = (e: PointerEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setDegOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [degOpen])

  if (!closed || !hasBg) return null

  const pills = customUrl ? [...PILLS, { id: 'custom' as CompassId, label: 'Own' }] : PILLS

  return (
    <div className="quickbar" ref={popRef}>
      <div className="quickbar-row">
        {pills.map((p) => (
          <button
            key={p.id}
            className={`qpill ${compassId === p.id ? 'on' : ''}`}
            title={COMPASS_META.find((m) => m.id === p.id)?.label}
            onClick={() => setCompass({ id: compassId === p.id ? 'none' : p.id })}
          >
            {p.label}
          </button>
        ))}
        <span className="qsep" />
        <button className={`qpill deg ${degOpen ? 'on' : ''}`} onClick={() => setDegOpen(!degOpen)}>
          N {northDeg}°
        </button>
        <button className={`qpill lockpill ${locked ? 'on' : ''}`}
          title={locked ? 'Unlock editing' : 'Lock outline, scale & centre'}
          onClick={() => setLocked(!locked)}>
          {locked ? <Lock size={13} /> : <LockOpen size={13} />}
        </button>
      </div>

      {degOpen && (
        <div className="deg-pop">
          <NorthDial size={96} />
          <div className="deg-steppers">
            {[-5, -0.5, 0.5, 5].map((d) => (
              <button key={d} className="chip"
                onClick={() => setNorth(useStore.getState().northDeg + d)}>
                {d > 0 ? `+${d}` : d}°
              </button>
            ))}
          </div>
          <div className="deg-steppers">
            <button className="chip" onClick={() => { setDegOpen(false); setTool('north') }}>
              <Navigation size={11} /> From plan arrow
            </button>
            <button className="chip" onClick={() => setNorth(0)}>0°</button>
            <button className="chip" onClick={() => setDegOpen(false)}><X size={11} /> Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** One-tap close button while tracing — no need to hit the first point precisely. */
export function CloseChip() {
  const tool = useStore((s) => s.tool)
  const closed = useStore((s) => s.closed)
  const n = useStore((s) => s.pts.length)
  const locked = useStore((s) => s.locked)
  if (locked || closed || tool !== 'trace' || n < 3) return null
  return (
    <button className="close-chip" onClick={() => useStore.getState().closePolygon()}>
      <Check size={15} /> Close outline · {n} points
    </button>
  )
}

/** Contextual actions for a tapped vertex or edge handle. */
export function SelectionChips() {
  const selectedVertex = useStore((s) => s.selectedVertex)
  const selectedEdge = useStore((s) => s.selectedEdge)
  const pts = useStore((s) => s.pts)
  const bulges = useStore((s) => s.bulges)
  const view = useStore((s) => s.view)
  const locked = useStore((s) => s.locked)

  if (locked) return null
  const st = useStore.getState()

  let world = null as { x: number; y: number } | null
  if (selectedVertex != null && pts[selectedVertex]) world = pts[selectedVertex]
  else if (selectedEdge != null && pts.length >= 2) {
    const p1 = pts[selectedEdge], p2 = pts[(selectedEdge + 1) % pts.length]
    if (p1 && p2) world = edgePoint(p1, p2, bulges[selectedEdge] ?? 0, 0.5)
  }
  if (!world) return null

  const sx = world.x * view.k + view.tx
  const sy = world.y * view.k + view.ty
  const clear = () => st.setSelection({ vertex: null, edge: null })

  return (
    <div className="sel-chips" style={{
      left: Math.max(8, Math.min(sx, (window.innerWidth || 800) - 180)),
      top: Math.max(60, sy - 54),
    }}>
      {selectedVertex != null && (
        <button className="chip danger" onClick={() => {
          st.deletePoint(selectedVertex)
          clear()
        }}>
          <Trash2 size={12} /> Delete point
        </button>
      )}
      {selectedEdge != null && (
        <>
          <button className="chip" onClick={() => {
            const p1 = st.pts[selectedEdge], p2 = st.pts[(selectedEdge + 1) % st.pts.length]
            st.insertPoint(selectedEdge + 1, edgePoint(p1, p2, st.bulges[selectedEdge] ?? 0, 0.5))
            clear()
          }}>
            <Plus size={12} /> Add point
          </button>
          {Math.abs(bulges[selectedEdge] ?? 0) > 1e-4 && (
            <button className="chip" onClick={() => {
              st.pushHistory()
              st.setBulge(selectedEdge, 0)
              clear()
            }}>
              <Spline size={12} /> Straighten
            </button>
          )}
        </>
      )}
      <button className="chip" onClick={clear}><X size={12} /></button>
    </div>
  )
}
