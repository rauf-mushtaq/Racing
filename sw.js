// Sunset City service worker: once the game has loaded, it keeps working with no network.
//  * code and pages: network first (so a new version is picked up at once), the cached copy when offline
//  * models, textures, fonts, the engine: cache first (they never change under the same name)
//  * 'precache' message from the page: download every file in precache.json in the background
const CACHE = 'sunset-city-v2';
const HEAVY = /\.(glb|hdr|wasm|woff2|png|svg|mp3)(\?|$)|\/vendor\//;

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (HEAVY.test(url.pathname) && hit) return hit;
    try {
      const res = await fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' });          // (always check with the server: a new version is picked up at once)
      if (res.ok && res.status === 200) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (hit) return hit;
      if (req.mode === 'navigate') { const idx = await cache.match('index.html', { ignoreSearch: true }); if (idx) return idx; }
      throw err;
    }
  })());
});

self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'precache') return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const list = (await (await fetch('precache.json', { cache: 'no-cache' })).json()).files;
    let done = 0;
    const todo = list;
    for (let i = 0; i < todo.length; i += 4) {
      await Promise.all(todo.slice(i, i + 4).map(async f => {
        try { if (!(await cache.match(f, { ignoreSearch: true }))) { const r = await fetch(f); if (r.ok) await cache.put(f, r); } } catch (_) {}
        done++;
      }));
      if (e.source) e.source.postMessage({ type: 'precache-progress', done, total: todo.length });
    }
    if (e.source) e.source.postMessage({ type: 'precache-done', total: todo.length });
  })());
});
