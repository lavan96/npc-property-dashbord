const CACHE_NAME = 'npc-property-v2-2026-04-15';
const OFFLINE_URL = '/offline.html';
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/manifest.json',
  '/images/npc-signature-logo.png',
  '/favicon.ico',
];

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName))
    );
    await self.clients.claim();
  })());
});

const isSameOrigin = (requestUrl) => new URL(requestUrl).origin === self.location.origin;

const shouldBypassCache = (event) => {
  const url = new URL(event.request.url);

  return event.request.mode === 'navigate'
    || event.request.destination === 'document'
    || event.request.destination === 'script'
    || event.request.destination === 'style'
    || url.pathname.startsWith('/assets/');
};

const shouldCacheResponse = (request, url) => {
  if (request.destination === 'image' || request.destination === 'font') {
    return true;
  }

  return PRECACHE_ASSETS.includes(url.pathname);
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !isSameOrigin(event.request.url)) return;

  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/supabase')) {
    return;
  }

  if (shouldBypassCache(event)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(async () => {
        if (event.request.mode === 'navigate') {
          return (await caches.match(OFFLINE_URL)) || new Response('Offline', { status: 503 });
        }

        const cached = await caches.match(event.request);
        return cached || new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  if (!shouldCacheResponse(event.request, url)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || new Response('Offline', { status: 503 });
      })
  );
});
