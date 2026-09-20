import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, LogOut, MonitorSmartphone, RefreshCw } from 'lucide-react'
import { DEFAULT_COMPASS, useStore } from '../store'
import { Scene } from '../canvas/Scene'
import { centroid, circumradius } from '../geometry'
import type { CompassState, Marker, Pt, RoomShape } from '../types'
import { signIn, signOut, takeSeat, check } from './session'

/* ------------------------------------------------------------------ hero -- */

/** A sample plan, drawn by the studio's own renderer: what the product does is the
 *  first thing on the page. World units are centimetres (1 px = 1 cm). */
const PLAN_PTS: Pt[] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 780 }, { x: 0, y: 780 }]
const PLAN_ROOMS: RoomShape[] = [
  { id: 'lp-toilet', kind: 'toilet', shape: 'rect', label: 'Toilet', pts: [{ x: 60, y: 50 }, { x: 230, y: 150 }] },
  { id: 'lp-study', kind: 'study', shape: 'rect', label: 'Study', pts: [{ x: 60, y: 190 }, { x: 300, y: 430 }] },
  { id: 'lp-living', kind: 'living', shape: 'rect', label: 'Living', pts: [{ x: 340, y: 60 }, { x: 700, y: 320 }] },
  { id: 'lp-pooja', kind: 'pooja', shape: 'rect', label: 'Pooja', pts: [{ x: 760, y: 60 }, { x: 940, y: 220 }] },
  { id: 'lp-dining', kind: 'dining', shape: 'rect', label: 'Dining', pts: [{ x: 720, y: 260 }, { x: 940, y: 470 }] },
  { id: 'lp-bed', kind: 'bed', shape: 'rect', label: 'Bedroom', pts: [{ x: 60, y: 470 }, { x: 360, y: 720 }] },
  { id: 'lp-kitchen', kind: 'kitchen', shape: 'rect', label: 'Kitchen', pts: [{ x: 700, y: 510 }, { x: 940, y: 720 }] },
]
const PLAN_MARKERS: Marker[] = [{ id: 'lp-door', kind: 'entrance', label: 'Entrance', p: { x: 560, y: 0 } }]
const PLAN_COMPASS: CompassState = { ...DEFAULT_COMPASS, id: 'zones16', labels: true, brahmasthan: true, devtas: false, degreeRing: false }

