// Service worker mínimo para que la app se pueda instalar.
// Red primero; si no hay conexión, sirve la última versión guardada de la página.
const CACHE = 'rabeat-shell-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put('./', copy))
        return res
      })
      .catch(() => caches.match('./')),
  )
})
