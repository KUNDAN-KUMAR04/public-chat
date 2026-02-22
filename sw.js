const CACHE_NAME = 'umchat-v1';

// 1. Install & Skip Waiting
// This tells the new version to take over immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 2. Activate & Claim Clients
// This makes the chat work the very first time it's opened
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// 3. The Fetch Engine
// This keeps the app fast and stable on old/slow connections
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
