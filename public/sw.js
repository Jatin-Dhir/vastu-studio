/* Vastu Studio service worker — stale-while-revalidate for the app shell.
   Site visits happen in basements and low-signal plots; once loaded, the app works offline.
   Cross-origin requests (map tiles, geocoders) are left to the network on purpose. */
const CACHE = 'vastu-shell-v1'

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
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request)
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone())
          return res
        })
        .catch(() => cached)
      return cached ?? network
    }),
  )
})
