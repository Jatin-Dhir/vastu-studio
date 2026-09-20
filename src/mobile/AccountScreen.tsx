import { HelpCircle, LogOut, ShieldCheck } from 'lucide-react'
import { useStore } from '../store'
import { signOut } from '../auth/session'
import { AUTH_ENABLED } from '../auth/supabase'
import { ShortcutsDialog } from '../ui/Dialogs'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

/** Who is signed in, how the app looks, and the few settings a phone needs. */
export function AccountScreen() {
  const auth = useStore((s) => s.auth)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const unit = useStore((s) => s.unit)
  const setUnit = useStore((s) => s.setUnit)
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen)
  const user = auth.status === 'ok' ? auth.user : null

  return (
    <div className="m-scroll">
      <header className="m-head"><h1>Account</h1></header>

      <section className="m-card">
        {user ? (
          <>
            <div className="m-who"><b>{user.name || user.phone}</b><small>{user.phone}</small></div>
            <p className="m-muted">
              {user.expiresAt ? `Access until ${fmtDate(user.expiresAt)}.` : 'Access with no end date.'}
              {auth.status === 'ok' && auth.offline ? ' Working from the last check — the server is out of reach.' : ''}
            </p>
            {user.role === 'admin' && (
              <button className="btn-ghost m-btn" onClick={() => { location.hash = '#/admin' }}><ShieldCheck size={15} /> Admin panel</button>
            )}
            <button className="btn-ghost m-btn" onClick={() => void signOut()}><LogOut size={15} /> Sign out of this phone</button>
          </>
        ) : (
          <p className="m-muted">{AUTH_ENABLED ? 'Not signed in.' : 'Running without an account on this build.'}</p>
        )}
      </section>

      <section className="m-card">
        <h2 className="m-card-title">Appearance</h2>
        <div className="m-seg" role="tablist" aria-label="Theme">
          <button role="tab" aria-selected={theme === 'paper'} className={theme === 'paper' ? 'on' : ''} onClick={() => setTheme('paper')}>Paper</button>
          <button role="tab" aria-selected={theme === 'ink'} className={theme === 'ink' ? 'on' : ''} onClick={() => setTheme('ink')}>Ink</button>
        </div>
        <h2 className="m-card-title">Units</h2>
        <div className="m-seg" role="tablist" aria-label="Units">
          <button role="tab" aria-selected={unit === 'ft'} className={unit === 'ft' ? 'on' : ''} onClick={() => setUnit('ft')}>Feet</button>
          <button role="tab" aria-selected={unit === 'm'} className={unit === 'm' ? 'on' : ''} onClick={() => setUnit('m')}>Metres</button>
        </div>
      </section>

      <section className="m-card">
        <button className="btn-ghost m-btn" onClick={() => setShortcutsOpen(true)}><HelpCircle size={15} /> How the flow works</button>
        <p className="m-muted m-about">Vastu Studio for Android · the practitioner's drawing board. Plans stay on this phone; the charts come from your account.</p>
      </section>
      <ShortcutsDialog />
    </div>
  )
}
