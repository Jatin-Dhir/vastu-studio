import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BadgeCheck, ExternalLink, KeyRound } from 'lucide-react'
import { useStore } from '../store'
import { activateKey, deactivate } from '../license'
import { CHECKOUT_URL, PORTAL_URL } from '../licenseConfig'

/** The instrument dial — the product's own visual vocabulary as the page's one
 *  hero: a graduated ring of real tick marks (the same language as the app's
 *  north dial), turning once every two minutes. Killed by the global
 *  reduced-motion rule; cardinal letters stay upright like the app's compass. */
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

export function ActivationPage() {
  const open = useStore((s) => s.activationOpen)
  const setOpen = useStore((s) => s.setActivationOpen)
  const license = useStore((s) => s.license)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justActivated, setJustActivated] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setJustActivated(false)
    const t = window.setTimeout(() => inputRef.current?.focus(), 350)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [open, setOpen])

  if (!open) return null

  const submit = async () => {
    if (busy) return
    setBusy(true); setError(null)
    const problem = await activateKey(key)
    setBusy(false)
    if (problem) { setError(problem); return }
    setJustActivated(true)
    setKey('')
    // one confident settle, then into the studio
    window.setTimeout(() => useStore.getState().setActivationOpen(false), 1100)
  }

  const active = license.status === 'active'
  const expired = license.status === 'expired'

  return (
    <div className="activation" role="dialog" aria-modal="true" aria-label="Vastu Studio activation">
      <div className="act-identity">
        <Dial pulsing={justActivated} />
        <div className="act-wordmark">Vastu <em>Studio</em></div>
        <p className="act-tag">The practitioner’s drawing board — import a plan, trace it, and read its zones, gates and Brahmasthan to scale.</p>
      </div>

      <div className="act-card">
        {active ? (
          <>
            <div className="act-licensed"><BadgeCheck size={17} strokeWidth={2.1} /> Licensed on this device</div>
            <div className="act-plan-row">
              <span>{license.plan}</span>
              <small>
                key ····{license.keyTail}
                {license.renewsAt ? ` · renews ${new Date(license.renewsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </small>
            </div>
            <button className="btn-primary act-cta" onClick={() => setOpen(false)}>
              Continue to the studio <ArrowRight size={15} />
            </button>
            <div className="act-manage">
              {PORTAL_URL && (
                <a className="btn-ghost" href={PORTAL_URL} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} /> Manage billing
                </a>
              )}
              <button className="btn-ghost act-danger" onClick={() => { void deactivate() }}>
                Deactivate this device
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="act-head">{expired ? 'Subscription ended' : 'Activate Vastu Studio'}</h2>
            <p className="act-sub">
              {expired
                ? `Key ····${license.status === 'expired' ? license.keyTail : ''} is no longer active. Renew your subscription, or enter a new key.`
                : 'Enter the licence key from your purchase email to unlock exports, reports and project files on this device.'}
            </p>
            <label className="act-key-label" htmlFor="act-key">Licence key</label>
            <input
              id="act-key" ref={inputRef} className="act-key" value={key}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off" spellCheck={false}
              onChange={(e) => { setKey(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            />
            {error && <div className="act-error" role="alert">{error}</div>}
            <button className="btn-primary act-cta" disabled={busy || key.trim().length === 0} onClick={() => void submit()}>
              {busy ? 'Checking…' : 'Activate'} {!busy && <KeyRound size={14} />}
            </button>
            {CHECKOUT_URL && (
              <a className="act-subscribe" href={CHECKOUT_URL} target="_blank" rel="noreferrer">
                No key yet? Get a subscription <ExternalLink size={12} />
              </a>
            )}
            <div className="act-divider" />
            <button className="btn-ghost act-trial" onClick={() => setOpen(false)}>
              Continue in trial mode
            </button>
            <p className="act-trial-note">Everything works in the trial — importing, tracing, the full compass analysis. Exports, client reports and project files wait for a licence.</p>
          </>
        )}
      </div>
    </div>
  )
}
