import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface SheetRow {
  icon: LucideIcon
  label: string
  sub?: string
  danger?: boolean
  disabled?: boolean
  /** custom control rendered at the row's right edge (e.g. a segmented toggle) */
  right?: ReactNode
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
  if (!open) return null
  return (
    <div className="asheet-scrim" onClick={onClose}>
      <div className="asheet" role="menu" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="asheet-head">
          <span>{title}</span>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>
        {rows.map((r) => (
          <button
            key={r.label}
            className={`asheet-row ${r.danger ? 'danger' : ''}`}
            disabled={r.disabled}
            onClick={() => {
              if (r.onTap) {
                onClose()
                r.onTap()
              }
            }}
          >
            <span className="asheet-ic"><r.icon size={17} strokeWidth={1.9} /></span>
            <span className="asheet-text">
              <b>{r.label}</b>
              {r.sub && <small>{r.sub}</small>}
            </span>
            {r.right}
          </button>
        ))}
      </div>
    </div>
  )
}
