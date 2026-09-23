/* =========================================================
   SCFC StudentOS - PWA Service Worker (App Shell & Offline Support)
   Version: 5.0.0
   ========================================================= */

const CACHE_NAME = 'scfc-app-shell-v5.1';

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
  if (!response) return;

  const isCacheable = response.status === 200 || response.type === 'opaque' || response.type === 'cors';
  if (!isCacheable) return;

  try {
    const url = new URL(request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
  } catch (error) {
    console.warn('[SW] Cache skipped:', request.url, error);
  }
}

// Install Event - Pre-cache App Shell & Skip Waiting
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('[SW v5.0] Pre-caching app shell assets');
      await Promise.allSettled(
        STATIC_ASSETS.map(async (assetUrl) => {
          try {
            const req = new Request(assetUrl, { cache: 'reload' });
            const response = await fetch(req);
            const isVercelSso = response.url && response.url.includes('vercel.com/sso-api');
            if (response && response.ok && !isVercelSso) {
              await cache.put(req, response);
            }
          } catch (err) {
            console.warn('[SW] Could not pre-cache asset:', assetUrl);
          }
        })
      );
    })
  );
});

// Activate Event - Immediately Delete Old Caches & Claim Clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW v5.0] Removing obsolete cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event Handler - Network-First for Navigation (HTML), Stale-While-Revalidate for Assets
self.addEventListener('fetch', event => {
  const request = event.request;

  if (!request || request.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // 1. API Requests: Network First with Graceful Fallback JSON
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request.clone())
        .then(networkResponse => networkResponse)
        .catch(() => {
          return new Response(
            JSON.stringify({ offline: true, success: false, message: 'Operating in offline mode.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  const isHtmlNavigation = request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html') ||
    (request.headers.get('accept') && request.headers.get('accept').includes('text/html'));

  // 2. HTML Navigation Requests: NETWORK FIRST to guarantee fresh index.html
  if (isHtmlNavigation) {
    event.respondWith(
      fetch(request.clone())
        .then(async networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            await safeCachePut(request, responseToCache);
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline Fallback to cached index.html
          const cachedResponse = await caches.match(request) || await caches.match('/index.html');
          if (cachedResponse) return cachedResponse;
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        })
    );
    return;
  }

  // 3. Static Assets: Cache First with Background Network Revalidation
  event.respondWith(
    (async () => {
      try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          event.waitUntil(
            fetch(request).then(networkResponse => {
              if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                const responseToCache = networkResponse.clone();
                return safeCachePut(request, responseToCache);
              }
            }).catch(() => {})
          );
          return cachedResponse;
        }

        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const responseToCache = networkResponse.clone();
          event.waitUntil(safeCachePut(request, responseToCache));
        }
        return networkResponse;
      } catch (err) {
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      }
    })()
  );
});
