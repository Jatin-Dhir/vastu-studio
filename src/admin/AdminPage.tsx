import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, KeyRound, Megaphone, MonitorOff, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { useStore } from '../store'
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../auth/supabase'
import { normalizePhone } from '../auth/session'
import './admin.css'

interface AdminUser {
  id: string; name: string; phone: string; role: 'user' | 'admin'
  expires_at: string | null; disabled: boolean
  active_device_name: string | null; last_seen: string | null; created_at: string
  notes: string | null; events_7d: number
}
interface Stats {
  users: number; active_7d: number; expiring_30d: number; expired: number; disabled: number
  events_30d: Record<string, number>
  opens_by_day: { day: string; n: number }[]
}
interface Broadcast { id: number; message: string; active: boolean; created_at: string }

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}
/** Creating or re-passwording a user needs the service role, which lives only in the
 *  admin-users edge function; the admin's own token proves who is asking. */
async function edge(action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase().auth.getSession()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify({ action, ...body }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((j as { error?: string }).error || res.statusText)
  return j
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}
const plusDays = (from: string | null, days: number) => {
  const base = from && new Date(from).getTime() > Date.now() ? new Date(from) : new Date()
  base.setDate(base.getDate() + days)
  return base.toISOString()
}
const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '')

function statusOf(u: AdminUser): { label: string; cls: string } {
  if (u.disabled) return { label: 'Off', cls: 'bad' }
  if (u.expires_at && new Date(u.expires_at).getTime() < Date.now()) return { label: 'Expired', cls: 'bad' }
  if (u.expires_at && new Date(u.expires_at).getTime() < Date.now() + 30 * 86400000) return { label: 'Expiring', cls: 'warn' }
  return { label: 'Active', cls: 'good' }
}

