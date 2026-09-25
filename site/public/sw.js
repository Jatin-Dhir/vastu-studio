/* The studio used to live at this URL and registered a service worker here with the whole
   site as its scope. It now lives under app/ with its own worker, so this file exists only to
   retire the old registration in browsers that still hold it: it unregisters itself and
   reloads its pages so they pick up the plain network. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((c) => c.navigate(c.url))),
  )
})
