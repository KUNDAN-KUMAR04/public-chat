const CACHE_NAME = 'umchat-v2';

// 1. INSTALL: Pre-cache the basic app shell
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forces the waiting service worker to become the active one immediately
});

// 2. ACTIVATE: Claim clients so the app works on the very first load
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); // Takes control of all open tabs immediately
});

// 3. FETCH: Network-first strategy (Best for Chat)
// It tries to get the latest messages from the web first, 
// but falls back to the cache if the user is in a elevator or tunnel.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
