const CACHE_NAME = 'ilara-shell-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/images/logo_icon.png',
  '/images/logo_text.png',
  '/food_platter.png',
  '/milkshake.png',
  '/thickshake.png'
];

// Install event: cache the offline shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith('ilara-shell-')) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: network-first for pages (with offline shell fallback), cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and dev hot reload/browser extension requests
  if (request.method !== 'GET' || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return;
  }

  // Bypass service worker entirely for operations and api
  if (url.pathname.startsWith('/operations') || url.pathname.startsWith('/api/')) {
    return;
  }

  // HTML Page Navigation requests: Network-first, fallback to cached '/' offline shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/').then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response('Service Unavailable (Offline)', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
    );
    return;
  }

  // Static Assets (CSS, JS, Images, Fonts): Cache-first, fallback to Network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        // Cache valid fetched static assets dynamically (optional, but keep it light)
        if (
          networkResponse.status === 200 &&
          (url.pathname.endsWith('.js') ||
           url.pathname.endsWith('.css') ||
           url.pathname.match(/\.(png|jpg|jpeg|gif|svg|woff2|woff)$/))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