function PlanPlate({ paper }: { paper: boolean }) {
  const geo = useMemo(() => {
    const center = centroid(PLAN_PTS)
    const R = circumradius(center, PLAN_PTS)
    // the wheel and its zone labels reach ~1.2R from the centre — the view holds all of it
    const reach = R * 1.26
    return { center, R, vb: { x: center.x - reach, y: center.y - reach, w: reach * 2, h: reach * 2 } }
  }, [])
  return (
    <svg className="login-plan" viewBox={`${geo.vb.x} ${geo.vb.y} ${geo.vb.w} ${geo.vb.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <g className="login-plan-settle" style={{ transformOrigin: `${geo.center.x}px ${geo.center.y}px` }}>
        <Scene
          bg={{ kind: 'none', w: 1000, h: 780, opacity: 1, grayscale: false, invert: false }}
          dxf={null} pts={PLAN_PTS} bulges={[0, 0, 0, 0]} closed center={geo.center} R={geo.R}
          northDeg={0} compass={PLAN_COMPASS} metersPerPx={0.01} unit="ft" k={0.72}
          showEdgeLabels markers={PLAN_MARKERS} roomShapes={PLAN_ROOMS}
          paper={paper} idPrefix="login"
        />
      </g>
    </svg>
  )
}

/** The mark from the favicon: a tilted square with its centre point. */
function Mark() {
  return (
    <svg className="login-mark" viewBox="0 0 32 32" aria-hidden>
      <rect x="8.2" y="8.2" width="15.6" height="15.6" rx="1.5" transform="rotate(45 16 16)" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
    </svg>
  )
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

/* ------------------------------------------------------------------ page -- */

/** The front door: the studio's own drawing on the left, the account on the right —
 *  sign in, or exactly why the studio is closed (another device holds the seat, the
 *  subscription ended, access is switched off, or the server has been out of reach
 *  past the grace window). */
export function LoginPage() {
  const auth = useStore((s) => s.auth)
  const theme = useStore((s) => s.theme)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const phoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (auth.status === 'signed-out') window.setTimeout(() => phoneRef.current?.focus(), 400)
  }, [auth.status])

  const submit = async () => {
    if (busy) return
    setBusy(true); setError(null)
    const problem = await signIn(phone, password)
    setBusy(false)
    if (problem) { setError(problem); return }
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
    <div className="login" role="dialog" aria-modal="true" aria-label="Vastu Studio sign in">
      <div className="login-plate">
        <PlanPlate paper={theme === 'paper'} />
        <div className="login-caption">
          <span>A sample plan — its 16 zones, gates and Brahmasthan read to scale.</span>
          <span>10 m × 7.8 m · north 0°</span>
        </div>
      </div>

      <div className="login-col">
        <div className="login-brand">
          <Mark />
          <span className="login-wordmark">Vastu Studio</span>
        </div>
        <p className="login-tag">The practitioner’s drawing board.</p>

        <div className="login-body">
          {auth.status === 'loading' && (
            <>
              <h2 className="login-head">Opening the studio</h2>
              <p className="login-sub">Checking your account.</p>
            </>
          )}

          {auth.status === 'signed-out' && (
            <form onSubmit={(e) => { e.preventDefault(); void submit() }}>
              <h2 className="login-head">Sign in</h2>
              <p className="login-sub">With the phone number and password your account was set up with.</p>
              <label className="login-label" htmlFor="login-phone">Phone number</label>
              <input id="login-phone" ref={phoneRef} className="login-field" value={phone} inputMode="tel"
                autoComplete="tel" placeholder="98765 43210" spellCheck={false}
                onChange={(e) => { setPhone(e.target.value); setError(null) }} />
              <label className="login-label" htmlFor="login-password">Password</label>
              <input id="login-password" className="login-field" type="password" value={password}
                autoComplete="current-password"
                onChange={(e) => { setPassword(e.target.value); setError(null) }} />
              {error && <div className="login-error" role="alert">{error}</div>}
              <div className="login-actions">
                <button type="submit" className="btn-primary login-cta" disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in'} {!busy && <ArrowRight size={15} />}
                </button>
              </div>
            </form>
          )}

          {blocked?.reason === 'other_device' && (
            <>
              <h2 className="login-head">Signed in elsewhere</h2>
              <p className="login-sub">
                {who ? <><b>{who}</b> is </> : 'This account is '}open on <b>{blocked.deviceName || 'another device'}</b>.
                One device at a time — using it here signs that one out.
              </p>
              {error && <div className="login-error" role="alert">{error}</div>}
              <div className="login-actions">
                <button className="btn-primary login-cta" disabled={busy}
                  onClick={() => void run(async () => { const p = await takeSeat(); if (p) setError(p) })}>
                  <MonitorSmartphone size={15} /> Use it here
                </button>
                <button className="btn-ghost login-alt" disabled={busy} onClick={() => void run(signOut)}>
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </>
          )}

          {blocked?.reason === 'expired' && (
            <>
              <h2 className="login-head">Subscription ended</h2>
              <p className="login-sub">
                {who && <><b>{who}</b> — </>}access ended{blocked.user?.expiresAt ? ` on ${fmtDate(blocked.user.expiresAt)}` : ''}.
                Renew with the studio and sign in again. Your saved plans are untouched.
              </p>
              <div className="login-actions">
                <button className="btn-primary login-cta" disabled={busy} onClick={() => void run(check)}>
                  <RefreshCw size={15} /> Check again
                </button>
                <button className="btn-ghost login-alt" disabled={busy} onClick={() => void run(signOut)}>
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </>
          )}

          {(blocked?.reason === 'disabled' || blocked?.reason === 'no_profile') && (
            <>
              <h2 className="login-head">Access switched off</h2>
              <p className="login-sub">This account can’t open the studio right now. If that’s unexpected, contact the studio.</p>
              <div className="login-actions">
                <button className="btn-primary login-cta" disabled={busy} onClick={() => void run(check)}>
                  <RefreshCw size={15} /> Check again
                </button>
                <button className="btn-ghost login-alt" disabled={busy} onClick={() => void run(signOut)}>
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </>
          )}

          {blocked?.reason === 'offline' && (
            <>
              <h2 className="login-head">Reconnect to continue</h2>
              <p className="login-sub">The server has been out of reach for more than three days, so the account needs a fresh check. Connect to the internet and try again.</p>
              {error && <div className="login-error" role="alert">{error}</div>}
              <div className="login-actions">
                <button className="btn-primary login-cta" disabled={busy} onClick={() => void run(check)}>
                  <RefreshCw size={15} /> Try again
                </button>
              </div>
            </>
          )}
        </div>

        <p className="login-foot">Access is arranged directly with the studio.</p>
      </div>
    </div>
  )
}
