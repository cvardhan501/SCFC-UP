/* =========================================================
   SCFC StudentOS - PWA Service Worker (App Shell & Offline Support)
   Version: 4.0.0
   ========================================================= */

const CACHE_NAME = 'scfc-app-shell-v4';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/favicon.svg',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/lib/scfc-offline.js'
];

// Helper: Safely cache GET requests for http/https URLs only
async function safeCachePut(request, response) {
  if (!request || request.method !== 'GET') return;
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (!response || response.status !== 200) return;

    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch (error) {
    console.warn('[SW] Cache skipped:', request.url, error);
  }
}

// Install Event - Cache Static App Shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('[SW] Caching app shell assets');
      await cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting()).catch(err => {
      console.warn('[SW] App shell installation warning:', err);
    })
  );
});

// Activate Event - Clean Up Old Caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event Handler - Immediately Ignore Unsupported Schemes
self.addEventListener('fetch', event => {
  const request = event.request;

  // 1. Only process GET requests
  if (!request || request.method !== 'GET') {
    return;
  }

  // 2. Safely parse URL & IMMEDIATELY IGNORE unsupported schemes (chrome-extension, chrome, file, etc.)
  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // 3. Handle API Requests: Network First, Fallback to Offline Response
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(networkResponse => networkResponse)
        .catch(err => {
          console.log('[SW] API offline fallback for:', url.pathname);
          return new Response(
            JSON.stringify({ offline: true, message: 'Operating in offline mode.' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // 4. Handle Static App Shell Assets: Cache First, Network Fallback
  event.respondWith(
    (async () => {
      try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          // Fetch background update for cache freshness safely
          fetch(request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              safeCachePut(request, networkResponse);
            }
          }).catch(() => {/* Ignore network error offline */});
          return cachedResponse;
        }

        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          safeCachePut(request, networkResponse);
        }
        return networkResponse;
      } catch (err) {
        // If HTML request fails offline, return cached index.html
        if (request.headers.get('accept')?.includes('text/html')) {
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      }
    })()
  );
});
