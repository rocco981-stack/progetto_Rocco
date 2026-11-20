/* BeCity – service worker: funzionamento offline */
const CACHE = "becity-1.0.0-5269b4ed75";
const PRECACHE = ["./","css/app.css","img/apple-touch-icon.png","img/apps/acc.jpg","img/apps/bim.jpg","img/apps/cad.jpg","img/apps/gis.jpg","img/apps/norm.jpg","img/apps/present.jpg","img/becity-256.png","img/hero-city.jpg","img/icon-192.png","img/icon-512.png","img/icon-maskable-512.png","index.html","js/acc-demo.js","js/acc.js","js/admin.js","js/bim/bim.js","js/bim/kernels.js","js/bim/model.js","js/bim-loader.js","js/bim.bundle.js","js/cad.js","js/cad3d.js","js/core.js","js/corpus.js","js/crs.js","js/gen.js","js/geoformats.js","js/geom.js","js/gis-ext.js","js/gis.js","js/home.js","js/kern/ifc-wasm.js","js/kern/ifc.js","js/kern/manifold-wasm.js","js/kern/manifold.js","js/kern/sqljs-wasm.js","js/kern/verb.js","js/mobile.js","js/norm.js","js/present.js","js/projects.js","js/samples.js","js/store.js","js/terra.js","js/writers.js","manifest.webmanifest","vendor/geotiff/geotiff.js","vendor/sqljs/sql-wasm.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('becity-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true }); if (hit) return hit;
    try { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }
    catch (err) { if (e.request.mode === 'navigate') { const idx = await c.match('./index.html'); if (idx) return idx; } throw err; }
  }));
});
