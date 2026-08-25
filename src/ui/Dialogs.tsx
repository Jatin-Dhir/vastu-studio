import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { dist } from '../geometry'
import { M_PER_FT, formatScale } from '../format'
import { haptic } from '../native'

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function Dialog(props: { title: string; onClose: () => void; children: React.ReactNode; width?: number; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    boxRef.current?.focus()
    return () => prev?.focus()
  }, [])
  // keep Tab inside the dialog — the scrim only blocks pointers, not focus
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !boxRef.current) return
    const items = boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && (e.target === first || e.target === boxRef.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && e.target === last) { e.preventDefault(); first.focus() }
  }
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose() }}>
      <div ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={props.title} onKeyDown={trapTab}
        className={`dialog ${props.className ?? ''}`} style={props.width ? { width: props.width, maxWidth: 'calc(100vw - 20px)' } : undefined}>
        <div className="dialog-head">
          <h3>{props.title}</h3>
          <button className="icon-btn" aria-label="Close" onClick={props.onClose}><X size={15} /></button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

const CAL_UNITS = [
  { id: 'ft', label: 'feet', toM: M_PER_FT },
  { id: 'm', label: 'metres', toM: 1 },
  { id: 'in', label: 'inches', toM: 0.0254 },
  { id: 'cm', label: 'cm', toM: 0.01 },
] as const

export function CalibrateDialog() {
  const open = useStore((s) => s.calDialogOpen)
  const calA = useStore((s) => s.calA)
  const calB = useStore((s) => s.calB)
  const unit = useStore((s) => s.unit)
  const [value, setValue] = useState('')
  const [calUnit, setCalUnit] = useState<string>(unit)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue('')
      setCalUnit(useStore.getState().unit)
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  if (!open || !calA || !calB) return null
  const px = dist(calA, calB)

  // closing the dialog keeps the pins — the user may want to fine-tune and reopen
  const close = () => {
    useStore.getState().setCalDialogOpen(false)
  }

  const apply = () => {
    const v = parseFloat(value.replace(',', '.'))
    const s = useStore.getState()
    if (!isFinite(v) || v <= 0) { s.toast('Enter the real length of the drawn line', 'warn'); return }
    const toM = CAL_UNITS.find((u) => u.id === calUnit)?.toM ?? 1
    const metersPerPx = (v * toM) / px
    haptic('success')
    s.setMetersPerPx(metersPerPx, 'manual')
    s.setCalDialogOpen(false)
    s.setCal(null, null)
    const next = s.pts.length === 0 ? ' Now trace the boundary.' : ''
    s.toast(`Scale set (${formatScale(metersPerPx, s.unit)}).${next}`, 'ok')
    if (s.pts.length === 0) s.setTool('trace')
    else s.setTool('select')
  }

  return (
    <Dialog title="Set the real-world scale" onClose={close} width={380}>
      <p className="dialog-sub">
        The line you drew spans <b>{px.toFixed(0)} px</b>. Enter its length on the actual site —
        a wall, a plot side, or a printed dimension you trust.
      </p>
      <div className="cal-row">
        <input
          ref={inputRef}
          type="number" min="0" step="any" placeholder="e.g. 24"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
        />
        <div className="seg">
          {CAL_UNITS.map((u) => (
            <button key={u.id} className={calUnit === u.id ? 'on' : ''} onClick={() => setCalUnit(u.id)}>
              {u.label}
            </button>
          ))}
        </div>
      </div>
      <div className="dialog-actions">
        <button className="btn-ghost" onClick={close}>Cancel</button>
        <button className="btn-primary" onClick={apply}>Apply scale</button>
      </div>
    </Dialog>
  )
}

import { MARKER_KINDS } from '../vastu'
import type { MarkerKind } from '../types'

