// Service Worker for POS PWA
const CACHE_NAME = 'pos-pwa-v6';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Network first fallback to cache strategy for fast & fresh data
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
