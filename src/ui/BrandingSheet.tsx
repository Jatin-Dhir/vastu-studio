import { useId, useRef, useState } from 'react'
import type { ClipboardEvent as ReactClipboardEvent, DragEvent as ReactDragEvent } from 'react'
import { ImagePlus } from 'lucide-react'
import { hasBranding, useStore } from '../store'
import { COARSE } from '../platform'
import { LOGO_ACCEPT, logoErrorText, readLogo } from '../brandLogo'
import { useModalFocus } from './useModalFocus'

/** Room the footer line gets in the exports; the field stops here so it always fits. */
const LINE_MAX = 90

/**
 * Footer & logo: the practitioner's own line ("By …") with their logo below it, printed at the
 * foot of every PDF page and under every exported PNG. The preview at the top is the PDF page
 * foot drawn small, so what is typed here is seen exactly where it will print.
 */
export function BrandingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const branding = useStore((s) => s.branding)
  const setBranding = useStore((s) => s.setBranding)
  const projectName = useStore((s) => s.projectName)
  const boxRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const lineId = useId()
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  // on a phone, opening straight into the field would throw the keyboard over the preview
  useModalFocus(boxRef, onClose, { active: open, initial: COARSE ? boxRef : undefined })

  if (!open) return null

  const line = branding.footer.trim()
  const logo = branding.logo
  const branded = hasBranding(branding)

  const take = async (file: File) => {
    setReading(true)
    try {
      const out = await readLogo(file)
      setBranding({ logo: out.dataUrl, logoW: out.w, logoH: out.h })
    } catch (err) {
      useStore.getState().toast(logoErrorText(err), 'warn')
    } finally {
      setReading(false)
    }
  }
  const removeLogo = () => {
    const prev = { logo: branding.logo, logoW: branding.logoW, logoH: branding.logoH }
    setBranding({ logo: null, logoW: 0, logoH: 0 })
    useStore.getState().toast('Logo removed', 'info', 'Undo', () => useStore.getState().setBranding(prev))
  }

  // a logo dropped or pasted anywhere on the sheet is the logo, never a plan to import
  const onDragOver = (e: ReactDragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault(); e.stopPropagation()
    setDragging(true)
  }
  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void take(f)
  }
  const onPaste = (e: ReactClipboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    for (const it of e.clipboardData.items) {
      const f = it.kind === 'file' && it.type.startsWith('image/') ? it.getAsFile() : null
      if (f) { e.preventDefault(); e.stopPropagation(); void take(f); return }
    }
  }

  // the PDF's own rule: a line and a logo stack, a logo alone takes the line's place
  const logoInRow = !!logo && !line
  return (
    <div className="asheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      onDragOver={onDragOver} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div ref={boxRef} className={`asheet brand-sheet ${dragging ? 'dragging' : ''}`} role="dialog" aria-modal="true"
        aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()} onPaste={onPaste}>
        <div className="asheet-head">
          <span id={titleId}>Footer & logo</span>
        </div>

        <figure className="brand-preview" aria-label="Preview of a report page’s foot">
          <div className="brand-preview-row">
            <span className="brand-preview-side">{projectName} — Vastu analysis</span>
            <span className={`brand-preview-centre ${branded ? '' : 'stock'}`}>
              {logoInRow ? <img src={logo} alt="" /> : line || (branded ? '' : 'Vastu Studio')}
            </span>
            <span className="brand-preview-side end">Page 1 of 3</span>
          </div>
          {logo && !logoInRow && <img className="brand-preview-logo" src={logo} alt="" />}
        </figure>
        <p className="appearance-hint brand-hint">
          {branded ? 'At the foot of every PDF page and under every PNG you export.' : 'Add a line, a logo or both. They print at the foot of every PDF page and under every PNG.'}
        </p>

        <div className="appearance-section">
          <label className="appearance-label" htmlFor={lineId}>Footer line</label>
          <input id={lineId} className="marker-note brand-input" type="text" value={branding.footer} maxLength={LINE_MAX}
            placeholder="By your name, Vastu consultant" autoComplete="off" enterKeyHint="done"
            onChange={(e) => setBranding({ footer: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        </div>

        <div className="appearance-section">
          <span className="appearance-label">Logo</span>
          {logo ? (
            <div className="brand-logo-row">
              <span className="brand-logo-thumb"><img src={logo} alt="Your logo" /></span>
              <button className="btn-ghost" disabled={reading} onClick={() => fileRef.current?.click()}>
                {reading ? 'Reading…' : 'Replace'}
              </button>
              <button className="btn-ghost" disabled={reading} onClick={removeLogo}>Remove</button>
            </div>
          ) : (
            <button className="brand-drop" disabled={reading} onClick={() => fileRef.current?.click()}>
              <span className="asheet-ic"><ImagePlus size={17} strokeWidth={1.9} /></span>
              <span className="asheet-text">
                <b>{reading ? 'Reading the logo…' : 'Add a logo'}</b>
                <small>{COARSE ? 'PNG or JPG' : 'PNG or JPG, or drop the file here'}</small>
              </span>
            </button>
          )}
          <input ref={fileRef} type="file" accept={LOGO_ACCEPT} hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void take(f) }} />
        </div>

        <button className="btn-primary appearance-done" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
