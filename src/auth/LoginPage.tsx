import { useEffect, useRef, useState } from 'react'
import { ArrowRight, LogOut, MonitorSmartphone, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { signIn, signOut, takeSeat, check } from './session'

/** The instrument dial — the product's own visual vocabulary as the page's one hero:
 *  a graduated ring of real tick marks (the same language as the app's north dial),
 *  turning once every two minutes. Killed by the global reduced-motion rule. */
function Dial({ pulsing }: { pulsing: boolean }) {
  const ticks = Array.from({ length: 32 }, (_, i) => i * 11.25)
  return (
    <svg className={`act-dial ${pulsing ? 'pulse' : ''}`} viewBox="0 0 200 200" aria-hidden>
      <circle cx="100" cy="100" r="88" fill="none" stroke="var(--tick)" strokeWidth="1" opacity="0.7" />
      <circle cx="100" cy="100" r="64" fill="none" stroke="var(--stroke-2)" strokeWidth="1" />
      <g className="act-dial-spokes">
        {ticks.map((a) => {
          const cardinal = a % 90 === 0
          const zone = a % 22.5 === 0
          return (
            <line key={a} x1="100" y1={cardinal ? 22 : zone ? 15 : 12} x2="100" y2="10"
              transform={`rotate(${a} 100 100)`}
              stroke={cardinal ? 'var(--gold)' : zone ? 'var(--tick)' : 'var(--stroke-2)'}
              strokeWidth={cardinal ? 1.8 : zone ? 1.2 : 1} />
          )
        })}
        {Array.from({ length: 16 }, (_, i) => i * 22.5).map((a) => (
          <line key={`s${a}`} x1="100" y1="36" x2="100" y2="64"
            transform={`rotate(${a + 11.25} 100 100)`}
            stroke="var(--stroke-2)" strokeWidth="0.8" />
        ))}
        <circle className="act-dial-core" cx="100" cy="100" r="26" fill="var(--bg)" stroke="var(--gold)" strokeWidth="1.2" />
      </g>
      <circle cx="100" cy="100" r="3" fill="var(--gold)" />
      {[['N', 100, 5.5], ['E', 196.5, 104], ['S', 100, 199.5], ['W', 3.5, 104]].map(([t, x, y]) => (
        <text key={t as string} x={x as number} y={y as number} textAnchor="middle"
          fill={t === 'N' ? 'var(--gold)' : 'var(--dim)'} fontSize="10" fontWeight="700">{t}</text>
      ))}
    </svg>
  )
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

/** Full-screen front door: sign in, or explain exactly why the studio is closed
 *  (another device holds the seat, the subscription ended, access switched off,
 *  or the server has been unreachable past the grace window). */
export function LoginPage() {
  const auth = useStore((s) => s.auth)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justIn, setJustIn] = useState(false)
  const phoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (auth.status === 'signed-out') window.setTimeout(() => phoneRef.current?.focus(), 350)
  }, [auth.status])

  const submit = async () => {
    if (busy) return
    setBusy(true); setError(null)
    const problem = await signIn(phone, password)
    setBusy(false)
    if (problem) { setError(problem); return }
    setJustIn(true)
    setPassword('')
  }

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true); setError(null)
    try { await fn() } finally { setBusy(false) }
  }

  const blocked = auth.status === 'blocked' ? auth : null
  const who = blocked?.user ? (blocked.user.name || blocked.user.phone) : ''

  return (
    <div className="activation" role="dialog" aria-modal="true" aria-label="Vastu Studio sign in">
      <div className="act-identity">
        <Dial pulsing={justIn} />
        <div className="act-wordmark">Vastu <em>Studio</em></div>
        <p className="act-tag">The practitioner’s drawing board — import a plan, trace it, and read its zones, gates and Brahmasthan to scale.</p>
      </div>

      <div className="act-card">
        {auth.status === 'loading' && (
          <>
            <h2 className="act-head">Opening the studio…</h2>
            <p className="act-sub">Checking your account.</p>
          </>
        )}

        {auth.status === 'signed-out' && (
          <>
            <h2 className="act-head">Sign in</h2>
            <p className="act-sub">Use the phone number and password your account was set up with.</p>
            <label className="act-key-label" htmlFor="login-phone">Phone number</label>
            <input id="login-phone" ref={phoneRef} className="act-field" value={phone} inputMode="tel"
              autoComplete="tel" placeholder="98765 43210" spellCheck={false}
              onChange={(e) => { setPhone(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
            <label className="act-key-label" htmlFor="login-password">Password</label>
            <input id="login-password" className="act-field" type="password" value={password}
              autoComplete="current-password"
              onChange={(e) => { setPassword(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
            {error && <div className="act-error" role="alert">{error}</div>}
            <button className="btn-primary act-cta" disabled={busy || !phone.trim() || !password} onClick={() => void submit()}>
              {busy ? 'Signing in…' : 'Sign in'} {!busy && <ArrowRight size={15} />}
            </button>
            <p className="act-trial-note">No account yet? Access is arranged directly with the studio — get in touch for a subscription.</p>
          </>
        )}

        {blocked?.reason === 'other_device' && (
          <>
            <h2 className="act-head">Signed in elsewhere</h2>
            <p className="act-sub">
              {who ? <><b>{who}</b> is </> : 'This account is '}currently open on <b>{blocked.deviceName || 'another device'}</b>.
              One device at a time — using it here signs that one out.
            </p>
            {error && <div className="act-error" role="alert">{error}</div>}
            <button className="btn-primary act-cta" disabled={busy}
              onClick={() => void run(async () => { const p = await takeSeat(); if (p) setError(p) })}>
              <MonitorSmartphone size={15} /> Use it here instead
            </button>
            <button className="btn-ghost act-trial" disabled={busy} onClick={() => void run(signOut)}>
              <LogOut size={14} /> Sign out
            </button>
          </>
        )}

        {blocked?.reason === 'expired' && (
          <>
            <h2 className="act-head">Subscription ended</h2>
            <p className="act-sub">
              {who && <><b>{who}</b> — </>}access ended{blocked.user?.expiresAt ? ` on ${fmtDate(blocked.user.expiresAt)}` : ''}.
              Renew with the studio and sign in again; your saved plans are untouched.
            </p>
            <button className="btn-ghost act-trial" disabled={busy} onClick={() => void run(check)}>
              <RefreshCw size={14} /> Check again
            </button>
            <button className="btn-ghost act-trial" disabled={busy} onClick={() => void run(signOut)}>
              <LogOut size={14} /> Sign out
            </button>
          </>
        )}

        {(blocked?.reason === 'disabled' || blocked?.reason === 'no_profile') && (
          <>
            <h2 className="act-head">Access switched off</h2>
            <p className="act-sub">This account can’t open the studio right now. If that’s unexpected, contact the studio.</p>
            <button className="btn-ghost act-trial" disabled={busy} onClick={() => void run(check)}>
              <RefreshCw size={14} /> Check again
            </button>
            <button className="btn-ghost act-trial" disabled={busy} onClick={() => void run(signOut)}>
              <LogOut size={14} /> Sign out
            </button>
          </>
        )}

        {blocked?.reason === 'offline' && (
          <>
            <h2 className="act-head">Reconnect to continue</h2>
            <p className="act-sub">The server hasn’t been reachable for more than three days, so the account needs a fresh check. Connect to the internet and try again.</p>
            {error && <div className="act-error" role="alert">{error}</div>}
            <button className="btn-primary act-cta" disabled={busy} onClick={() => void run(check)}>
              <RefreshCw size={15} /> Try again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
