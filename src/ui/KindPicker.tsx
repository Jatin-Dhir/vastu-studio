import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useStore } from '../store'
import { MARKER_KINDS, markerKindMeta } from '../vastu'
import type { MarkerKind } from '../types'

const GROUPS: { title: string; kinds: MarkerKind[] }[] = [
  { title: 'Rooms', kinds: ['kitchen', 'toilet', 'bed', 'pooja', 'living', 'dining', 'study', 'dressing', 'store', 'staircase', 'guest', 'servant', 'lounge', 'bar', 'guard', 'open'] },
  { title: 'Fixtures & objects', kinds: ['water', 'septic', 'pet', 'tv', 'computer', 'washing', 'dustbin', 'safe', 'music', 'inverter', 'crockery', 'heater', 'ac', 'medicine'] },
  { title: 'Other', kinds: ['entrance', 'custom'] },
]

type Row = { type: 'head'; title: string } | { type: 'item'; kind: MarkerKind; idx: number }

interface Props {
  value: MarkerKind
  onChange: (k: MarkerKind) => void
  /** kinds that make no sense here (a drawn area can't be an entrance) */
  exclude?: MarkerKind[]
  /** how many recently-used kinds ride along as one-click pills (popover mode) */
  recents?: number
  /** render the search + list in place (dialogs) instead of behind a pill */
  inline?: boolean
}

/**
 * One pill showing the armed kind; opens a searchable, grouped list. Replaces the
 * 30-pill strip that ran off the screen — the common kinds stay one click away as
 * recent pills, everything else is a couple of keystrokes. `inline` renders the same
 * search + list directly, for the edit dialogs.
 */
export function KindPicker({ value, onChange, exclude = [], recents = 4, inline = false }: Props) {
  const recentKinds = useStore((s) => s.recentKinds)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hl, setHl] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const shown = inline || open
  // closing from the keyboard hands focus back to the pill, so Tab continues from where it left
  const close = (restoreFocus: boolean) => { setOpen(false); if (restoreFocus) triggerRef.current?.focus() }

  const allowed = (k: MarkerKind) => !exclude.includes(k)
  const pills = inline ? [] : recentKinds.filter((k) => allowed(k) && k !== value).slice(0, recents)

  const { rows, items } = useMemo(() => {
    const query = q.trim().toLowerCase()
    const matches = (k: MarkerKind) =>
      allowed(k) && (!query || markerKindMeta(k).name.toLowerCase().includes(query) || k.includes(query))
    const known = new Set(GROUPS.flatMap((g) => g.kinds))
    const extra = MARKER_KINDS.map((m) => m.kind as MarkerKind).filter((k) => !known.has(k))
    const groups: { title: string; kinds: MarkerKind[] }[] = [
      ...(query ? [] : [{ title: 'Recent', kinds: recentKinds.filter(allowed).slice(0, 6) }]),
      ...GROUPS.map((g, i) => (i === GROUPS.length - 1 ? { ...g, kinds: [...g.kinds, ...extra] } : g)),
    ]
    const rows: Row[] = []
    const items: MarkerKind[] = []
    for (const g of groups) {
      const ks = g.kinds.filter(matches)
      if (ks.length === 0) continue
      rows.push({ type: 'head', title: g.title })
      for (const k of ks) { rows.push({ type: 'item', kind: k, idx: items.length }); items.push(k) }
    }
    return { rows, items }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, recentKinds, exclude.join(','), value])

  useEffect(() => { setHl(0) }, [q])
  useEffect(() => {
    if (!shown) return
    setQ('')
    // after the parent dialog's own mount-focus, so typing a kind name works straight away
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    if (inline) return () => window.clearTimeout(t)
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      // capture phase: a canvas tap should only dismiss, not also fire the armed tool
      if ((e.target as Element).closest?.('[data-canvas]')) e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => { window.clearTimeout(t); window.removeEventListener('pointerdown', onDown, true) }
  }, [shown, inline])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('.kind-item.hl')?.scrollIntoView({ block: 'nearest' })
  }, [hl])

  const pick = (k: MarkerKind, viaKeyboard = false) => { onChange(k); if (!inline) close(viaKeyboard) }
  const meta = markerKindMeta(value)

  const list = (
    <>
      <label className="kind-search">
        <Search size={13} />
        <input ref={inputRef} value={q} placeholder="Search rooms & objects" aria-label="Search types"
          role="combobox" aria-expanded aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={items[hl] ? `${listId}-${items[hl]}-${hl}` : undefined}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(items.length - 1, h + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(0, h - 1)) }
            else if (e.key === 'Enter') { e.preventDefault(); if (items[hl]) pick(items[hl], true) }
          }} />
      </label>
      <div className="kind-list" ref={listRef} role="listbox" id={listId}>
        {rows.length === 0 && <div className="kind-empty">Nothing matches “{q}”</div>}
        {rows.map((r) => r.type === 'head'
          ? <div key={`h-${r.title}`} className="kind-head">{r.title}</div>
          : (() => {
            const m = markerKindMeta(r.kind)
            return (
              <button key={`${r.kind}-${r.idx}`} id={`${listId}-${r.kind}-${r.idx}`} type="button" role="option"
                aria-selected={r.kind === value}
                className={`kind-item ${r.kind === value ? 'on' : ''} ${r.idx === hl ? 'hl' : ''}`}
                onMouseEnter={() => setHl(r.idx)}
                onClick={() => pick(r.kind)}>
                <span className="kind-dot" style={{ background: m.color }} />
                {m.name}
              </button>
            )
          })()
        )}
      </div>
    </>
  )

  if (inline) return <div className="kind-picker inline" ref={rootRef}>{list}</div>

  return (
    <>
      <div className="kind-picker" ref={rootRef}
        onKeyDown={(e) => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) } }}>
        <button ref={triggerRef} type="button" className={`qpill kind picker ${open ? 'on' : ''}`}
          aria-haspopup="listbox" aria-expanded={open} title="Change type (type to search)"
          onClick={() => setOpen(!open)}>
          <span className="kind-dot" style={{ background: meta.color }} />
          {meta.name}
          <ChevronDown size={12} />
        </button>
        {open && <div className="kind-pop">{list}</div>}
      </div>
      {pills.map((k) => {
        const m = markerKindMeta(k)
        return (
          <button key={k} type="button" className="qpill kind" onClick={() => onChange(k)} title={`Switch to ${m.name}`}>
            <span className="kind-dot" style={{ background: m.color }} />
            {m.name}
          </button>
        )
      })}
    </>
  )
}
