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
const isHashedAsset = (url) => /\/assets\/.+-[\w-]{8,}\.(js|css|woff2?)$/.test(url.pathname)

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
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
    fetch(e.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((cache) => cache.put(e.request, res.clone()))
        return res
      })
      .catch(() => caches.open(CACHE).then((cache) => cache.match(e.request))),
  )
})
