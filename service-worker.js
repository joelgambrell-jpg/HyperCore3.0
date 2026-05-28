const CACHE_NAME = 'hypercore3-offline-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './equipment.html',
  './construction_check_sheet_import.html',
  './package_export.html',
  './assets/js/nexus-offline-store.js',
  './assets/js/nexus-sync-queue.js',
  './assets/js/nexus-dependency-guard.js',
  './assets/css/nexus-core.css',
  './nexus-core.js',
  './nexus-firebase-bridge.js',
  './nexus.png',
  './transformer.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .catch(err => console.warn('SW cache install warning', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request).then(resp => resp || caches.match('./index.html')))
  );
});
