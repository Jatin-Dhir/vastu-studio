/**
 * Cloudflare Pages Function: POST /api/license
 *
 * The app's only licensing endpoint. It forwards activate / validate / deactivate
 * calls to Lemon Squeezy's public License API and refuses keys that belong to any
 * other store or product, so a random Lemon Squeezy key can't unlock Vastu Studio.
 *
 * Runs automatically once this repo deploys on Cloudflare Pages — no server to
 * manage. Configure two environment variables on the Pages project:
 *   LS_STORE_ID   — your Lemon Squeezy store id (Settings → Stores)
 *   LS_PRODUCT_ID — the subscription product's id
 *
 * CORS is open because the Capacitor apps call this from capacitor://localhost;
 * the endpoint holds no secrets and only relays what the public LS API returns.
 */

interface Env {
  LS_STORE_ID?: string
  LS_PRODUCT_ID?: string
}

const LS = 'https://api.lemonsqueezy.com/v1/licenses'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS })

export const onRequestPost = async (ctx: { request: Request; env: Env }) => {
  let body: any
  try { body = await ctx.request.json() } catch { return json(400, { error: 'Bad request' }) }
  const action = body?.action
  const key = typeof body?.key === 'string' ? body.key.trim() : ''
  if (!key || !['activate', 'validate', 'deactivate'].includes(action)) return json(400, { error: 'Bad request' })

  const form = new URLSearchParams({ license_key: key })
  if (action === 'activate') form.set('instance_name', String(body.instanceName || 'Vastu Studio').slice(0, 80))
  else form.set('instance_id', String(body.instanceId || ''))

  let ls: any
  try {
    const res = await fetch(`${LS}/${action}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    ls = await res.json()
  } catch {
    return json(502, { error: 'The licence service is unreachable right now — try again in a moment' })
  }

  // a key from some other Lemon Squeezy store/product must never unlock this app
  const meta = ls?.meta ?? {}
  const storeOk = !ctx.env.LS_STORE_ID || String(meta.store_id ?? '') === String(ctx.env.LS_STORE_ID)
  const productOk = !ctx.env.LS_PRODUCT_ID || String(meta.product_id ?? '') === String(ctx.env.LS_PRODUCT_ID)
  if ((ls?.activated || ls?.valid) && (!storeOk || !productOk)) {
    return json(200, { activated: false, valid: false, error: 'That key belongs to a different product' })
  }

  const lic = ls?.license_key ?? {}
  const active = lic.status === 'active'
  if (action === 'activate') {
    return json(200, {
      activated: Boolean(ls?.activated) && active,
      error: ls?.error ?? (active ? null : 'That key is not active — check your subscription'),
      instanceId: ls?.instance?.id ?? '',
      plan: meta.variant_name || meta.product_name || 'Vastu Studio',
      renewsAt: lic.expires_at ?? null,
    })
  }
  if (action === 'validate') {
    return json(200, {
      valid: Boolean(ls?.valid) && active,
      plan: meta.variant_name || meta.product_name || undefined,
      renewsAt: lic.expires_at ?? null,
    })
  }
  return json(200, { deactivated: Boolean(ls?.deactivated) })
}
