// Upload the practitioner's charts to the project's `charts` table, where the app fetches
// them from for a valid seat. Reads rules/charts.json (gitignored — the charts never live
// in the repo or the app bundle).
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/push-charts.mjs
//
// The service-role key never leaves this machine; it is only used to upsert rows.
import { readFileSync } from 'node:fs'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Project settings → API → service_role).')
  process.exit(1)
}

let charts
try { charts = JSON.parse(readFileSync(new URL('../rules/charts.json', import.meta.url), 'utf8')) }
catch { console.error('rules/charts.json not found — export it from the current tables first (see ACCESS.md).'); process.exit(1) }

const now = new Date().toISOString()
const rows = Object.entries(charts).map(([k, data]) => ({ key: k, data, updated_at: now }))

const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/charts`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(rows),
})
if (!res.ok) {
  console.error('Upload failed:', res.status, await res.text())
  process.exit(1)
}
console.log(`Uploaded ${rows.length} charts: ${rows.map((r) => `${r.key} (${Object.keys(r.data).length})`).join(', ')}.`)
