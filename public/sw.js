self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Network-only. A fetch handler must exist for Chrome to offer the install
// prompt, but caching a Supabase-backed app badly is worse than not caching.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})