const CACHE_NAME = 'ilara-shell-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/images/logo_icon.png',
  '/images/logo_text.png'
];

// Install event: cache the offline shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline shell');
      return cache.addAll(ASSETS_TO_CACHE).catch(e => {
        // Log gracefully so install doesn't crash on quota errors
        console.warn('Cache addAll failed (possibly quota full):', e);
      });
    }).catch((e) => {
      console.warn('Cache open failed (possibly quota full):', e);
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
            return caches.delete(cacheName).catch(e => console.warn('Cache delete failed:', e));
          }
        })
      );
    }).catch((e) => console.warn('Cache keys failed:', e))
      .then(() => self.clients.claim())
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
        return caches.match('/').catch(() => null).then(cachedResponse => {
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
  // (No unbounded runtime caching)
  event.respondWith(
    caches.match(request).catch(() => null).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).catch((error) => {
        // Fallback for static assets on network failure
        console.warn('Network fetch failed for asset:', request.url);
        throw error;
      });
    })
  );
});
