// PLANY Service Worker - v6.5.0
const CACHE_NAME = 'plany-v6.5.0';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/firebase-config.js',
    '/js/capacitor-bridge.js',
    '/js/app.js',
    '/manifest.json',
    '/icons/icon-192.svg',
    '/icons/icon-512.svg',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

// Install - cache assets, then WAIT. (v6.0.2) Calling skipWaiting() here
// made every open tab reload itself a few minutes after each deploy, which
// threw away whatever lesson the teacher was typing. The new worker now waits
// until the teacher clicks "Update Now" (SKIP_WAITING message below) or every
// Plany tab is closed. The shell is fetched network-first anyway, so a normal
// reload already gets the new files.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

// Activate - delete ALL old caches, claim all clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

// Fetch - NETWORK FIRST for HTML/CSS/JS so deploys take effect immediately
self.addEventListener('fetch', (event) => {
    const { request } = event;
    // Only GETs are cacheable. POSTs (e.g. /api/ai) go straight to the network;
    // before this they fell into the cache-first branch below.
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    // Pass through Firebase, Google, Anthropic and external requests untouched
    if (url.hostname.includes('firebase') ||
        url.hostname.includes('google') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('cloudflare') ||
        url.hostname.includes('anthropic')) {
        return;
    }

    // Network-first for app shell files
    if (request.destination === 'document' ||
        request.destination === 'style' ||
        request.destination === 'script' ||
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js') ||
        url.pathname === '/') {

        // `cache: 'no-cache'` forces revalidation with the server. A plain fetch()
        // can be satisfied by the browser's own HTTP cache, so a redeploy would
        // not be picked up until that entry expired - exactly what happened when
        // Hosting served "/" with max-age=3600.
        event.respondWith(
            fetch(request, { cache: 'no-cache' })
                .then((response) => {
                    if (response && response.status === 200) {
                        const toCache = response.clone(); // clone BEFORE any body consumption
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(request, toCache));
                    }
                    return response;
                })
                .catch(() => caches.match(request)
                    .then((cached) => cached || (request.mode === 'navigate' ? caches.match('/index.html') : null))
                )
        );
        return;
    }

    // Cache-first for icons/fonts/images
    event.respondWith(
        caches.match(request)
            .then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    if (response && response.status === 200) {
                        const toCache = response.clone(); // clone BEFORE any body consumption
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(request, toCache));
                    }
                    return response;
                });
            })
    );
});

// Message handler
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data?.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys()
                .then((names) => Promise.all(names.map((n) => caches.delete(n))))
                .then(() => event.ports[0]?.postMessage({ success: true }))
        );
    }
});
