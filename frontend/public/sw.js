/* Service Worker de limpieza para desarrollo.
   Si alguna version anterior quedo registrada, este archivo se instala,
   limpia caches locales y se desregistra para que React siempre cargue fresco. */

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))),
      self.registration.unregister(),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => clients.forEach(client => client.navigate(client.url))),
    ])
  );
});

self.addEventListener('fetch', () => {
  return;
});
