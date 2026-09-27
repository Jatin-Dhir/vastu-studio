/* Vastu Studio service worker. Site visits happen in basements and low-signal
   plots; once loaded, the app works offline. Cross-origin requests (map tiles,
   geocoders) are left to the network on purpose.

   What is cached, and how fresh each thing must be:
   - Hashed build assets (assets/<name>-<hash>.js/css/woff2) are immutable: a changed file
     gets a new URL, so a cached hit is never stale. The build writes their full list into
     BUILD_ASSETS below; install precaches them all, because the map, the report, PDF and
     DXF import and the exporters load on first use — a surface never opened online must
     still open offline. Activation prunes files the new build no longer lists.
   - The HTML shell names which hashed files to load, so serving it stale would keep a
     fixed bug alive: network-first — but with a ceiling, so a weak signal falls back to
     the cached shell after 2.5 s instead of waiting out a 15 s stall.
   - boot.js, the manifest, icons, the PDF report's fonts and the samples change rarely:
     cache-first, refreshed in the background.
   - The OCR engine (public/tessdata, ~5 MB) is cached the first time auto-detect runs, in
     its own cache. It used to be fetched for every visitor on activation, which saturated
     a slow link for a minute (the first PDF took 16 s instead of 5 s). */
const CACHE = 'vastu-shell-v3'
const OCR_CACHE = 'vastu-ocr-v1'
// replaced at build time with the build's hashed JS/CSS/font files (vite.config.ts swPrecache)
const BUILD_ASSETS = /*__BUILD_ASSETS__*/[]

const isHashedAsset = (url) => /\/assets\/.+-[\w-]{8,}\.(m?js|css|woff2?)$/.test(url.pathname)
const isOcr = (url) => url.pathname.includes('/tessdata/')
const isStatic = (url) => /\/(boot\.js|manifest\.webmanifest|icons\/|fonts\/|samples\/)/.test(url.pathname)

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(BUILD_ASSETS.map((path) =>
      cache.match(path).then((hit) => hit || cache.add(path)).catch(() => { /* next visit */ }),
    ))),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== OCR_CACHE).map((k) => caches.delete(k))))
      .then(() => caches.open(CACHE))
      .then(async (cache) => {
        // prune hashed files an earlier build left behind (each deploy used to add ~1.5 MB)
        if (!BUILD_ASSETS.length) return
        const keep = new Set(BUILD_ASSETS.map((p) => new URL(p, self.registration.scope).href))
        for (const req of await cache.keys()) {
          if (isHashedAsset(new URL(req.url)) && !keep.has(req.url)) await cache.delete(req)
        }
      })
      .then(() => self.clients.claim()),
  )
})

const cacheFirst = (cacheName, request, revalidate) =>
  caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request)
    const refresh = fetch(request).then((res) => {
      if (res.ok) cache.put(request, res.clone())
      return res
    })
    if (cached) {
      if (revalidate) refresh.catch(() => {})
      return cached
    }
    return refresh
  })

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return

  if (isHashedAsset(url)) { e.respondWith(cacheFirst(CACHE, e.request, false)); return }
  if (isOcr(url)) { e.respondWith(cacheFirst(OCR_CACHE, e.request, false)); return }
  if (isStatic(url)) { e.respondWith(cacheFirst(CACHE, e.request, true)); return }

  // shell/navigation: network-first so a deploy reaches returning users on their very next
  // load, not the one after — but never wait more than 2.5 s for it when a copy exists
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // no-cache: skip the host's 10-min HTTP cache and revalidate (a 304 when unchanged)
      const network = fetch(e.request, { cache: 'no-cache' }).then((res) => {
        if (res.ok) cache.put(e.request, res.clone())
        return res
      })
      const cached = await cache.match(e.request)
      if (!cached) return network
      const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), 2500))
      return Promise.race([network.catch(() => cached), timeout])
    }),
  )
})
