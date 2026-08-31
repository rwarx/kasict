const SHELL_CACHE = 'shell-v5'
const API_CACHE = 'api-v1'

function resolve(path) {
  return new URL(path, self.location).href
}

const SHELL_ASSETS = [
  resolve('./'),
  resolve('./index.html'),
  resolve('./manifest.webmanifest'),
]

const DATA_ASSETS = [
  resolve('./data/schedule.json'),
  resolve('./data/replacements.json'),
  resolve('./data/meta.json'),
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll([...SHELL_ASSETS, ...DATA_ASSETS]),
    ).then(() => self.skipWaiting()),
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

// Фоновая проверка обновлений (Periodic Background Sync, Chrome/Android, установленное PWA)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'schedule-update') {
    event.waitUntil(checkForUpdates())
  }
})

async function checkForUpdates() {
  const cache = await caches.open(SHELL_CACHE)
  const metaUrl = resolve('./data/meta.json')
  let fresh
  try {
    fresh = await fetch(metaUrl, { cache: 'no-store' })
  } catch {
    return
  }
  if (!fresh.ok) return
  const freshText = await fresh.text()
  const cached = await cache.match(metaUrl)
  if (cached && (await cached.text()) === freshText) return

  // Обновляем офлайн-кэш свежими данными
  await Promise.all(['./data/schedule.json', './data/replacements.json'].map(async (p) => {
    try {
      const resp = await fetch(resolve(p))
      if (resp.ok) await cache.put(resolve(p), resp)
    } catch { /* ignore */ }
  }))
  await cache.put(metaUrl, new Response(freshText))

  let body = 'Расписание обновилось. Загляни!'
  try {
    const meta = JSON.parse(freshText)
    if (Array.isArray(meta.replacement_dates) && meta.replacement_dates.length) {
      const dates = meta.replacement_dates.map((iso) =>
        new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }))
      body = 'Новые замены: ' + dates.join(', ')
    }
  } catch { /* ignore */ }
  await self.registration.showNotification('Расписание обновлено', {
    body,
    tag: 'data-update',
    icon: resolve('./icons/icon-192.png'),
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(resolve('./'))
    }),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return

  // Навигация: network-first, чтобы после деплоя клиент сразу получал новый бандл
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone()
            caches.open(SHELL_CACHE).then((c) => c.put(event.request, clone))
          }
          return resp
        })
        .catch(() =>
          caches.match(event.request).then((c) => c || caches.match(resolve('./index.html'))),
        ),
    )
    return
  }

  // For data files: network-first (fresh data when online, cache when offline)
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone()
            caches.open(SHELL_CACHE).then((c) => c.put(event.request, clone))
          }
          return resp
        })
        .catch(() => caches.match(event.request)),
    )
    return
  }

  // Shell: cache-first with background update
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