export function MarkerDialog() {
  const editing = useStore((s) => s.markerEditing)
  const selectedMarker = useStore((s) => s.selectedMarker)
  const markers = useStore((s) => s.markers)
  const m = markers.find((x) => x.id === selectedMarker)
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<MarkerKind>('entrance')

  useEffect(() => {
    if (editing && m) { setLabel(m.label); setNote(m.note ?? ''); setKind(m.kind) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, selectedMarker])

  if (!editing || !m) return null
  const close = () => useStore.getState().setMarkerEditing(false)
  const save = () => {
    useStore.getState().updateMarker(m.id, { label: label.trim() || m.label, note: note.trim() || undefined, kind })
    close()
  }

  return (
    <Dialog title="Edit marker" onClose={close} width={380}>
      <div className="marker-kind-grid">
        {MARKER_KINDS.map((k2) => (
          <button key={k2.kind} className={`chip ${kind === k2.kind ? 'on-gold' : ''}`}
            onClick={() => setKind(k2.kind as MarkerKind)}>
            {k2.name}
          </button>
        ))}
      </div>
      <div className="cal-row">
        <input type="text" value={label} placeholder="Name (e.g. Main door)"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
        <textarea className="marker-note" value={note} rows={3}
          placeholder="Notes / remedy (goes into the report)…"
          onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="dialog-actions">
        <button className="btn-ghost" onClick={close}>Cancel</button>
        <button className="btn-primary" onClick={save}>Save</button>
      </div>
    </Dialog>
  )
}

export function RoomShapeDialog() {
  const editing = useStore((s) => s.roomShapeEditing)
  const selectedRoomShape = useStore((s) => s.selectedRoomShape)
  const roomShapes = useStore((s) => s.roomShapes)
  const r = roomShapes.find((x) => x.id === selectedRoomShape)
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<MarkerKind>('bed')

  useEffect(() => {
    if (editing && r) { setLabel(r.label); setNote(r.note ?? ''); setKind(r.kind) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, selectedRoomShape])

  if (!editing || !r) return null
  const close = () => useStore.getState().setRoomShapeEditing(false)
  const save = () => {
    useStore.getState().updateRoomShape(r.id, { label: label.trim() || r.label, note: note.trim() || undefined, kind })
    close()
  }

  return (
    <Dialog title="Edit room" onClose={close} width={380}>
      <div className="marker-kind-grid">
        {MARKER_KINDS.filter((k2) => k2.kind !== 'entrance').map((k2) => (
          <button key={k2.kind} className={`chip ${kind === k2.kind ? 'on-gold' : ''}`}
            onClick={() => setKind(k2.kind as MarkerKind)}>
            {k2.name}
          </button>
        ))}
      </div>
      <div className="cal-row">
        <input type="text" value={label} placeholder="Name (e.g. Bedroom 2)"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
        <textarea className="marker-note" value={note} rows={3}
          placeholder="Notes / remedy (goes into the report)…"
          onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="dialog-actions">
        <button className="btn-ghost" onClick={close}>Cancel</button>
        <button className="btn-primary" onClick={save}>Save</button>
      </div>
    </Dialog>
  )
}

/** Give a selected line/arrow an exact real-world length — the tip moves, the tail stays. */
export function LineLengthDialog() {
  const open = useStore((s) => s.strokeLenEditing)
  const selectedStroke = useStore((s) => s.selectedStroke)
  const strokes = useStore((s) => s.strokes)
  const metersPerPx = useStore((s) => s.metersPerPx)
  const s2 = strokes.find((x) => x.id === selectedStroke)
  const [value, setValue] = useState('')
  const [lenUnit, setLenUnit] = useState<string>('ft')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && s2 && s2.pts.length >= 2 && metersPerPx) {
      const u = useStore.getState().unit
      const m = dist(s2.pts[0], s2.pts[1]) * metersPerPx
      setLenUnit(u)
      setValue((u === 'ft' ? m / M_PER_FT : m).toFixed(2))
      setTimeout(() => inputRef.current?.select(), 60)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedStroke])

  if (!open || !s2 || s2.pts.length < 2 || !metersPerPx) return null
  const close = () => useStore.getState().setStrokeLenEditing(false)
  const apply = () => {
    const st = useStore.getState()
    const v = parseFloat(value.replace(',', '.'))
    if (!isFinite(v) || v <= 0) { st.toast('Enter the length the line should have', 'warn'); return }
    const toM = CAL_UNITS.find((u) => u.id === lenUnit)?.toM ?? 1
    const [a, b] = s2.pts
    const cur = dist(a, b)
    if (cur < 1e-6) { close(); return }
    const f = (v * toM) / metersPerPx / cur
    st.updateStroke(s2.id, { pts: [a, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }] })
    haptic('light')
    st.setStrokeLenEditing(false)
  }

  return (
    <Dialog title="Set line length" onClose={close} width={380}>
      <p className="dialog-sub">
        The line keeps its direction and start point — only the tip moves to match.
      </p>
      <div className="cal-row">
        <input ref={inputRef} type="number" min="0" step="any" value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply() }} />
        <div className="seg">
          {CAL_UNITS.map((u) => (
            <button key={u.id} className={lenUnit === u.id ? 'on' : ''} onClick={() => setLenUnit(u.id)}>
              {u.label}
            </button>
          ))}
        </div>
      </div>
      <div className="dialog-actions">
        <button className="btn-ghost" onClick={close}>Cancel</button>
        <button className="btn-primary" onClick={apply}>Apply</button>
      </div>
    </Dialog>
  )
}

