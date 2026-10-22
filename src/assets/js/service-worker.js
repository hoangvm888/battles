/* The Quizio template worker, adapted for the React shell by client/templatePlugin.ts. */
const CACHE_NAME = 'quizio-battles-__QUIZIO_VERSION__';
const PRECACHE = __QUIZIO_PRECACHE__;
const PUBLIC_URLS = new Set(PRECACHE.map((url) => new URL(url, self.location.origin).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          PRECACHE.map((url) => new Request(url, { cache: 'reload', credentials: 'omit' })),
        ),
      ),
  );
  // Updates wait until the player explicitly accepts a reload.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name === 'clickmart' || (name.startsWith('quizio-battles-') && name !== CACHE_NAME),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/api/')
  )
    return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        // Only the public HTML shell is retained; account responses and routes are never cached.
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/index.html')) || Response.error();
      }),
    );
    return;
  }
  if (!PUBLIC_URLS.has(url.href)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const existing = await cache.match(request);
      if (existing) return existing;
      const response = await fetch(request);
      if (
        response.ok &&
        response.type === 'basic' &&
        !response.redirected &&
        !/private|no-store/i.test(response.headers.get('Cache-Control') || '') &&
        !/text\/html/i.test(response.headers.get('Content-Type') || '')
      ) {
        event.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    })(),
  );
});
