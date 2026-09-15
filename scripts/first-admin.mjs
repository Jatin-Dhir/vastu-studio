// Create (or promote) the first admin account through Supabase's own Auth Admin API —
// the same path the admin panel's edge function uses, without needing an admin to exist yet.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/first-admin.mjs "+917901932126" "Jatin" [password]
//
// Prints the password (generated when not given). The service-role key stays on this machine.
const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const [phone, name = '', given] = process.argv.slice(2)
if (!url || !key || !phone) {
  console.error('Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/first-admin.mjs "+91XXXXXXXXXX" "Name" [password]')
  process.exit(1)
}
if (!/^\+[1-9]\d{7,14}$/.test(phone)) { console.error('Phone must be international, e.g. +919876543210'); process.exit(1) }

const password = given ?? Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 54]).join('')
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

// does the user already exist? (re-runs just promote + reset the password)
const list = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers })
if (!list.ok) { console.error('Auth admin API refused:', list.status, await list.text()); process.exit(1) }
const existing = ((await list.json()).users ?? []).find((u) => u.phone === phone.replace(/^\+/, '') || u.phone === phone)

let id
if (existing) {
  id = existing.id
  const r = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: 'PUT', headers, body: JSON.stringify({ password, phone_confirm: true, user_metadata: { name } }) })
  if (!r.ok) { console.error('Password reset failed:', r.status, await r.text()); process.exit(1) }
  console.log(`Existing user ${phone} — password reset.`)
} else {
  const r = await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers, body: JSON.stringify({ phone, password, phone_confirm: true, user_metadata: { name } }) })
  if (!r.ok) { console.error('Create failed:', r.status, await r.text()); process.exit(1) }
  id = (await r.json()).id
  console.log(`Created user ${phone}.`)
}

// the trigger made the profile row; make it the admin
const p = await fetch(`${url}/rest/v1/profiles?id=eq.${id}`, {
  method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
  body: JSON.stringify({ role: 'admin', name, disabled: false, expires_at: null }),
})
if (!p.ok) { console.error('Profile update failed:', p.status, await p.text()); process.exit(1) }

console.log(`\nAdmin ready.\n  phone:    ${phone}\n  password: ${password}\n\nSign in with these in the app; change the password from the admin panel if you like.`)
