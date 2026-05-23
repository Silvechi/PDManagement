// Service worker — enables PWA; network-first for app assets to prevent stale cache
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const { destination } = e.request;
  // Bypass HTTP cache for HTML/CSS/JS — fall back to cache if offline
  if (destination === 'document' || destination === 'script' || destination === 'style') {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).catch(() => fetch(e.request))
    );
  }
});
