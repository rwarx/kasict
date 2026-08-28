// Service worker: offline shell + кэш ответов (network-first с фолбэком).
const SHELL_CACHE = 'shell-v3'
const API_CACHE = 'api-v1'

function resolve(path) {
  return new URL(path, self.location).href
}

const SHELL_ASSETS = [
  resolve('./'),
  resolve('./index.html'),
  resolve('./manifest.webmanifest'),
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => ![SHELL_CACHE, API_CACHE].includes(k)).map((k) => caches.delete(k)),
      ).then(() => self.clients.claim()),
    ),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return

  // Оболочка: cache-first с обновлением в фоне
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((resp) => {
          if (resp.ok && url.origin === location.origin) {
            const clone = resp.clone()
            caches.open(SHELL_CACHE).then((c) => c.put(event.request, clone))
          }
          return resp
        })
        .catch(() => cached)
      return cached || fetched
    }),
  )
})
