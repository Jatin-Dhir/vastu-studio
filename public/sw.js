/* Vastu Studio service worker. Site visits happen in basements and low-signal
   plots; once loaded, the app works offline. Cross-origin requests (map tiles,
   geocoders) are left to the network on purpose.

   Two different freshness rules, because two different things are cached:
   - The HTML shell (index.html / navigations) names which hashed JS/CSS to
     load, so serving it stale means shipping a fix and having returning users
     keep seeing the old bug — network-first, cache only as an offline fallback.
   - Hashed assets (index-<hash>.js/css) are immutable by construction: a
     changed file gets a new URL, so a cached hit is NEVER stale. Cache-first
     is correct and fast for these, no revalidation needed. */
const CACHE = 'vastu-shell-v2'
const isHashedAsset = (url) => /\/assets\/.+-[\w-]{8,}\.(m?js|css|woff2?)$/.test(url.pathname)

// OCR's worker script, wasm core and English trained data (~5MB total, public/tessdata/) are
// never hashed — auto-detect rooms works offline from a practitioner's very first tap, so warm
// them into the cache once this SW is in control, the same way src/importers/pdf.ts warms the
// pdf.worker via serviceWorker.ready — just done from this side since these are plain paths.
const TESSDATA_ASSETS = [
  'tessdata/worker.min.js',
  'tessdata/tesseract-core-simd-lstm.js',
  'tessdata/tesseract-core-simd-lstm.wasm',
  'tessdata/eng.traineddata.gz',
]

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim())
      .then(() => caches.open(CACHE))
      .then((cache) => Promise.all(TESSDATA_ASSETS.map((path) =>
        cache.match(path).then((hit) => hit || fetch(path).then((res) => {
          if (res.ok) cache.put(path, res.clone())
          return res
        })).catch(() => {}),
      ))),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return

  if (isHashedAsset(url)) {
    // cache-first: a hit is always correct, a miss populates the cache once
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(e.request)
        if (cached) return cached
        const res = await fetch(e.request)
        if (res.ok) cache.put(e.request, res.clone())
        return res
      }),
    )
    return
  }

  // shell/navigation: network-first so a deploy reaches returning users on
  // their very next load, not the one after — cache is the offline fallback only
  e.respondWith(
    // no-cache: skip the host's 10-min HTTP cache and revalidate (a 304 when unchanged)
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((cache) => cache.put(e.request, res.clone()))
        return res
      })
      .catch(() => caches.open(CACHE).then((cache) => cache.match(e.request))),
  )
})
