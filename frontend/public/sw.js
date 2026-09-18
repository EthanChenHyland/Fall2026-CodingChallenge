const CACHE = 'mosaic-shell-__BUILD_ID__'
const SHELL = ['/', '/mosaic-favicon.svg', '/manifest.webmanifest', /* BUILD_ASSETS */]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  // Wait for existing tabs to close so they keep their matching shell/assets.
})
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('mosaic-shell-') && key !== CACHE).map((key) => caches.delete(key)))))
  self.clients.claim()
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(CACHE)).match('/')))
  } else if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(event.request)) || fetch(event.request)))
  }
})
