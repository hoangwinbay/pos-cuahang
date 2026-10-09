// Service Worker for POS PWA
const CACHE_NAME = 'pos-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network first fallback to cache strategy for fast & fresh data
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
