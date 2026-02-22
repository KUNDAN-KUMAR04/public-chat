const CACHE_NAME = 'umchat-v1';

// We install the service worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// This allows the app to work faster on repeat visits
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
