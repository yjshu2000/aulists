const CACHE_DO_NOT_BUMP = 'aulists-networkfirst-DO-NOT-BUMP';
const SHELL = [
  './',
  './index.html',
  './aulists.html',
  './hex2.html',
  './about.html',
  './style-minim.css',
  './style-colourful.css',
  './style-falsedge.css',
  './style-about.css',
  './style-hex2.css',
  './autorelists.js',
  './falsedge.js',
  './hex2-core.js',
  './hex2-base.js',
  './hex2-jiggly.js',
  './hex2-challenge.js',
  './manifest.json',
  './assets/icon.svg',
  './assets/icon-hex2.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_DO_NOT_BUMP).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => k !== CACHE_DO_NOT_BUMP)
        .map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches
          .open(CACHE_DO_NOT_BUMP)
          .then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
