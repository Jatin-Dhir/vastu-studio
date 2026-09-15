import { Megaphone, X } from 'lucide-react'
import { useStore } from '../store'
import { dismissBroadcast } from './session'

/** A message from the studio to every user — shown once, until dismissed. */
export function BroadcastBar() {
  const b = useStore((s) => s.broadcast)
  if (!b) return null
  return (
    <div className="broadcast-bar" role="status">
      <Megaphone size={14} />
      <span>{b.message}</span>
      <button className="icon-btn" aria-label="Dismiss" onClick={() => dismissBroadcast(b.id)}><X size={14} /></button>
    </div>
  )
}
