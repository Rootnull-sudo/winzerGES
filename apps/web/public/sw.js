/**
 * Service worker de Winzer (PWA). Objetivo: que los módulos offline abran sin señal.
 *  - Estáticos de Next (/_next/static): cache-first (tienen hash en el nombre).
 *  - Páginas: red primero; si no hay red, la última versión guardada de esa página.
 *  - /api/*: nunca se cachea (los datos offline viven en IndexedDB, no aquí).
 */
const VERSION = 'winzer-v1';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg') {
    e.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) || fetch(req).then((r) => (r.ok && c.put(req, r.clone()), r))));
    return;
  }
  const isPage = req.mode === 'navigate' || req.headers.get('RSC') === '1';
  if (isPage) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok && !r.redirected) caches.open(PAGES).then((c) => c.put(req, r.clone()));
          return r;
        })
        .catch(async () => {
          const c = await caches.open(PAGES);
          return (
            (await c.match(req, { ignoreVary: true })) ||
            (await c.match(url.pathname, { ignoreVary: true })) ||
            new Response(
              '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>Sin conexión</title><body style="font-family:system-ui;padding:2rem;background:#faf8f4;color:#161412"><h1>Sin conexión</h1><p>Esta página aún no se había abierto en este equipo. Abre Winzer con señal al menos una vez en cada módulo que quieras usar sin conexión.</p>',
              { headers: { 'content-type': 'text/html; charset=utf-8' } }
            )
          );
        })
    );
  }
});
