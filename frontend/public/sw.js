const CACHE = 'siga-shell-v3';
const SHELL = ['/', '/manifest.json'];

function cacheResponse(event, key, response) {
  if (!response.ok) return;
  // Clone before returning the response: the browser may consume it immediately.
  const copy = response.clone();
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.put(key, copy))
    .catch(() => { /* A cache failure must not interrupt the network response. */ }));
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      cacheResponse(event, '/', response);
      return response;
    }).catch(() => caches.match('/')));
    return;
  }

  if (/\.(?:js|css|png|jpg|jpeg|svg|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      cacheResponse(event, request, response);
      return response;
    })));
  }
});
