// Cache the application shell only, never notebook state or API responses.
const CACHE_PREFIX = 'notebooks-shell-'
const CACHE_NAME = `${CACHE_PREFIX}v1`
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']
const PRIVATE_PATH = /^\/(?:connect|bot|uploads|r)(?:\/|$)/

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const response = await fetch('/', { cache: 'reload' })
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('Application shell is unavailable')
    }
    const html = await response.clone().text()
    // Vite emits hashed JS/CSS and module-preload links under /assets/.
    const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)]
      .map((match) => match[1])
    await cache.addAll([...SHELL_FILES.filter((path) => path !== '/'), ...new Set(assets)])
    await cache.put('/', response)
    // Let existing tabs keep their worker until they close to avoid mixed builds.
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || PRIVATE_PATH.test(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        // Only / may populate the offline index. Never cache route responses.
        if (url.pathname === '/' && !url.search && response.ok &&
            response.headers.get('content-type')?.includes('text/html')) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put('/', response.clone())
        }
        return response
      } catch (error) {
        const cache = await caches.open(CACHE_NAME)
        const shell = await cache.match('/')
        if (shell) return shell
        throw error
      }
    })())
    return
  }

  // An allowlist prevents accidental caching of room data and arbitrary requests.
  if (url.search || !(SHELL_FILES.includes(url.pathname) || url.pathname.startsWith('/assets/'))) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(request)
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
    return response
  })())
})
