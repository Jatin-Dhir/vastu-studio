import { useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useModalFocus } from './useModalFocus'

export interface SheetRow {
  icon: LucideIcon
  label: string
  sub?: string
  danger?: boolean
  disabled?: boolean
  /** custom control rendered at the row's right edge (e.g. a segmented toggle) */
  right?: ReactNode
  /** keep the sheet open after onTap — for toggles whose new state shows in the row */
  keepOpen?: boolean
  onTap?: () => void
}

/**
 * A phone-grade action sheet: scrim + bottom card of big labelled rows.
 * Rows describe their state in the sub-line, so the sheet doubles as a
 * status readout, not just a menu.
 */
export function ActionSheet({
  open,
  title,
  rows,
  onClose,
}: {
  open: boolean
  title: string
  rows: SheetRow[]
  onClose: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useModalFocus(boxRef, onClose, { active: open })
  if (!open) return null
  return (
    <div className="asheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={boxRef} className="asheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        onClick={(e) => e.stopPropagation()}>
        <div className="asheet-head">
          <span id={titleId}>{title}</span>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>
        {rows.map((r) => {
          const tap = () => {
            if (r.onTap) {
              if (!r.keepOpen) onClose()
              r.onTap()
            }
          }
          const body = (
            <>
              <span className="asheet-ic"><r.icon size={17} strokeWidth={1.9} /></span>
              <span className="asheet-text">
                <b>{r.label}</b>
                {r.sub && <small>{r.sub}</small>}
              </span>
              {r.right}
            </>
          )
          // a row carrying its own control can't itself be a button (a button inside a button
          // is invalid) — that control is the keyboard path; a tap elsewhere on the row still works
          return r.right ? (
            <div key={r.label} className={`asheet-row ${r.danger ? 'danger' : ''}`} onClick={tap}
              style={r.onTap ? { cursor: 'pointer', userSelect: 'none', touchAction: 'manipulation' } : undefined}>
              {body}
            </div>
          ) : (
            <button key={r.label} className={`asheet-row ${r.danger ? 'danger' : ''}`} disabled={r.disabled} onClick={tap}>
              {body}
            </button>
          )
        })}
      </div>
    </div>
  )
}
