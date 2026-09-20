import { useEffect } from 'react'
import { Check } from 'lucide-react'
import { useStore, type AccentId, type ThemeMode } from '../store'

const THEMES: { id: ThemeMode; label: string; sub: string; bg: string; fg: string }[] = [
  { id: 'ink', label: 'Ink', sub: 'Dark — easy on the eyes on site', bg: '#0B0C10', fg: '#E9EBF1' },
  { id: 'paper', label: 'Paper', sub: 'Light — the default; matches the printed report', bg: '#F3F1EA', fg: '#26251E' },
]

const ACCENTS: { id: AccentId; label: string; swatch: string }[] = [
  { id: 'gold', label: 'Gold', swatch: '#D9B45B' },
  { id: 'teal', label: 'Teal', swatch: '#5FB8C9' },
  { id: 'rose', label: 'Rose', swatch: '#D98BA0' },
  { id: 'sage', label: 'Sage', swatch: '#93B587' },
]

/**
 * Appearance settings — theme and accent colour. The chrome follows the CSS tokens;
 * the plan/compass drawing follows the theme through Scene's `paper` inks (the same
 * palette the PNG export and the report use on a light ground).
 */
export function AppearanceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useStore((s) => s.theme)
  const accent = useStore((s) => s.accent)
  const setTheme = useStore((s) => s.setTheme)
  const setAccent = useStore((s) => s.setAccent)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="asheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="asheet" role="dialog" aria-label="Appearance" onClick={(e) => e.stopPropagation()}>
        <div className="asheet-head">
          <span>Appearance</span>
        </div>

        <div className="appearance-section">
          <span className="appearance-label">Theme</span>
          <div className="appearance-themes">
            {THEMES.map((t) => (
              <button key={t.id} className={`theme-swatch ${theme === t.id ? 'on' : ''}`}
                style={{ background: t.bg, color: t.fg }}
                onClick={() => setTheme(t.id)}>
                <span className="theme-swatch-name">{t.label}</span>
                {theme === t.id && <Check size={14} strokeWidth={3} />}
              </button>
            ))}
          </div>
          <p className="appearance-hint">{THEMES.find((t) => t.id === theme)?.sub}</p>
        </div>

        <div className="appearance-section">
          <span className="appearance-label">Accent</span>
          <div className="appearance-accents">
            {ACCENTS.map((a) => (
              <button key={a.id} className={`accent-swatch ${accent === a.id ? 'on' : ''}`}
                aria-label={a.label} title={a.label}
                style={{ background: a.swatch }}
                onClick={() => setAccent(a.id)}>
                {accent === a.id && <Check size={13} strokeWidth={3} color="#14151A" />}
              </button>
            ))}
          </div>
        </div>

        <p className="appearance-note">
          Paper draws the plan on light paper, the way the report prints it; Ink keeps the dark drawing plate.
        </p>

        <button className="btn-primary appearance-done" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
