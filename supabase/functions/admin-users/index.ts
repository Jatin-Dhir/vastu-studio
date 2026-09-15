// Admin-only user management. Creating an auth user needs the service-role key, which
// must never reach the app — so the admin panel calls this function instead. The caller's
// own session is checked for the admin role before anything happens.
//
// Deploy: `supabase functions deploy admin-users` (the service-role key is injected
// automatically as SUPABASE_SERVICE_ROLE_KEY).
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  // is the caller an admin? asked with the caller's own token, under RLS
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const { data: isAdmin, error: adminErr } = await caller.rpc('is_admin')
  if (adminErr || !isAdmin) return json({ error: 'admin only' }, 403)

  const admin = createClient(url, service, { auth: { persistSession: false } })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }

  try {
    switch (body.action) {
      case 'create': {
        const phone = String(body.phone ?? '').trim()
        const password = String(body.password ?? '')
        const name = String(body.name ?? '').trim()
        if (!/^\+[1-9]\d{7,14}$/.test(phone)) return json({ error: 'phone must be in international form, e.g. +919876543210' }, 400)
        if (password.length < 8) return json({ error: 'password needs at least 8 characters' }, 400)
        // sign-in is by phone; the auth user behind it is <digits>@phone.vastustudio.app
        const email = `${phone.replace(/^\+/, '')}@phone.vastustudio.app`
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { name, phone },
        })
        if (error) return json({ error: /already/i.test(error.message) ? 'an account with that phone number already exists' : error.message }, 400)
        const id = data.user.id
        const expires = body.expires_at ? String(body.expires_at) : null
        // the trigger created the profile row switched off; the admin's create switches it on
        const { error: pErr } = await admin.from('profiles')
          .update({ name, phone, expires_at: expires, disabled: false, notes: body.notes ? String(body.notes) : null })
          .eq('id', id)
        if (pErr) return json({ error: pErr.message }, 400)
        return json({ id })
      }
      case 'password': {
        const id = String(body.user_id ?? '')
        const password = String(body.password ?? '')
        if (password.length < 8) return json({ error: 'password needs at least 8 characters' }, 400)
        const { error } = await admin.auth.admin.updateUserById(id, { password })
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }
      case 'delete': {
        const id = String(body.user_id ?? '')
        const { error } = await admin.auth.admin.deleteUser(id)
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }
      default:
        return json({ error: 'unknown action' }, 400)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
