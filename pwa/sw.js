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
 * >>> Bump VERSION on every deploy, then run scripts/sign_release.mjs. <<<
 *
 * Signed releases (TOFU: this origin is trusted the same way HTTPS normally
 * is — on first visit; this protects the UPDATE path after that). Before
 * precaching, install() fetches release.json (a signed manifest of every
 * SHELL file's SHA-256, produced by scripts/sign_release.mjs) and
 * release-pubkey.json (the project's public key, committed — see
 * scripts/keygen.mjs), verifies the signature, then re-fetches and hashes
 * every SHELL file and compares. Any mismatch throws, which makes the
 * browser DISCARD this install — the previous version keeps serving and the
 * "new version" pill never appears. If release.json is simply absent (signing
 * was never run for this deploy), that's treated as "not yet signed" rather
 * than tampering: precaching proceeds unverified, with a console warning —
 * see verifyRelease() below for the exact reasoning.
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

/* ---------- signed-release verification (see file header) ---------- */

// Deterministic JSON: object keys sorted at every level, so the bytes we hash
// here are byte-identical to what scripts/sign_release.mjs signed. Keep this
// function IN SYNC with the copy there.
function canonicalize(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

async function sha256Hex(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Returns one of:
//   { ok: true }                              — verified, safe to precache
//   { ok: false, hard: false, reason }         — not signed (yet); precache
//                                                 unverified rather than
//                                                 brick installs over a
//                                                 missed deploy step
//   { ok: false, hard: true,  reason }         — signed but INVALID; caller
//                                                 must refuse this install
async function verifyRelease() {
  let release, pubJwk;
  try {
    const [rRes, pRes] = await Promise.all([
      fetch('./release.json', { cache: 'no-store' }),
      fetch('./release-pubkey.json', { cache: 'no-store' }),
    ]);
    if (!rRes.ok || !pRes.ok) return { ok: false, hard: false, reason: 'release.json/release-pubkey.json not found' };
    release = await rRes.json();
    pubJwk = await pRes.json();
  } catch (err) {
    return { ok: false, hard: false, reason: 'could not fetch release manifest: ' + err };
  }

  try {
    const pubKey = await crypto.subtle.importKey(
      'jwk', pubJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    const manifestBytes = new TextEncoder().encode(canonicalize(release.manifest));
    const sigBytes = base64ToBytes(release.signature);
    const validSig = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, sigBytes, manifestBytes);
    if (!validSig) return { ok: false, hard: true, reason: 'signature does not match manifest' };

    for (const [relPath, expectedHash] of Object.entries(release.manifest.files || {})) {
      const res = await fetch(relPath, { cache: 'no-store' });
      if (!res.ok) return { ok: false, hard: true, reason: 'could not fetch ' + relPath + ' to verify' };
      const hash = await sha256Hex(await res.arrayBuffer());
      if (hash !== expectedHash) return { ok: false, hard: true, reason: relPath + ' hash mismatch — served bytes do not match the signed manifest' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, hard: true, reason: 'verification error: ' + err };
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const verdict = await verifyRelease();
    if (verdict.hard) {
      // Reject the install entirely — the browser discards this SW version
      // and the currently-active one (if any) keeps serving. No "new
      // version" pill appears for a release that fails verification.
      console.error('[SW] Refusing this release — signed verification failed:', verdict.reason);
      throw new Error('release verification failed: ' + verdict.reason);
    }
    if (!verdict.ok) {
      console.warn('[SW] Precaching WITHOUT signature verification (%s). Run scripts/sign_release.mjs before deploying to enable it.', verdict.reason);
    }
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
