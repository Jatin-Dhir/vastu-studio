import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { dist } from '../geometry'
import { M_PER_FT, formatScale } from '../format'

export function Dialog(props: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose() }}>
      <div className="dialog" style={props.width ? { width: props.width, maxWidth: 'calc(100vw - 20px)' } : undefined}>
        <div className="dialog-head">
          <h3>{props.title}</h3>
          <button className="icon-btn" onClick={props.onClose}><X size={15} /></button>
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

  const close = () => {
    useStore.getState().setCalDialogOpen(false)
    useStore.getState().setCal(null, null)
  }

  const apply = () => {
    const v = parseFloat(value.replace(',', '.'))
    const s = useStore.getState()
    if (!isFinite(v) || v <= 0) { s.toast('Enter the real length of the drawn line', 'warn'); return }
    const toM = CAL_UNITS.find((u) => u.id === calUnit)?.toM ?? 1
    const metersPerPx = (v * toM) / px
    s.setMetersPerPx(metersPerPx, 'manual')
    s.setCalDialogOpen(false)
    s.setCal(null, null)
    const next = s.pts.length === 0 ? ' Now trace the boundary.' : ''
    s.toast(`Scale set (${formatScale(metersPerPx, s.unit)}).${next}`, 'ok')
    if (s.pts.length === 0) s.setTool('trace')
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