export function TextDialog() {
  const editing = useStore((s) => s.textEditing)
  const selectedText = useStore((s) => s.selectedText)
  const texts = useStore((s) => s.texts)
  const t = texts.find((x) => x.id === selectedText)
  const [text, setText] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && t) { setText(t.text); setTimeout(() => areaRef.current?.focus(), 60) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, selectedText])

  if (!editing || !t) return null
  const close = () => {
    const st = useStore.getState()
    st.setTextEditing(false)
    // a fresh note cancelled before it ever had content is nothing — remove it
    if (!t.text.trim()) st.deleteText(t.id)
  }
  const save = () => {
    const st = useStore.getState()
    const v = text.trim()
    if (!v) { st.deleteText(t.id); st.setTextEditing(false); return }
    st.updateText(t.id, { text: v })
    st.setTextEditing(false)
  }

  return (
    <Dialog title="Note on the plan" onClose={close} width={380}>
      <div className="cal-row">
        <textarea ref={areaRef} className="marker-note" value={text} rows={3}
          placeholder="e.g. Shift the mirror to the north wall"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() } }} />
      </div>
      <div className="dialog-actions">
        <button className="btn-ghost" onClick={close}>Cancel</button>
        <button className="btn-primary" onClick={save}>Save</button>
      </div>
    </Dialog>
  )
}

const SHORTCUTS: [string, string][] = [
  ['V', 'Select · pan'], ['T', 'Trace outline'], ['R', 'Draw a room or area'], ['P', 'Mark doors & objects'],
  ['D', 'Draw on the plan — pen & lines'],
  ['C', 'Set scale'], ['N', 'Align north'], ['M', 'Pin centre'],
  ['F', 'Fit view'], ['Enter', 'Close outline'], ['Esc / Backspace', 'Undo last point · dismiss'],
  ['Ctrl+Z / Ctrl+Y', 'Undo · redo'], ['Double-click edge', 'Insert point'], ['Right-click point', 'Delete point'],
  ['?', 'This help'],
]

const RECAP = [
  'Import a plan — a PDF, photo, AutoCAD file, or a satellite capture from Maps.',
  'Set the scale — drag the ruler along a wall you know the length of.',
  'Trace the boundary — tap each corner, then the tick to close it.',
  'Confirm north — tap the plan’s north arrow, tail then tip.',
  'Mark doors and rooms — each one gets an instant zone verdict, then open the report.',
]

const GESTURES: [string, string][] = [
  ['Two fingers', 'Pan and pinch-zoom the canvas'],
  ['Twist with two fingers', 'Rotate the view'],
  ['Tap ✓', 'Close the outline'],
  ['Tap a point or edge', 'Select it — chips appear for delete / adjust'],
  ['Drag out a room, hold', 'A perfect square or circle'],
  ['Hold the sheet handle', 'Drag the panel between peek, half and full'],
]

export function ShortcutsDialog() {
  const open = useStore((s) => s.shortcutsOpen)
  const setOpen = useStore((s) => s.setShortcutsOpen)
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  if (!open) return null
  return (
    <Dialog title="Help" onClose={() => setOpen(false)} width={400}>
      <div className="subhead">How it works</div>
      <ol className="dialog-list">
        {RECAP.map((line, i) => <li key={i}>{line}</li>)}
      </ol>
      <div className="subhead">{coarse ? 'Gestures' : 'Keyboard shortcuts'}</div>
      <div className="shortcut-list">
        {(coarse ? GESTURES : SHORTCUTS).map(([keys, what]) => (
          <div key={keys} className="shortcut-row">
            <span className="shortcut-keys">
              {coarse ? keys : keys.split(' / ').map((k2, i) => (
                <span key={k2}>{i > 0 && ' / '}<kbd>{k2}</kbd></span>
              ))}
            </span>
            <span className="lbl">{what}</span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}

export function DwgDialog() {
  const open = useStore((s) => s.dwgNotice)
  const setOpen = useStore((s) => s.setDwgNotice)
  if (!open) return null
  return (
    <Dialog title="DWG is a closed format" onClose={() => setOpen(false)} width={420}>
      <p className="dialog-sub">
        Native <b>.dwg</b> can't be read in the browser. Convert it to <b>.dxf</b> once — everything
        else works the same:
      </p>
      <ul className="dialog-list">
        <li>In AutoCAD: <b>SAVEAS → AutoCAD DXF (*.dxf)</b></li>
        <li>Free option: <b>ODA File Converter</b> (batch DWG → DXF)</li>
        <li>Or print the drawing to <b>PDF</b> and import that instead</li>
      </ul>
      <div className="dialog-actions">
        <button className="btn-primary" onClick={() => setOpen(false)}>Got it</button>
      </div>
    </Dialog>
  )
}
