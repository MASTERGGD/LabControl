/* ─────────────────────────────────────────────────────────────────────────────
   LabControl PWA — Service Worker  (network-first para HTML, cache para assets)
   ─────────────────────────────────────────────────────────────────────────────
   Estrategia:
   • Navegación (HTML)  → Network First  (F5 siempre trae la versión más nueva)
   • Assets estáticos   → Cache First    (JS/CSS/iconos son inmutables por hash)
   • API (puerto 8000)  → Network Only   (datos siempre frescos)
   • Fuentes Google     → Stale-While-Revalidate
   ───────────────────────────────────────────────────────────────────────────── */

const CACHE_NAME    = 'labcontrol-shell-v3';
const FONT_CACHE    = 'labcontrol-fonts-v3';

// ── En desarrollo (localhost) → nunca cachear, todo va a la red ───────────────
const IS_DEV = self.location.hostname === 'localhost'
            || self.location.hostname === '127.0.0.1'
            || self.location.hostname.startsWith('192.168.');


// ── Install: activar inmediatamente sin pre-caché de HTML ─────────────────────
self.addEventListener('install', event => {
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

  // Ignorar todo lo que no sea http/https o no sea GET
  if (!url.protocol.startsWith('http') || request.method !== 'GET') {
    return;
  }

  // En desarrollo: pasar siempre a la red, sin caché → F5 siempre trae lo nuevo
  if (IS_DEV) {
    return; // el navegador maneja la petición normalmente
  }

  // 1. API calls (puerto 8000 o /api/) → siempre network, sin interceptar
  if (url.port === '8000' || url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Fuentes de Google → Stale-While-Revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // 3. Navegación (peticiones de página HTML) → Network First
  //    Esto asegura que F5 siempre traiga index.html fresco del servidor.
  //    Solo cae al caché si no hay conexión.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  // 4. Assets estáticos con hash en el nombre (JS/CSS de CRA) → Cache First
  //    Estos tienen hashes únicos por build, nunca cambian una vez subidos.
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 5. Demás recursos locales (iconos, manifest, etc.) → Network First con fallback
  event.respondWith(networkFirst(request));
});

// ── Estrategias ───────────────────────────────────────────────────────────────

/** Network First para navegación — devuelve index.html del servidor siempre que haya red */
async function networkFirstHTML(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    // Sin red → servir desde caché si existe
    const cached = await caches.match(request)
                || await caches.match('/index.html');
    return cached || new Response('Sin conexión', { status: 503 });
  }
}

/** Network First genérico */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || new Response('Sin conexión', { status: 503 });
  }
}

/** Cache First para assets estáticos con hash */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return new Response('Sin conexión', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    // Solo cachear respuestas de esquemas soportados (http/https)
    if (response.ok && request.url.startsWith('http')) {
      cache.put(request, response.clone());
    }
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
