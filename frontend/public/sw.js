/* ─────────────────────────────────────────────────────────────────────────────
   LabControl PWA — Service Worker  (shell-only strategy)
   ─────────────────────────────────────────────────────────────────────────────
   Estrategia:
   • Activos del shell (/, /index.html, /icons/*, /static/*) → Cache First
   • Llamadas al API (/api/) → Network Only  (datos siempre frescos)
   • Fuentes externas (fonts.googleapis.com) → Stale-While-Revalidate
   ───────────────────────────────────────────────────────────────────────────── */

const CACHE_NAME    = 'labcontrol-shell-v1';
const FONT_CACHE    = 'labcontrol-fonts-v1';

// Archivos del shell que pre-cacheamos en el install
const SHELL_URLS = [
  '/',
  '/index.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

// ── Install: pre-cachear shell ────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// ── Activate: limpiar caches viejas ──────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. API calls → siempre network (nunca cachear datos del servidor)
  if (url.pathname.startsWith('/api/') || url.port === '8000') {
    return; // dejar pasar al network sin interceptar
  }

  // 2. Fuentes de Google → Stale-While-Revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // 3. CDN externos (Tailwind, etc.) → Stale-While-Revalidate
  if (url.hostname !== self.location.hostname) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
    return;
  }

  // 4. Shell local → Cache First, fallback a network, luego a /index.html
  event.respondWith(cacheFirst(request));
});

// ── Estrategias ───────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Cachear solo respuestas válidas de nuestro origen
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    // Sin red y sin cache → devolver el shell para que React maneje la ruta
    const shell = await caches.match('/index.html');
    return shell || new Response('Sin conexión', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached); // si falla la red, usar lo cacheado

  return cached || fetchPromise;
}

// ── Push Notifications (base lista para usar) ─────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  const title   = data.title   ?? 'LabControl';
  const options = {
    body:    data.body    ?? 'Tienes una nueva notificación.',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/favicon-32.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url ?? '/' },
    actions: data.actions ?? [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(target));
      return existing ? existing.focus() : clients.openWindow(target);
    })
  );
});
