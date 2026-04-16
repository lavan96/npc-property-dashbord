/**
 * Service Worker — Network-First strategy
 * Vite's content-hashed filenames handle cache busting for JS/CSS.
 * This SW only provides offline fallback and caches images/fonts.
 */

const CACHE_NAME = 'npc-property-v3';
const OFFLINE_URL = '/offline.html';

// ── Lifecycle ──

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([OFFLINE_URL]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purge ALL old caches
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// ── Fetch handling ──

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept cross-origin, API, or supabase requests
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/supabase')) return;

  // Navigation requests → network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached || new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // JS, CSS, HTML → always network (Vite hashes handle caching)
  const dest = request.destination;
  if (dest === 'script' || dest === 'style' || dest === 'document' || url.pathname.startsWith('/assets/')) {
    // Don't intercept — let the browser handle it normally
    return;
  }

  // Images & fonts → stale-while-revalidate (cache but refresh in background)
  if (dest === 'image' || dest === 'font') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      const networkFetch = fetch(request).then(response => {
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(() => null);

      // Return cached immediately, refresh in background
      if (cached) {
        // Fire-and-forget revalidation
        networkFetch;
        return cached;
      }

      // No cache — must wait for network
      const networkResponse = await networkFetch;
      return networkResponse || new Response('', { status: 404 });
    })());
    return;
  }

  // Everything else — don't intercept
});
