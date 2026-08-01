/* OpenCairn PWA — service worker.
 * Emulates "the server" on-device: precache the app shell + the full trail seed +
 * the self-hosted map/QR libraries + the glyph PBFs so the app boots, browses and
 * LABELS with zero signal, and cache basemap tiles + geocoder responses at runtime
 * so any trail you've panned once stays available on the trail.
 *
 * Correctness notes (learned the hard way):
 *  - Tiles/glyphs are requested by MapLibre in **cors** mode (WebGL needs
 *    untainted images). We therefore pass the request through UNCHANGED —
 *    forcing mode:'no-cors' would produce an opaque response, which is a
 *    spec-mandated network error for a cors request → blank basemap on the
 *    2nd load / installed / offline. Never do that.
 *  - Only res.ok responses are cached (no opaque padding, no cached 500s).
 *  - The precache is fully same-origin & deterministic (everything self-hosted).
 *
 * Update path: a new VERSION installs in the background; the page shows a
 * "new version" pill, posts 'skipWaiting', and reloads on controllerchange.
 * >>> Bump VERSION on every deploy. <<<
 */
const VERSION = 'v12';
const SHELL_CACHE = 'opencairn-shell-' + VERSION;
const TILE_CACHE = 'opencairn-tiles-' + VERSION;   // runtime raster tiles (LRU-capped)
const DATA_CACHE = 'opencairn-runtime-' + VERSION; // geocode / forecast responses
const TILE_LIMIT = 1600;                           // ~1600 tiles ≈ a few tens of MB @2x

// Everything the app needs to boot offline — all same-origin, all deterministic.
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './webProfile.js',
  './breadcrumb.js',
  './install/install.html',
  './install/install.js',
  './manifest.webmanifest',
  './trails.min.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './vendor/maplibre-gl.js',
  './vendor/maplibre-gl.css',
  './vendor/qrcode-generator.js',
  // Glyphs are needed at FIRST render (cluster counts show at the initial zoom),
  // so they live in the precache — never evictable by the tile LRU.
  './vendor/fonts/Open Sans Regular/0-255.pbf',
  './vendor/fonts/Open Sans Regular/256-511.pbf',
];

// Absolute-URL set of the shell, so the runtime fetch handler can refuse to
// grow SHELL_CACHE beyond the deterministic precache (same-origin dynamic GETs
// used to be cached forever here — an unbounded, never-evicted cache).
const SHELL_URLS = new Set(SHELL.map((p) => new URL(p, self.location.href).href));

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    // addAll is atomic and rejects on any non-ok response → a broken deploy
    // never half-installs; the old SW keeps serving and we retry next load.
    await c.addAll(SHELL);
    // NOTE: no skipWaiting() here — the page drives activation via the
    // "New version — tap to refresh" flow (message handler below).
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, TILE_CACHE, DATA_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Trim a cache to a max entry count (rough LRU: oldest inserted evicted first).
 * Debounced: cache.keys() over ~1,600 entries must not run on every tile put.
 * Delay is short (1 s): the browser may kill an idle SW at any time, and a
 * long-armed timer dies with it — the trim would then never run. */
let _trimTimer = null;
function scheduleTrim() {
  if (_trimTimer) return;
  _trimTimer = setTimeout(async () => {
    _trimTimer = null;
    try {
      const c = await caches.open(TILE_CACHE);
      const keys = await c.keys();
      if (keys.length <= TILE_LIMIT) return;
      for (let i = 0; i < keys.length - TILE_LIMIT; i++) await c.delete(keys[i]);
    } catch {}
  }, 1000);
}

function isTile(url) {
  return /(^|\.)basemaps\.cartocdn\.com$/.test(url.hostname) ||
         /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname) ||
         /(^|\.)tile\.opentopomap\.org$/.test(url.hostname);
}
function isGeocode(url) {
  return url.hostname.includes('nominatim.openstreetmap.org') ||
         url.hostname.includes('api.weather.gov');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }

  // 1) Basemap tiles — cache-first (tiles are immutable enough for a demo),
  //    fetched with the request UNCHANGED (cors stays cors), ok-only cached.
  if (isTile(url)) {
    e.respondWith((async () => {
      const c = await caches.open(TILE_CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        // put() rejects on storage quota — swallow it, the network response stands
        if (res && res.ok) { c.put(req, res.clone()).catch(() => {}); scheduleTrim(); }
        return res;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  // 2) Geocode / forecast — network-first, fall back to last GOOD response.
  if (isGeocode(url)) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) { // never cache (or later serve) a 500
          const c = await caches.open(DATA_CACHE);
          c.put(req, res.clone()).catch(() => {}); // quota rejection must stay contained
        }
        return res;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  // 3) Same-origin shell (incl. vendored libs + glyphs) — cache-first.
  //    Only files on the SHELL list are ever (re)saved: SHELL_CACHE stays the
  //    deterministic precache, not a grow-forever dump of every same-origin GET.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok && SHELL_URLS.has(url.origin + url.pathname)) {
          const c = await caches.open(SHELL_CACHE);
          c.put(req, res.clone()).catch(() => {}); // quota rejection must stay contained
        }
        return res;
      } catch {
        // Offline navigation → hand back the app shell so the SPA still boots.
        if (req.mode === 'navigate') {
          return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
        }
        return Response.error();
      }
    })());
  }
});

// The page posts 'skipWaiting' when the user taps the "new version" pill.
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
