// Die Schatten von Eldermoor – Service Worker (Offline-Cache)
// Autor: eldermoor-dev
// Bei jeder Änderung an einer Spieldatei VERSION erhöhen (gleichzeitig in main.js), sonst bleibt die alte Fassung im Cache.
const VERSION = '0.31.13';
const CACHE = 'eldermoor-' + VERSION;
const ASSETS = [
  './', './index.html', './main.js', './render.js', './logic.js', './audio.js', './store.js', './tests.js',
  './game.json', './manifest.webmanifest', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', (e) => {
  // cache:'reload' umgeht den HTTP-Cache von GitHub Pages, damit nie alte Dateien in den neuen Cache geraten
  // 0.24.2: fehlende Einzeldatei lässt die Installation nicht mehr scheitern (allSettled); neue Version übernimmt sofort (skipWaiting) statt zu warten, bis alle App-Fenster geschlossen sind
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('eldermoor-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      if (req.mode === 'navigate') { const fb = await caches.match('./index.html'); if (fb) return fb; }
      throw err;
    }
  })());
});
