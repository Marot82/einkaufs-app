// Service Worker: hält die App offline verfügbar.
// Strategie "stale-while-revalidate": erst aus dem Cache antworten (schnell,
// geht auch ohne Netz), im Hintergrund frische Version nachladen.

const CACHE = 'eka-v4';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/shopping.js',
  './js/storage.js',
  './js/parse.js',
  './js/categories.js',
  './js/recipes.js',
  './js/recipeParse.js',
  './js/cooking.js',
  './js/seed.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fresh = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
