/**
 * Licensing configuration — the one file to edit at launch.
 *
 * The subscription runs on Lemon Squeezy (merchant of record: they take payment,
 * handle tax, auto-issue a license key per subscriber, and disable the key when a
 * subscription lapses). The app never talks to Lemon Squeezy directly — it calls
 * our own `/api/license` Cloudflare Pages Function (functions/api/license.ts),
 * which forwards to their License API and refuses keys from any other store.
 *
 * Launch checklist (details in LICENSING.md):
 *  1. Create the Lemon Squeezy store + a subscription product with license keys on.
 *  2. Fill CHECKOUT_URL and PORTAL_URL below.
 *  3. Set LS_STORE_ID / LS_PRODUCT_ID env vars on the Cloudflare Pages project.
 *  4. Flip LICENSING_ENABLED to true and deploy.
 */

/** Master switch. false = the app behaves exactly as before (no gate, no locks).
 *  Dev builds force it on so the flow can be built and tested before launch. */
export const LICENSING_ENABLED: boolean = import.meta.env.DEV ? true : false

/** "Subscribe" destination — the Lemon Squeezy checkout link for the product. */
export const CHECKOUT_URL = ''

/** "Manage billing" destination — the Lemon Squeezy customer portal link. */
export const PORTAL_URL = ''

/** Where /api/license lives. '' = same origin (the web app on Cloudflare Pages).
 *  The Capacitor shells load from capacitor://localhost, so native builds must
 *  point at the deployed site's absolute origin, e.g. 'https://vastustudio.app'. */
export const API_BASE = ''

/** Revalidate an active key against the store this often (ms) while online. */
export const REVALIDATE_EVERY = 3 * 24 * 60 * 60 * 1000
/** Keep an active key working this long (ms) past its last successful check when
 *  offline or the store is unreachable — site visits shouldn't need connectivity. */
export const OFFLINE_GRACE = 14 * 24 * 60 * 60 * 1000
