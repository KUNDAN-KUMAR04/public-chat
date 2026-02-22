const CACHE_NAME = 'um-bridge-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('fetch', (event) => {
  // Only cache static files, let Firebase stream the large files directly to device
  if (!event.request.url.includes('firebasestorage')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
