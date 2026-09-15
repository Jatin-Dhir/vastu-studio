# Vastu Studio — accounts, one device at a time, and the admin panel

Access is by **account** (phone number + password), not a licence key. One account holds
**one seat**: signing in on a second device signs the first one out. The practitioner's
charts (the 30 kind tables and the 32-gate wheel) live on the server and are only
delivered to a device holding a valid seat — a copied or cracked app has no analysis.

Everything runs on one free **Supabase** project (Postgres + auth + row-level security).
Until the two environment variables below are set, the app runs open — exactly as it did
before accounts existed — so nothing breaks mid-setup.

## One-time setup (~20 minutes)

1. **Create the project** — supabase.com → New project → region *Mumbai (ap-south-1)*.
   Save the database password somewhere safe.
2. **Phone sign-in** — Authentication → Providers → Phone → **Enable**. Leave *Enable phone
   confirmations* **off** (users are created by the admin, never self-signup, so no SMS is sent).
   Authentication → Settings → turn **Allow new users to sign up** off.
3. **Schema** — SQL Editor → paste `supabase/migrations/20260915120000_access.sql` → Run.
4. **Admin function** — from this folder, once:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>      # the id in the project URL
   npx supabase functions deploy admin-users
   ```
5. **Charts** — Project settings → API → copy the `service_role` key (secret — never put it in
   the app), then:
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/push-charts.mjs
   ```
6. **First admin** — Authentication → Users → *Add user* → phone (E.164, e.g. `+919876543210`)
   + password, tick *Auto confirm*. Then SQL Editor:
   `update public.profiles set role = 'admin', name = 'Your name' where phone = '+919876543210';`
7. **Wire the app** — Project settings → API → copy the *Project URL* and the `anon` key:
   - local: copy `.env.example` to `.env.local` and fill both values;
   - deployed: GitHub repo → Settings → Secrets → Actions → `VITE_SUPABASE_URL` and
     `VITE_SUPABASE_ANON_KEY`. The next push builds with accounts on.

## Day to day (the admin panel)

Open the app → More → **Admin panel** (or `#/admin`). Admin accounts only.

- **New user** — name, phone, password, days of access. Tell them the phone + password;
  they can't sign up themselves.
- **Access until** — type a date or *+30 d* / *+1 y*. Past the date the app locks with
  "Subscription ended"; their saved plans stay on their device.
- **Switch off** — immediate lock, reversible. **Delete** — the account is gone for good.
- **Sign out** — frees the seat (e.g. a lost laptop). **Password** — sets a new one.
- **Message to all users** — a banner every user sees once inside the app.
- **Stats** — users, active this week, expiring soon, plans analysed and reports made.

## How the seat rule behaves

- Sign-in claims the seat for that device; a later sign-in elsewhere takes it over, and the
  first device sees "Signed in elsewhere" on its next check (at most 5 minutes, or the
  moment the window regains focus).
- Offline, the app keeps working for **3 days** after its last successful check, with the
  charts it already has. Beyond that it asks to reconnect.
- A revoked, expired or switched-off account is locked within the same 5-minute window.

## Where things live

| Piece | File |
| --- | --- |
| Schema, policies, RPCs | `supabase/migrations/20260915120000_access.sql` |
| Admin-only user creation | `supabase/functions/admin-users/index.ts` |
| Chart upload | `scripts/push-charts.mjs` |
| Session, heartbeat, offline grace | `src/auth/session.ts` |
| Login page | `src/auth/LoginPage.tsx` |
| Admin panel | `src/admin/AdminPage.tsx` |
| Runtime chart registry | `src/rules16.ts` (`setCharts`) |
