// SERVICE WORKER - Ultra Max Global
// Handles caching, offline support, and background sync

const CACHE_VERSION = 'um-global-v2.0';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;
const CACHE_IMAGES = `${CACHE_VERSION}-images`;

const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './config.js',
    './manifest.json'
];

// INSTALL EVENT - Cache static assets
self.addEventListener('install', (event) => {
    console.log('SW: Installing...');
    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_STATIC);
                await cache.addAll(STATIC_ASSETS);
                console.log('✓ Static assets cached');
                self.skipWaiting();
            } catch (e) {
                console.error('Cache installation error:', e);
            }
        })()
    );
});

// ACTIVATE EVENT - Cleanup old caches
self.addEventListener('activate', (event) => {
    console.log('SW: Activating...');
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map(name => {
                    if (!name.includes(CACHE_VERSION)) {
                        console.log(`✓ Removed old cache: ${name}`);
                        return caches.delete(name);
                    }
                })
            );
            self.clients.claim();
        })()
    );
});

// FETCH EVENT - Intelligent caching strategy
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip Firebase Firestore/Storage requests - let them go directly
    if (url.origin.includes('firebaseio') || url.origin.includes('firebasestorage') || url.origin.includes('googleapis')) {
        event.respondWith(fetch(request));
        return;
    }

    // Skip chrome extensions
    if (url.protocol === 'chrome-extension:') {
        return;
    }

    // Static assets - Cache first
    if (STATIC_ASSETS.some(asset => request.url.includes(asset))) {
        event.respondWith(
            caches.match(request).then((response) => {
                return response || fetch(request).then((response) => {
                    return caches.open(CACHE_STATIC).then((cache) => {
                        cache.put(request, response.clone());
                        return response;
                    });
                });
            }).catch(() => {
                return caches.match(request);
            })
        );
        return;
    }

    // Images - Cache with network fallback
    if (request.destination === 'image') {
        event.respondWith(
            caches.match(request).then((response) => {
                return response || fetch(request).then((response) => {
                    return caches.open(CACHE_IMAGES).then((cache) => {
                        cache.put(request, response.clone());
                        return response;
                    });
                }).catch(() => {
                    return new Response('Image not available offline', { status: 404 });
                });
            })
        );
        return;
    }

    // API calls - Network first
    if (request.method === 'GET') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const responseClone = response.clone();
                    caches.open(CACHE_DYNAMIC).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    return caches.match(request) || new Response('Offline - data not available', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: new Headers({ 'Content-Type': 'text/plain' })
                    });
                })
        );
        return;
    }

    // POST/PUT/DELETE - Network only
    event.respondWith(fetch(request));
});

// MESSAGE HANDLING - Support background sync
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// PERIODIC BACKGROUND SYNC (optional)
if ('periodicSync' in self.registration) {
    self.addEventListener('periodicsync', (event) => {
        if (event.tag === 'sync-messages') {
            console.log('Background sync: Syncing messages...');
            // Sync logic here
        }
    });
}

console.log('✓ Service Worker loaded');