export function AdminPage() {
  const me = useStore((s) => (s.auth.status === 'ok' ? s.auth.user : null))
  const toast = useStore((s) => s.toast)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [msg, setMsg] = useState('')

  const reload = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [u, s, b] = await Promise.all([
        rpc<AdminUser[]>('admin_list_users'),
        rpc<Stats>('admin_stats'),
        supabase().from('broadcasts').select('id,message,active,created_at').order('id', { ascending: false }).limit(20).then(({ data, error }) => { if (error) throw new Error(error.message); return (data ?? []) as Broadcast[] }),
      ])
      setUsers(u); setStats(s); setBroadcasts(b)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void reload() }, [reload])

  const act = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); toast(label, 'ok'); await reload() } catch (e) { toast(e instanceof Error ? e.message : String(e), 'warn') }
  }

  const filtered = users.filter((u) => {
    const s = q.trim().toLowerCase()
    return !s || u.name.toLowerCase().includes(s) || (u.phone ?? '').includes(s) || (u.notes ?? '').toLowerCase().includes(s)
  })

  return (
    <div className="admin">
      <header className="admin-head">
        <button className="btn-ghost" onClick={() => { location.hash = '' }}><ArrowLeft size={14} /> Back to the studio</button>
        <h1>Vastu Studio <em>admin</em></h1>
        <div className="admin-head-right">
          <span className="lbl dim">{me?.name || me?.phone}</span>
          <button className="icon-btn" aria-label="Refresh" onClick={() => void reload()}><RefreshCw size={15} /></button>
        </div>
      </header>

      {err && <div className="admin-error" role="alert">{err} — is the SQL migration applied and this account an admin?</div>}

      <section className="admin-stats">
        {[
          ['Users', stats?.users], ['Active this week', stats?.active_7d], ['Expiring in 30 days', stats?.expiring_30d],
          ['Expired', stats?.expired], ['Switched off', stats?.disabled],
          ['Plans analysed · 30 d', stats?.events_30d?.analysis ?? 0], ['Reports · 30 d', stats?.events_30d?.report ?? 0],
        ].map(([label, n]) => (
          <div key={label as string} className="admin-stat"><b>{n ?? '—'}</b><span>{label}</span></div>
        ))}
        {stats && stats.opens_by_day.length > 0 && (
          <div className="admin-stat wide">
            <span>App opens · last 14 days</span>
            <div className="admin-spark" aria-label="App opens per day">
              {stats.opens_by_day.map((d) => {
                const max = Math.max(...stats.opens_by_day.map((x) => x.n), 1)
                return <i key={d.day} style={{ height: `${Math.max(8, (d.n / max) * 100)}%` }} title={`${d.day}: ${d.n}`} />
              })}
            </div>
          </div>
        )}
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <h2>Users</h2>
          <input className="admin-search" placeholder="Search name, phone, notes" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}><UserPlus size={14} /> New user</button>
        </div>
        {showCreate && <CreateUser onDone={() => { setShowCreate(false); void reload() }} />}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Status</th><th>Access until</th><th>Device</th><th>Last seen</th><th>Use · 7 d</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((u) => <UserRow key={u.id} u={u} isMe={u.id === me?.id} act={act} />)}
              {!loading && filtered.length === 0 && <tr><td colSpan={8} className="admin-empty">No users{q ? ` match “${q}”` : ' yet — add the first one'}.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-head"><h2>Message to all users</h2></div>
        <p className="lbl dim">Shown once inside the app, at the top, until each user dismisses it. Deactivating stops it for anyone who hasn’t seen it yet.</p>
        <div className="admin-compose">
          <textarea rows={2} value={msg} placeholder="e.g. New version out — the compass now shows the 32 gates. Restart the app to update." onChange={(e) => setMsg(e.target.value)} />
          <button className="btn-primary" disabled={!msg.trim()} onClick={() => void act('Sent to all users', async () => {
            const { error } = await supabase().from('broadcasts').insert({ message: msg.trim(), created_by: me?.id })
            if (error) throw new Error(error.message)
            setMsg('')
          })}><Megaphone size={14} /> Send</button>
        </div>
        <ul className="admin-broadcasts">
          {broadcasts.map((b) => (
            <li key={b.id} className={b.active ? '' : 'off'}>
              <span>{b.message}</span>
              <small>{day(b.created_at)}</small>
              <button className="chip" onClick={() => void act(b.active ? 'Deactivated' : 'Reactivated', async () => {
                const { error } = await supabase().from('broadcasts').update({ active: !b.active }).eq('id', b.id)
                if (error) throw new Error(error.message)
              })}>{b.active ? 'Deactivate' : 'Reactivate'}</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function UserRow({ u, isMe, act }: { u: AdminUser; isMe: boolean; act: (label: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const st = statusOf(u)
  const [date, setDate] = useState(toDateInput(u.expires_at))
  useEffect(() => { setDate(toDateInput(u.expires_at)) }, [u.expires_at])
  const setAccess = (expires: string | null, disabled = u.disabled) =>
    act('Access updated', () => rpc('admin_set_access', { p_user: u.id, p_expires_at: expires, p_disabled: disabled }))
  return (
    <tr className={u.disabled ? 'off' : ''}>
      <td><b>{u.name || '—'}</b>{u.role === 'admin' && <span className="admin-tag">admin</span>}{u.notes && <small>{u.notes}</small>}</td>
      <td className="mono">{u.phone}</td>
      <td><span className={`admin-status ${st.cls}`}>{st.label}</span></td>
      <td>
        <div className="admin-until">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            onBlur={() => { if (date === toDateInput(u.expires_at)) return; void setAccess(date ? new Date(date + 'T23:59:59').toISOString() : null) }} />
          <button className="chip" title="Extend by 30 days" onClick={() => void setAccess(plusDays(u.expires_at, 30))}><Plus size={11} /> 30 d</button>
          <button className="chip" title="Extend by one year" onClick={() => void setAccess(plusDays(u.expires_at, 365))}><Plus size={11} /> 1 y</button>
        </div>
      </td>
      <td>{u.active_device_name ?? <span className="dim">—</span>}</td>
      <td>{ago(u.last_seen)}</td>
      <td>{u.events_7d}</td>
      <td>
        <div className="admin-actions">
          <button className="chip" disabled={!u.active_device_name} title="Sign out of its device" onClick={() => void act('Signed out of the device', () => rpc('admin_kick', { p_user: u.id }))}><MonitorOff size={11} /> Sign out</button>
          <button className="chip" title="Set a new password" onClick={() => {
            const pw = window.prompt(`New password for ${u.name || u.phone} (8+ characters)`)
            if (pw) void act('Password changed', () => edge('password', { user_id: u.id, password: pw }))
          }}><KeyRound size={11} /> Password</button>
          <button className={`chip ${u.disabled ? '' : 'danger'}`} disabled={isMe} onClick={() => void setAccess(u.expires_at, !u.disabled)}>
            {u.disabled ? 'Switch on' : 'Switch off'}
          </button>
          {u.role !== 'admin' && (
            <button className="chip danger" disabled={isMe} title="Delete the account entirely" onClick={() => {
              if (window.confirm(`Delete ${u.name || u.phone}? This removes the account for good; their plans stay on their own device.`)) {
                void act('Account deleted', () => edge('delete', { user_id: u.id }))
              }
            }}><Trash2 size={11} /></button>
          )}
        </div>
      </td>
    </tr>
  )
}

function CreateUser({ onDone }: { onDone: () => void }) {
  const toast = useStore((s) => s.toast)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [days, setDays] = useState(365)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const expires = days > 0 ? plusDays(null, days) : null
      await edge('create', { name, phone: normalizePhone(phone), password, expires_at: expires, notes })
      toast(`${name || phone} can sign in now`, 'ok')
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'warn')
    } finally { setBusy(false) }
  }
  return (
    <div className="admin-create">
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Phone (98765 43210)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <label>Access for <input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} /> days <small>(0 = no end date)</small></label>
      <input placeholder="Notes (city, plan, how they paid…)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn-primary" disabled={busy || !phone.trim() || password.length < 8} onClick={() => void submit()}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
    </div>
  )
}
