// SERVICE WORKER — Ultra Max Global v3.0
// Strategy: Cache-first for static assets, Network-first for API

const CACHE_VERSION = 'um-global-v3';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './config.js',
    './core.js',
    './messages.js',
    './file-upload.js',
    './reactions.js',
    './typing-indicator.js',
    './read-receipts.js',
    './message-search.js',
    './dark-mode.js',
    './user-colors.js',
    './active-users.js',
    './special-box.js',
    './wipe-system.js',
    './emoji-support.js',
    './manifest.json'
];

// ── Install ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
            .catch(err => console.error('SW install error:', err))
    );
});

// ── Activate ───────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => !k.startsWith(CACHE_VERSION))
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Fetch ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET and Firebase/Google APIs — always network
    if (request.method !== 'GET') return;
    if (url.hostname.includes('firebase') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) {
        return; // let browser handle
    }
    if (url.protocol === 'chrome-extension:') return;

    // Cache-first for static assets
    if (STATIC_ASSETS.some(a => request.url.endsWith(a.replace('./', '')))) {
        event.respondWith(
            caches.match(request).then(cached => cached || fetchAndCache(request, STATIC_CACHE))
        );
        return;
    }

    // Images: cache with 24h TTL
    if (request.destination === 'image') {
        event.respondWith(
            caches.match(request).then(cached => cached || fetchAndCache(request, DYNAMIC_CACHE))
        );
        return;
    }

    // Everything else: network-first
    event.respondWith(
        fetch(request)
            .catch(() => caches.match(request))
    );
});

async function fetchAndCache(request, cacheName) {
    const response = await fetch(request);
    if (response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

console.log('✅ Service Worker v3 loaded');
