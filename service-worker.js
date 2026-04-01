const CACHE_NAME = 'flexi-cuentas-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './assets/css/styles.css',
  './assets/js/app.js',
  './assets/img/logo_flexi_cuentas.png',
  './assets/img/pixar_beagle.png',
  './assets/img/pixar_bunny.png',
  './assets/img/pixar_butterfly.png',
  './assets/img/pixar_cat.png',
  './assets/img/pixar_cow.png',
  './assets/img/pixar_fox.png',
  './assets/img/pixar_frog.png',
  './assets/img/pixar_giraffe.png',
  './assets/img/pixar_lion.png',
  './assets/img/pixar_monkey.png',
  './assets/img/pixar_panda.png',
  './assets/img/pixar_penguin.png',
  './assets/img/pixar_piggy.png',
  './assets/img/pixar_sloth.png',
  './assets/img/pixar_toucan.png',
  './assets/img/pixar_turtle.png',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
