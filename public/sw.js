/**
 * ProtoFace Service Worker
 * 
 * Caching Strategy (Option B):
 * - App shell: cached on install for offline access
 * - TTS engine (WASM): cached on install (~42MB)
 * - Voice models: already cached by the worker via Cache API
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `protoface-${CACHE_VERSION}`;

// Assets to cache on install (app shell + TTS engine)
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/site.webmanifest',
    '/favicon.ico',
    '/favicon-16x16.png',
    '/favicon-32x32.png',
    '/favicon-48x48.png',
    '/apple-touch-icon.png',
    '/android-chrome-192x192.png',
    '/android-chrome-512x512.png'
];

// TTS engine assets (large files, cached separately)
const TTS_ENGINE_ASSETS = [
    '/piper/espeakng.worker.data',
    '/piper/espeakng.worker.js',
    '/piper/espeakng.worker.wasm',
    '/piper/ort.min.js',
    '/piper/piper.js'
];

// Install event - precache assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);

            // Cache app shell
            console.log('[SW] Caching app shell...');
            await cache.addAll(PRECACHE_ASSETS);

            // Cache TTS engine assets (allow failures for individual files)
            console.log('[SW] Caching TTS engine...');
            for (const asset of TTS_ENGINE_ASSETS) {
                try {
                    await cache.add(asset);
                    console.log(`[SW] Cached: ${asset}`);
                } catch (e) {
                    console.warn(`[SW] Failed to cache: ${asset}`, e);
                }
            }

            // Skip waiting to activate immediately
            self.skipWaiting();
        })()
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        (async () => {
            // Clean up old cache versions
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter(name => name.startsWith('protoface-') && name !== CACHE_NAME)
                    .map(name => {
                        console.log(`[SW] Deleting old cache: ${name}`);
                        return caches.delete(name);
                    })
            );

            // Take control of all pages immediately
            await self.clients.claim();
        })()
    );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle same-origin requests
    if (url.origin !== self.location.origin) {
        return;
    }

    // For navigation requests (HTML), use network-first
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    // Try network first for fresh content
                    const networkResponse = await fetch(request);
                    // Cache the new version
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                } catch (e) {
                    // Fallback to cache if offline
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Fallback to cached index.html for SPA routing
                    return caches.match('/index.html');
                }
            })()
        );
        return;
    }

    // For assets, use cache-first
    event.respondWith(
        (async () => {
            // Check cache first
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                return cachedResponse;
            }

            // Fetch from network
            try {
                const networkResponse = await fetch(request);

                // Cache successful responses for static assets
                if (networkResponse.ok && request.method === 'GET') {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(request, networkResponse.clone());
                }

                return networkResponse;
            } catch (e) {
                // Return a fallback error response if offline and not cached
                console.error('[SW] Fetch failed:', request.url, e);
                return new Response('Offline and not cached', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            }
        })()
    );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
