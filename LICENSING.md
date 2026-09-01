# Vastu Studio — subscription licensing: how it works & how to launch

The app sells as a **subscription**. Payments, tax, invoices, renewals and license
keys are all handled by **Lemon Squeezy** (a merchant of record — you never build
or run a payment backend). The app checks keys through a tiny serverless function
that deploys automatically with the site on Cloudflare Pages.

**Trial model (already built in):** each device gets a **14-day trial** with the
full workflow — import, tracing, scale, compass, analysis — while **Export PNG,
the report's PDF/Print/Share, and Save project file** stay locked (they open the
activation page). When the 14 days end, the compass, zone readings, findings and
report lock too — plans and tracings stay viewable and editable, so nobody's work
is ever held hostage. A licence key unlocks everything on that device. Keys stop
working automatically when a subscription lapses (the app re-checks every 3 days
when online, with a 14-day offline grace window).

## The moving parts (all in this repo)

| Piece | File | What it does |
| --- | --- | --- |
| Master switch + links | `src/licenseConfig.ts` | `LICENSING_ENABLED` (currently **off** in production), checkout & billing-portal URLs |
| License engine | `src/license.ts` | activate / validate / deactivate, offline grace, trial gating |
| Activation page | `src/ui/ActivationPage.tsx` | the licensed front door (key entry, trial, licensed state) |
| Serverless check | `functions/api/license.ts` | `/api/license` — relays to Lemon Squeezy, rejects foreign keys |

Until `LICENSING_ENABLED` is flipped, the deployed app behaves exactly as before —
no gate, no locks. Dev builds (`npm run dev`) force it on; the key
`TEST-TEST-TEST-TEST` activates in dev only, so the whole flow is testable today.

## Launch checklist

### 1. Lemon Squeezy (~20 min)
1. Create a store at lemonsqueezy.com → complete payout details.
2. **New product** → e.g. "Vastu Studio" → pricing **Subscription** (pick monthly
   and/or yearly variants).
3. In the product's settings, enable **License keys** (set an activation limit,
   e.g. 3 devices; leave expiry "matches subscription").
4. Copy the product's **Buy link** → paste into `CHECKOUT_URL` in
   `src/licenseConfig.ts`.
5. Copy the **Customer portal** link (Settings → Customer portal) → `PORTAL_URL`.
6. Note your **Store ID** (Settings → Stores) and the **Product ID** (in the
   product's URL) for step 2 below.

### 2. Cloudflare Pages (~15 min, replaces GitHub Pages)
1. Make the GitHub repo **private** (repo Settings → Danger Zone → Change
   visibility). GitHub Pages free tier stops serving it — expected; Cloudflare
   takes over.
2. dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git** →
   pick the repo. Build command `npm run build`, output directory `dist`.
3. Project → **Settings → Environment variables** (Production):
   `LS_STORE_ID` = your store id, `LS_PRODUCT_ID` = your product id.
4. Deploy. The site gets `https://<project>.pages.dev` (add a custom domain
   whenever you like). The `/api/license` function is live automatically.
5. Delete `.github/workflows/deploy.yml` (or leave it — it will just fail
   silently once the repo is private).

### 3. Flip the switch
1. `src/licenseConfig.ts` → `LICENSING_ENABLED = true`.
2. For the Android/iOS apps: set `API_BASE` to the deployed origin (e.g.
   `https://vastustudio.pages.dev`) — the shells don't share the site's origin.
3. Commit & push → Cloudflare redeploys. Buyers get a key by email the moment
   they subscribe; the key deactivates itself if they cancel.

### Day-to-day
- **See customers / refunds / cancellations:** Lemon Squeezy dashboard.
- **Give someone free access:** LS dashboard → Licenses → generate a key.
- **A customer changes devices:** they tap *Deactivate this device* in the app
  (More → Licence & activation), or you raise the activation limit.
