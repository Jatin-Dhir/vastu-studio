import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { useStore } from '../store'

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  const busy = useStore((s) => s.busy)

  return (
    <div className="toasts" role="status" aria-live="polite">
      {busy && (
        <div className="toast busy">
          <span className="spinner" />
          {busy}
        </div>
      )}
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.kind === 'ok' ? <CheckCircle2 size={15} /> : t.kind === 'warn' ? <AlertTriangle size={15} /> : <Info size={15} />}
          <span>{t.msg}</span>
          {t.actionLabel && (
            <button
              className="toast-action"
              onClick={(e) => { e.stopPropagation(); t.onAction?.(); dismiss(t.id) }}
            >
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
