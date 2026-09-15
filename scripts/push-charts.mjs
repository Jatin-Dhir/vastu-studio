// Upload the practitioner's charts to the project's `charts` table, where the app
// fetches them from for a valid seat.
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/push-charts.mjs
//
// The service-role key never leaves this machine; it is only used to upsert rows.
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Project settings → API → service_role).')
  process.exit(1)
}

const { ZONE_RULES, GATE_QUALITY } = await import('../src/rules16.ts')
const rows = [
  { key: 'zone_rules', data: ZONE_RULES, updated_at: new Date().toISOString() },
  { key: 'gate_quality', data: GATE_QUALITY, updated_at: new Date().toISOString() },
]

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
console.log(`Uploaded ${rows.length} charts: ${Object.keys(ZONE_RULES).length} kind tables, ${Object.keys(GATE_QUALITY).length} gates.`)
