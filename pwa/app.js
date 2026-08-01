/* OpenCairn PWA — Wisconsin trail demo.
 * Vanilla JS, no framework. Persistent MapLibre shell + hash router + bottom sheets.
 * Data: 4,000+ trail LineStrings from trails.min.json (id/name/region). No backend.
 *
 * Perf strategy for ~4k trails / ~78k vertices:
 *   - ALL trail lines live in ONE GeoJSON source / ONE WebGL line layer (data-driven
 *     colour by region) — GPU-rendered, effectively free to pan/zoom.
 *   - The GeoJSON source is tiled+simplified by zoom by MapLibre's built-in
 *     geojson-vt (explicit `tolerance`/`maxzoom`/`buffer` below): at overview zooms
 *     each tile carries a few hundred simplified vertices, never all 78k.
 *   - Trailhead "cairns" (one Point per trail) live in a CLUSTERED GeoJSON source,
 *     so the map only ever draws a few dozen circles, not thousands of DOM markers.
 *   - LITE tier (webProfile.js): coarser simplification, no retina tiles, lines
 *     hidden below z10 (clusters carry the overview), zero animation.
 *   - The browse list renders incrementally (60 at a time) from an in-memory index.
 *   - Only the *selected* route ever gets real DOM waypoint pins (2–3 of them).
 */
'use strict';

/* ----------------------------- constants ----------------------------- */
/* REGION_COLOR is the single source of truth: the legend, the browse dots AND
 * the map layer's match expression are all generated from it. */
const REGION_COLOR = {
  'Northwoods & Apostle Islands, WI': '#58913b',
  'Door County & Lakeshore, WI': '#346cb2',
  'Milwaukee & Kettle Moraine, WI': '#218c85',
  'Madison & Southern Lakes, WI': '#7751b8',
  'Driftless Area / Mississippi River Valley, WI': '#b25a34',
  'Central Sands & Wisconsin Dells, WI': '#b18725',
};
const REGION_DEFAULT = '#5c6b66';
const REGION_SHORT = {
  'Northwoods & Apostle Islands, WI': 'Northwoods',
  'Door County & Lakeshore, WI': 'Door County',
  'Milwaukee & Kettle Moraine, WI': 'Milwaukee',
  'Madison & Southern Lakes, WI': 'Madison',
  'Driftless Area / Mississippi River Valley, WI': 'Driftless Area',
  'Central Sands & Wisconsin Dells, WI': 'Central Sands',
};
// waypoint type → {colour var, glyph}
const TYPE = {
  'parking-trailhead': { c: 'var(--park)',     e: 'P' },
  'water':             { c: 'var(--water)',    e: '~' },
  'hazard':            { c: 'var(--hazard)',   e: '!' },
  'landmark':          { c: 'var(--landmark)', e: '★' },
  'navigation':        { c: 'var(--nav)',      e: '◆' },
  'intersection':      { c: 'var(--road)',     e: '⑂' },
  'road-access-point': { c: 'var(--road)',     e: '▢' },
  'campsite':          { c: 'var(--nav)',      e: '▲' },
  'generic':           { c: 'var(--gen)',      e: '•' },
};
// Optional live-roster backend. null = fully serverless (peer-relayed RSVPs).
const FW_BASE = null;

/* Carto raster basemap (OSM-derived, retina-capable, distribution-friendly —
 * tile.openstreetmap.org's usage policy disallows heavy app use and has no @2x).
 * Light = Voyager (soft topo-ish palette that fits the survey identity),
 * dark = Dark Matter so dark UI + dark map read as one product. */
function cartoTiles(variant, retina) {
  const r = retina ? '@2x' : '';
  return ['a', 'b', 'c', 'd'].map((s) =>
    'https://' + s + '.basemaps.cartocdn.com/' + variant + '/{z}/{x}/{y}' + r + '.png');
}
const BASE_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>';

/* ----------------------------- state ----------------------------- */
const State = {
  raw: null,            // FeatureCollection (lines) as loaded — the only geometry copy
  routes: [],           // [{id,name,region,color,coords,start,distance_m}]
  byId: new Map(),
  selectedId: null,
  wpMarkers: [],        // DOM markers for the selected route's derived waypoints
  cairnMarkers: [],     // DOM markers for voice-dropped cairns
  userPos: null,        // [lon,lat] from geolocate
  userAcc: null,        // accuracy in metres
  posAge: 0,
  profile: null,        // webProfile.js result (device tier + features)
  view: null,           // current sheet view name (for targeted re-renders)
};

/* ----------------------------- local prefs (no server) ----------------------------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
/* Top-level `const` in a classic script does NOT create window properties, but
 * the feature modules (breadcrumb.js's fix fallback, pulse/discover hooks)
 * look for window.State / window.LS — publish them explicitly. */
try { window.State = State; window.LS = LS; } catch {}
const getHandle = () => LS.get('handle', '') || '';
const setHandle = (h) => LS.set('handle', (h || '').trim());
const favorites = () => new Set(LS.get('favorites', []));
const toggleFav = (id) => { const s = favorites(); s.has(id) ? s.delete(id) : s.add(id); LS.set('favorites', [...s]); return s.has(id); };
const offlineSet = () => new Set(LS.get('offline', []));
const markOffline = (id) => { const s = offlineSet(); s.add(id); LS.set('offline', [...s]); };
const unitPref = () => LS.get('unit', 'mi');
const themePref = () => LS.get('theme', 'system');
const savedCairns = () => LS.get('cairns', []);

/* ----------------------------- motion (reduced-motion + tier aware) ----------------------------- */
function reducedMotion() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
function animOK() {
  if (reducedMotion()) return false;
  return !State.profile || State.profile.features.animations !== false;
}
const dur = (ms) => (animOK() ? ms : 0);

/* ----------------------------- geo helpers ----------------------------- */
function haversine(a, b) { // [lon,lat] pairs → metres
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
  const la1 = a[1] * toR, la2 = b[1] * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function trackLength(coords) { let d = 0; for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]); return d; }
function fmtDist(m) {
  if (unitPref() === 'km') return (m / 1000).toFixed(m < 1000 ? 2 : 1) + ' km';
  const mi = m / 1609.34; return mi.toFixed(mi < 10 ? 2 : 1) + ' mi';
}
function boundsOf(coords) {
  const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
  for (const c of coords) b.extend(c);
  return b;
}
function regionColor(r) { return REGION_COLOR[r] || REGION_DEFAULT; }
function regionShort(r) { return REGION_SHORT[r] || r; }
function regionMatchExpr() {
  const m = ['match', ['get', 'region']];
  for (const k of Object.keys(REGION_COLOR)) { m.push(k, REGION_COLOR[k]); }
  m.push(REGION_DEFAULT);
  return m;
}
/* nearest distance (m) from a point to a track's vertices — dense enough tracks
 * that vertex distance ≈ line distance for "am I off route" purposes */
function nearestOnTrack(pos, coords) {
  let best = Infinity;
  for (const c of coords) { const d = haversine(pos, c); if (d < best) best = d; }
  return best;
}

/* ----------------------------- derived waypoints ----------------------------- */
/* trails.min.json carries geometry only — no named cairns. We derive an honest
 * handful from the track itself (trailhead, midpoint, turnaround) and say so. */
function waypointsFor(route) {
  const c = route.coords;
  if (!c || c.length < 2) return [];
  const wps = [{ id: route.id + '-w0', routeId: route.id, name: 'Trailhead', type: 'parking-trailhead',
    coord: c[0], description: 'Start of the recorded track — typical trailhead / access point.' }];
  if (c.length >= 5) {
    const mid = c[Math.floor(c.length / 2)];
    wps.push({ id: route.id + '-w1', routeId: route.id, name: 'Midpoint', type: 'navigation', coord: mid,
      description: 'Roughly the halfway mark along the track.' });
  }
  const end = c[c.length - 1];
  // if the track is a loop (ends near start) call it a junction, else a turnaround
  const loop = haversine(c[0], end) < 120;
  wps.push({ id: route.id + '-w2', routeId: route.id, name: loop ? 'Loop close' : 'Turnaround / summit',
    type: loop ? 'intersection' : 'landmark', coord: end,
    description: loop ? 'The track returns near the trailhead — this is a loop.'
                      : 'Far end of the recorded track — summit, viewpoint or turnaround.' });
  return wps;
}

/* ----------------------------- map ----------------------------- */
let map;
function glyphsUrl() {
  // Self-hosted glyphs (precached by the SW). Inline styles need an absolute URL.
  return location.origin + location.pathname.replace(/[^/]*$/, '') + 'vendor/fonts/{fontstack}/{range}.pbf';
}
function isDarkTheme() {
  const t = themePref();
  if (t === 'dark') return true;
  if (t === 'light') return false;
  try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}
function initMap() {
  const lite = State.profile && State.profile.tier === 'lite';
  const retina = !lite && (window.devicePixelRatio || 1) > 1.3;
  const dark = isDarkTheme();
  map = new maplibregl.Map({
    container: 'map',
    attributionControl: { compact: true },
    style: {
      version: 8,
      glyphs: glyphsUrl(),
      sources: {
        'base-light': { type: 'raster', tiles: cartoTiles('rastertiles/voyager', retina),
                        tileSize: 256, maxzoom: 19, attribution: BASE_ATTR },
        'base-dark':  { type: 'raster', tiles: cartoTiles('dark_all', retina),
                        tileSize: 256, maxzoom: 19, attribution: BASE_ATTR },
      },
      layers: [
        { id: 'base-light', type: 'raster', source: 'base-light',
          layout: { visibility: dark ? 'none' : 'visible' } },
        { id: 'base-dark', type: 'raster', source: 'base-dark',
          layout: { visibility: dark ? 'visible' : 'none' } },
      ],
    },
    center: [-89.5, 44.5], zoom: 6.6, maxZoom: 19,
    dragRotate: false, pitchWithRotate: false,
    fadeDuration: animOK() ? 300 : 0,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  // honest accuracy: MapLibre's own geolocate control draws the *real* accuracy circle.
  const geo = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: 10000 },
    trackUserLocation: true, showUserLocation: true, showAccuracyCircle: true,
  });
  map.addControl(geo, 'bottom-right');
  geo.on('geolocate', (e) => {
    State.userPos = [e.coords.longitude, e.coords.latitude];
    State.userAcc = e.coords.accuracy;
    State.posAge = Date.now();
    updateAccuracyLive();
    // "Near me" was tapped before we had a fix — finish the gesture now.
    if (Browse.pendingNear) {
      Browse.pendingNear = false; Browse.nearby = true;
      if (State.view === 'routes') routesView();
      else toast('Location found — “Near me” is ready in Browse');
    }
  });
  geo.on('error', () => {
    if (Browse.pendingNear) { Browse.pendingNear = false; toast('No location fix — “Near me” needs one'); }
  });
  window._geo = geo;

  map.on('load', onMapLoad);
  map.on('error', (e) => console.warn('map error', e && e.error));
}

function applyBasemapTheme() {
  if (!map) return;
  try {
    const dark = isDarkTheme();
    if (map.getLayer('base-light')) map.setLayoutProperty('base-light', 'visibility', dark ? 'none' : 'visible');
    if (map.getLayer('base-dark')) map.setLayoutProperty('base-dark', 'visibility', dark ? 'visible' : 'none');
  } catch {}
}

function onMapLoad() {
  const lite = State.profile && State.profile.tier === 'lite';

  // 1) ALL trail lines — single source, single layer, colour by region.
  //    geojson-vt does the zoom-dependent simplification/culling: `tolerance`
  //    controls vertex thinning per tile (lite tier thins ~4× harder), maxzoom:14
  //    stops generating new tile pyramids past z14 (overzoom is free), buffer:64
  //    keeps joins clean at tile edges without duplicating whole geometries.
  map.addSource('trails', {
    type: 'geojson', data: State.raw,
    maxzoom: 14, buffer: 64, tolerance: lite ? 1.5 : 0.375,
  });
  map.addLayer({
    id: 'trails-line', type: 'line', source: 'trails',
    minzoom: lite ? 9.5 : 0, // lite: clusters alone carry the far-out overview
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': regionMatchExpr(),
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.1, 12, 2.4, 16, 4],
      'line-opacity': 0.82,
    },
  });
  // 1b) Invisible WIDE twin of trails-line: the tap/hover target. The visible
  //     line is 1–2px at browse zooms — far below finger accuracy — so clicks
  //     register against this ~20px ribbon instead.
  map.addLayer({
    id: 'trails-hit', type: 'line', source: 'trails',
    minzoom: 8.5,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#000', 'line-opacity': 0.001,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 14, 14, 22] },
  });
  // 2) Selected trail highlight (filtered copy on top).
  map.addLayer({
    id: 'trails-sel', type: 'line', source: 'trails',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#43c9e6', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 16, 7],
      'line-opacity': 0.95, 'line-blur': 0.4 },
    filter: ['==', ['get', 'id'], -1],
  });

  // 3) Trailhead cairns — clustered points (one per trail).
  const cairns = {
    type: 'FeatureCollection',
    features: State.routes.map((r) => ({
      type: 'Feature', properties: { id: r.id, name: r.name, region: r.region },
      geometry: { type: 'Point', coordinates: r.start },
    })),
  };
  map.addSource('cairns', { type: 'geojson', data: cairns, cluster: true, clusterRadius: 46, clusterMaxZoom: 13 });
  map.addLayer({
    id: 'cairn-cluster', type: 'circle', source: 'cairns', filter: ['has', 'point_count'],
    paint: {
      'circle-color': 'rgba(14,131,163,0.86)',
      'circle-radius': ['step', ['get', 'point_count'], 14, 25, 18, 100, 24, 400, 30],
      'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
    },
  });
  map.addLayer({
    id: 'cairn-count', type: 'symbol', source: 'cairns', filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12,
      'text-font': ['Open Sans Regular'], 'text-allow-overlap': true },
    paint: { 'text-color': '#fff' },
  });
  map.addLayer({
    id: 'cairn-point', type: 'circle', source: 'cairns', filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': '#7a5cc0', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, 6],
      'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' },
  });

  // interactions — ONE click handler with explicit priority (cluster > point >
  // trail ribbon) so a tap never fires two navigations.
  const HIT_LAYERS = ['cairn-cluster', 'cairn-point', 'trails-hit'];
  map.on('click', (e) => {
    let f = null, layer = null;
    for (const l of HIT_LAYERS) {
      if (!map.getLayer(l)) continue;
      const fs = map.queryRenderedFeatures(e.point, { layers: [l] });
      if (fs.length) { f = fs[0]; layer = l; break; }
    }
    if (!f) return;
    if (layer === 'cairn-cluster') {
      map.getSource('cairns').getClusterExpansionZoom(f.properties.cluster_id).then((z) => {
        map.easeTo({ center: f.geometry.coordinates, zoom: z, duration: dur(500) });
      }).catch(() => {});
    } else {
      location.hash = '#/route/' + f.properties.id;
    }
  });
  map.on('mousemove', (e) => {
    const fs = map.queryRenderedFeatures(e.point, { layers: HIT_LAYERS.filter((l) => map.getLayer(l)) });
    map.getCanvas().style.cursor = fs.length ? 'pointer' : '';
  });

  restoreCairnMarkers();

  const lc = document.getElementById('legendCount');
  if (lc) lc.textContent = State.routes.length.toLocaleString() + ' trails · tap a line or cairn';
  // deep-link may already be in the URL
  route();
  // if opened fresh with no hash, fit the whole seed
  if (!location.hash || location.hash === '#/' || location.hash === '#') fitAll();
}

function fitAll() {
  // fit to all trailheads for a full overview
  const all = State.routes.map((r) => r.start);
  if (!all.length) return;
  const b = new maplibregl.LngLatBounds(all[0], all[0]);
  all.forEach((c) => b.extend(c));
  map.fitBounds(b, { padding: 60, duration: dur(600), maxZoom: 11 });
}

function selectRoute(id, { zoom = true } = {}) {
  State.selectedId = id;
  if (!map) return; // map engine failed to load — keep the text UI usable, don't crash
  if (map.getLayer('trails-sel')) map.setFilter('trails-sel', ['==', ['get', 'id'], id]);
  const r = State.byId.get(id);
  if (!r) return;
  // drop derived waypoint pins for this route only
  clearWpMarkers();
  waypointsFor(r).forEach((w) => {
    const t = TYPE[w.type] || TYPE.generic;
    const el = document.createElement('div'); el.className = 'pin'; el.style.background = t.c;
    el.innerHTML = '<span>' + t.e + '</span>';
    const pop = new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
      '<div class="pop-t">' + esc(w.name) + '</div>' +
      '<div class="pop-type">' + w.type.replace(/-/g, ' ') + '</div>' +
      '<div class="pop-d">' + esc(w.description) + '</div>' +
      '<a class="pop-link" href="#/waypoint/' + w.id + '">Details →</a>');
    const mk = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(w.coord).setPopup(pop).addTo(map);
    State.wpMarkers.push(mk);
  });
  if (zoom) map.fitBounds(boundsOf(r.coords), { padding: { top: 90, bottom: 260, left: 40, right: 40 }, maxZoom: 15, duration: dur(650) });
}
function clearWpMarkers() { State.wpMarkers.forEach((m) => m.remove()); State.wpMarkers = []; }
function clearSelection() { State.selectedId = null; if (map && map.getLayer('trails-sel')) map.setFilter('trails-sel', ['==', ['get', 'id'], -1]); clearWpMarkers(); }

/* voice-dropped cairns — persisted in LS, restored on map load */
function addCairnMarker(c) {
  if (!map) return;
  const el = document.createElement('div'); el.className = 'pin'; el.style.background = 'var(--landmark)';
  el.innerHTML = '<span>▲</span>';
  const pop = new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
    '<div class="pop-t">' + esc(c.label || 'Cairn') + '</div>' +
    '<div class="pop-type">dropped cairn</div>' +
    '<div class="pop-d">' + new Date(c.at).toLocaleString() + '</div>');
  const mk = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(c.coord).setPopup(pop).addTo(map);
  State.cairnMarkers.push(mk);
}
function restoreCairnMarkers() { try { savedCairns().forEach(addCairnMarker); } catch {} }

/* ----------------------------- sheet + toast ----------------------------- */
const sheet = document.getElementById('sheet');
const sheetBody = document.getElementById('sheetBody');
const scrim = document.getElementById('scrim');
const grip = document.getElementById('grip');
let _lastFocus = null;

/* Per-view teardown registry. Views that hold live resources (sensor watches,
 * intervals, mesh subscriptions, an open mic) register a cleanup; it runs on
 * closeSheet() AND whenever another view re-renders the sheet over this one
 * (hash navigation never goes through closeSheet). */
const _viewCleanup = [];
function onViewCleanup(fn) { if (typeof fn === 'function') _viewCleanup.push(fn); }
function runViewCleanup() { while (_viewCleanup.length) { try { _viewCleanup.pop()(); } catch {} } }

function openSheet(html) {
  runViewCleanup(); // the previous view's live resources die with its DOM
  const wasOpen = sheet.classList.contains('open');
  sheetBody.innerHTML = html;
  sheet.classList.add('open'); scrim.hidden = false; sheet.scrollTop = 0;
  sheet.setAttribute('aria-modal', 'true');
  if (!wasOpen) {
    _lastFocus = document.activeElement;
    // Focus the sheet container itself: screen readers land inside the dialog,
    // but no input is auto-focused (no surprise keyboard on mobile).
    requestAnimationFrame(() => { try { sheet.focus({ preventScroll: true }); } catch {} });
  }
}
function closeSheet(navigate) {
  const wasOpen = sheet.classList.contains('open');
  runViewCleanup();
  sheet.classList.remove('open'); scrim.hidden = true;
  sheet.setAttribute('aria-modal', 'false');
  sheet.style.transform = '';
  State.view = null;
  clearSelection();
  if (wasOpen && _lastFocus && document.contains(_lastFocus)) { try { _lastFocus.focus({ preventScroll: true }); } catch {} }
  _lastFocus = null;
  // replaceState (NOT pushState): closing a sheet must not grow history, or
  // Android back after closing re-opens it and entries pile up.
  if (navigate !== false && location.hash && location.hash !== '#/' && location.hash !== '#') {
    history.replaceState('', document.title, location.pathname + location.search + '#/');
  }
}
document.getElementById('sheetClose').onclick = () => closeSheet();
scrim.onclick = () => closeSheet();

/* keyboard: Escape closes, Tab is trapped inside the open sheet */
document.addEventListener('keydown', (e) => {
  if (!sheet.classList.contains('open')) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key !== 'Tab') return;
  const focusables = [...sheet.querySelectorAll(
    'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
});

/* grip: drag-to-dismiss (pointer events, translate + release threshold) */
let _drag = null;
grip.addEventListener('pointerdown', (e) => {
  _drag = { y0: e.clientY, dy: 0, t0: performance.now() };
  sheet.classList.add('dragging');
  try { grip.setPointerCapture(e.pointerId); } catch {}
});
grip.addEventListener('pointermove', (e) => {
  if (!_drag) return;
  _drag.dy = Math.max(0, e.clientY - _drag.y0);
  sheet.style.transform = 'translateY(' + _drag.dy + 'px)';
});
function endDrag() {
  if (!_drag) return;
  const v = _drag.dy / Math.max(1, performance.now() - _drag.t0); // px/ms
  const dismiss = _drag.dy > 90 || (_drag.dy > 28 && v > 0.55);
  sheet.classList.remove('dragging');
  sheet.style.transform = '';
  _drag = null;
  if (dismiss) closeSheet();
}
grip.addEventListener('pointerup', endDrag);
grip.addEventListener('pointercancel', endDrag);

function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1900); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* encode/decode for shareable hike links */
const enc = (o) => btoa(encodeURIComponent(JSON.stringify(o)));
const dec = (s) => JSON.parse(decodeURIComponent(atob(s)));
async function shareOrCopy(text, url) {
  if (navigator.share) { try { await navigator.share({ text, url }); return; } catch {} }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
}
function fmtWhen(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) throw new Error('invalid date');
    return esc(d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
  } catch { return esc(String(iso)); }
}
function icsStamp(d) {
  try {
    if (!d || isNaN(d.getTime())) return '';
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  } catch { return ''; }
}

/* QR rendering — self-hosted qrcode-generator (global `qrcode`), drawn at
 * devicePixelRatio so the hero artifact people photograph is razor sharp. */
function renderQR(canvas, text, cssSize) {
  cssSize = cssSize || 210;
  try {
    if (typeof qrcode === 'undefined') throw new Error('qr lib missing');
    const qr = qrcode(0, 'M'); // auto version, M error correction
    qr.addData(text); qr.make();
    const n = qr.getModuleCount();
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    const size = Math.round(cssSize * dpr);
    canvas.width = canvas.height = size;
    canvas.style.width = canvas.style.height = cssSize + 'px';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    const quiet = 2, cell = size / (n + quiet * 2);
    ctx.fillStyle = '#10181c';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        const x = (c + quiet) * cell, y = (r + quiet) * cell;
        ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cell), Math.ceil(cell));
      }
    }
    return true;
  } catch (e) {
    // graceful: show the raw link instead of a broken canvas
    const p = document.createElement('p'); p.className = 'tiny'; p.style.wordBreak = 'break-all';
    p.textContent = text;
    canvas.replaceWith(p);
    return false;
  }
}

/* ----------------------------- roster (peer-relayed) ----------------------------- */
const roster = (id) => LS.get('roster:' + id, []);
function addRsvp(id, handle, status) {
  const r = roster(id).filter((x) => x.handle !== handle);
  r.push({ handle, status, at: Date.now() });
  LS.set('roster:' + id, r); return r;
}
const yesCount = (r) => r.filter((x) => x.status === 'yes').length;

/* ================================================================
 *  VIEWS  (each renders into the bottom sheet)
 * ================================================================ */

/* ---- #/routes : browse / search ---- */
const Browse = { q: '', region: 'all', fav: false, shown: 60, nearby: false, pendingNear: false };
function routesView() {
  State.view = 'routes';
  openSheet(
    '<div class="searchbar">' +
      '<h2>Browse trails</h2>' +
      '<input id="q" placeholder="Search name or region…" value="' + esc(Browse.q) + '" autocomplete="off" aria-label="Search trails">' +
      '<div class="pills" id="regionPills" role="group" aria-label="Filter by region"></div>' +
      '<div class="pills tight">' +
        '<button class="pill' + (Browse.fav ? ' on' : '') + '" id="pFav" aria-pressed="' + Browse.fav + '">★ Favorites</button>' +
        '<button class="pill' + (Browse.nearby ? ' on' : '') + '" id="pNear" aria-pressed="' + Browse.nearby + '">☉ Near me</button>' +
      '</div>' +
    '</div>' +
    '<div class="list" id="list"></div>'
  );
  const regions = ['all', ...Object.keys(REGION_COLOR)];
  document.getElementById('regionPills').innerHTML = regions.map((r) =>
    '<button class="pill' + (Browse.region === r ? ' on' : '') + '" data-r="' + esc(r) + '" aria-pressed="' + (Browse.region === r) + '">' +
    (r === 'all' ? 'All regions' : esc(regionShort(r))) + '</button>').join('');
  document.querySelectorAll('#regionPills .pill').forEach((b) => b.onclick = () => { Browse.region = b.dataset.r; Browse.shown = 60; routesView(); });
  document.getElementById('pFav').onclick = () => { Browse.fav = !Browse.fav; Browse.shown = 60; routesView(); };
  document.getElementById('pNear').onclick = () => {
    if (Browse.nearby) { Browse.nearby = false; Browse.shown = 60; routesView(); return; }
    if (State.userPos) { Browse.nearby = true; Browse.shown = 60; routesView(); return; }
    // No fix yet: DON'T fake the toggle — request one and enable when it lands.
    Browse.pendingNear = true;
    toast('Getting your location…');
    try { window._geo.trigger(); } catch { Browse.pendingNear = false; toast('Location unavailable'); }
  };
  const qi = document.getElementById('q');
  qi.oninput = () => { Browse.q = qi.value; Browse.shown = 60; renderList(); };
  renderList();
  function renderList() {
    const favs = favorites();
    let items = State.routes;
    const q = Browse.q.trim().toLowerCase();
    if (q) items = items.filter((r) => r.name.toLowerCase().includes(q) || r.region.toLowerCase().includes(q));
    if (Browse.region !== 'all') items = items.filter((r) => r.region === Browse.region);
    if (Browse.fav) items = items.filter((r) => favs.has(r.id));
    if (Browse.nearby && State.userPos) {
      items = items.map((r) => ({ r, d: haversine(State.userPos, r.start) })).sort((a, b) => a.d - b.d).map((x) => Object.assign({}, x.r, { _d: x.d }));
    }
    const el = document.getElementById('list');
    if (!items.length) { el.innerHTML = '<div class="emptynote">No trails match.<br><span class="tiny">Try a different search or region.</span></div>'; return; }
    const slice = items.slice(0, Browse.shown);
    el.innerHTML = slice.map((r) => {
      const near = (Browse.nearby && r._d != null) ? fmtDist(r._d) : fmtDist(r.distance_m);
      return '<button class="listitem" data-id="' + r.id + '">' +
        '<span class="dot" style="background:' + regionColor(r.region) + '"></span>' +
        '<span class="li-main"><span class="li-name">' + (favs.has(r.id) ? '<span class="star">★</span> ' : '') + esc(r.name) + '</span>' +
        '<span class="li-sub">' + esc(regionShort(r.region)) + '</span></span>' +
        '<span class="li-meta">' + near + (Browse.nearby && r._d != null ? '<br>away' : '<br>long') + '</span>' +
      '</button>';
    }).join('') + (items.length > Browse.shown
      ? '<button class="btn ghost loadmore" id="more">Show more (' + (items.length - Browse.shown).toLocaleString() + ' more)</button>'
      : '<div class="tiny" style="text-align:center;padding:12px">' + items.length.toLocaleString() + ' trails</div>');
    el.querySelectorAll('.listitem').forEach((b) => b.onclick = () => { location.hash = '#/route/' + b.dataset.id; });
    const more = document.getElementById('more'); if (more) more.onclick = () => { Browse.shown += 60; renderList(); };
  }
}

/* ---- #/route/:id : detail ---- */
function routeDetail(id) {
  const r = State.byId.get(id);
  if (!r) { toast('Trail not found'); location.hash = '#/routes'; return; }
  State.view = 'route';
  selectRoute(id, { zoom: true });
  const isFav = favorites().has(id);
  const isOff = offlineSet().has(id);
  const wps = waypointsFor(r);
  openSheet(
    '<span class="badge" style="background:' + regionColor(r.region) + '">' + esc(regionShort(r.region)) + '</span>' +
    '<h2>' + esc(r.name) + '</h2>' +
    '<div class="stats">' +
      '<div class="stat"><div class="k">Length</div><div class="v">' + fmtDist(r.distance_m) + '</div></div>' +
      '<div class="stat"><div class="k">Track pts</div><div class="v">' + r.coords.length.toLocaleString() + '</div></div>' +
      '<div class="stat"><div class="k">From you</div><div class="v" id="fromYou">' + (State.userPos ? fmtDist(haversine(State.userPos, r.start)) : '—') + '</div></div>' +
      '<div class="stat"><div class="k">Trail id</div><div class="v">#' + r.id + '</div></div>' +
    '</div>' +
    '<div class="row tight">' +
      '<button class="btn ghost" id="fav" aria-pressed="' + isFav + '">' + (isFav ? '★ Saved' : '☆ Save') + '</button>' +
      '<button class="btn ghost" id="off">' + (isOff ? '✓ Offline' : '⬇ Offline') + '</button>' +
      '<button class="btn ghost" id="dir">Directions</button>' +
      '<button class="btn" id="plan">Plan hike</button>' +
    '</div>' +
    '<h3>Waypoints <span class="tiny">(derived from track)</span></h3>' +
    '<div id="wps">' + wps.map((w) => {
      const t = TYPE[w.type] || TYPE.generic;
      return '<button class="wp" data-wp="' + w.id + '">' +
        '<span class="wpin" style="background:' + t.c + '"><span>' + t.e + '</span></span>' +
        '<span><span class="wp-name">' + esc(w.name) + '</span><br>' +
        '<span class="wp-sub">' + w.type.replace(/-/g, ' ') + ' · ' + w.coord[1].toFixed(4) + ', ' + w.coord[0].toFixed(4) + '</span></span>' +
      '</button>';
    }).join('') + '</div>' +
    '<div class="callout"><b>Honest note.</b> This seed carries the GPX <b>track</b> only, so waypoints are derived from the line (trailhead / midpoint / turnaround). Named cairns, photos, votes &amp; comments live in the full OpenCairn app.</div>' +
    '<div class="callout"><b>Trail data may be out of date.</b> Routes come from OpenStreetMap, a community-edited map — closures, reroutes, washouts and seasonal or permit access changes aren\'t always reflected right away. Treat this as a planning aid, not a substitute for checking current conditions before you go.</div>'
  );
  document.getElementById('fav').onclick = (e) => { const on = toggleFav(id); e.target.textContent = on ? '★ Saved' : '☆ Save'; e.target.setAttribute('aria-pressed', on); toast(on ? 'Saved to favorites' : 'Removed'); };
  document.getElementById('off').onclick = (e) => {
    markOffline(id); e.target.textContent = '✓ Offline';
    // map may be null (engine failed) — data is offline either way, just skip the tile pre-warm
    if (map) map.fitBounds(boundsOf(r.coords), { padding: 60, duration: 0 }); // pre-warm tiles into the SW cache
    toast('Panned tiles cached for offline (data already offline)');
  };
  document.getElementById('dir').onclick = () => window.open('https://www.google.com/maps/dir/?api=1&destination=' + r.start[1] + ',' + r.start[0], '_blank');
  document.getElementById('plan').onclick = () => { location.hash = '#/plan?t=' + id; };
  document.querySelectorAll('#wps .wp').forEach((b) => b.onclick = () => { location.hash = '#/waypoint/' + b.dataset.wp; });
}

/* ---- #/waypoint/:id ---- */
function waypointView(wid) {
  const rid = Number(String(wid).split('-')[0]);
  const r = State.byId.get(rid);
  if (!r) { location.hash = '#/routes'; return; }
  const w = waypointsFor(r).find((x) => x.id === wid);
  if (!w) { location.hash = '#/route/' + rid; return; }
  State.view = 'waypoint';
  selectRoute(rid, { zoom: false });
  if (map) map.flyTo({ center: w.coord, zoom: 14, duration: dur(900) }); // map may be null — text detail still works
  const t = TYPE[w.type] || TYPE.generic;
  const dist = State.userPos ? fmtDist(haversine(State.userPos, w.coord)) : '— (locate first)';
  openSheet(
    '<span class="badge" style="background:' + t.c + '">' + w.type.replace(/-/g, ' ') + '</span>' +
    '<h2>' + esc(w.name) + '</h2>' +
    '<p class="muted">' + esc(w.description) + '</p>' +
    '<div class="stats">' +
      '<div class="stat"><div class="k">Lat</div><div class="v">' + w.coord[1].toFixed(5) + '</div></div>' +
      '<div class="stat"><div class="k">Lon</div><div class="v">' + w.coord[0].toFixed(5) + '</div></div>' +
      '<div class="stat"><div class="k">From you</div><div class="v">' + dist + '</div></div>' +
    '</div>' +
    '<div class="row tight">' +
      '<button class="btn ghost" id="show">Show on map</button>' +
      '<button class="btn ghost" id="dir">Directions</button>' +
      '<button class="btn" id="back">Back to trail</button>' +
    '</div>' +
    '<div class="callout">Editing waypoints, adding photos and posting cairn notes need the write API + native file access — <b>available in the full app</b>.</div>'
  );
  document.getElementById('show').onclick = () => { if (map) map.flyTo({ center: w.coord, zoom: 15, duration: dur(900) }); closeSheet(false); };
  document.getElementById('dir').onclick = () => window.open('https://www.google.com/maps/dir/?api=1&destination=' + w.coord[1] + ',' + w.coord[0], '_blank');
  document.getElementById('back').onclick = () => { location.hash = '#/route/' + rid; };
}

/* ---- #/accuracy : honest GPS ---- */
function accuracyView() {
  State.view = 'accuracy';
  openSheet(
    '<h2>GPS accuracy</h2>' +
    '<p class="muted">No fake precision. This reads the browser’s own fix and MapLibre draws the <b>real</b> accuracy circle on the map.</p>' +
    '<div id="accBody"><div class="callout" id="accStart">Tap <b>Locate</b> to request a fix. Your position never leaves the device.</div></div>' +
    '<div class="row tight">' +
      '<button class="btn" id="loc">Locate me</button>' +
      '<button class="btn ghost" id="closeAcc">Done</button>' +
    '</div>' +
    '<div class="callout"><b>PWA limit.</b> A web app only gets GPS while this tab is in front, and iOS throttles it hard. The live trip readout works on-screen but <b>can’t log a hike with the screen off</b> — that’s the native Android app.</div>'
  );
  document.getElementById('loc').onclick = () => { try { window._geo.trigger(); } catch {} };
  document.getElementById('closeAcc').onclick = () => closeSheet();
  updateAccuracyLive();
}
function updateAccuracyLive() {
  const body = document.getElementById('accBody');
  if (!body) return; // accuracy sheet not open
  if (State.userPos == null) return;
  const acc = State.userAcc || 0;
  const age = Math.max(0, Math.round((Date.now() - State.posAge) / 1000));
  let v = 'bad', head = 'Too coarse to navigate', note = 'Wide fix — likely network/IP based. Move outdoors with a clear sky view.';
  if (acc <= 10) { v = 'good'; head = 'Good enough to navigate'; note = 'Tight GPS fix. Trail-level accuracy.'; }
  else if (acc <= 35) { v = 'ok'; head = 'Usable, with care'; note = 'Decent fix — fine for the map, not for pin-point scrambles.'; }
  body.innerHTML =
    '<div class="verdict ' + v + '">' + head + '<small>' + note + '</small></div>' +
    '<div class="stats">' +
      '<div class="stat"><div class="k">Accuracy</div><div class="v">±' + Math.round(acc) + '<small> m</small></div></div>' +
      '<div class="stat"><div class="k">Fix age</div><div class="v">' + age + '<small> s</small></div></div>' +
      '<div class="stat"><div class="k">Lat</div><div class="v">' + State.userPos[1].toFixed(5) + '</div></div>' +
      '<div class="stat"><div class="k">Lon</div><div class="v">' + State.userPos[0].toFixed(5) + '</div></div>' +
    '</div>';
}

/* ---- #/place : Nominatim geocode ---- */
function placeSearch() {
  State.view = 'place';
  openSheet(
    '<h2>Find a place</h2>' +
    '<input id="q" placeholder="e.g. Baraboo, WI" autocomplete="off" aria-label="Place search">' +
    '<div class="row"><button class="btn" id="go">Search</button></div>' +
    '<div id="qres" style="margin-top:12px"></div>' +
    '<p class="tiny" style="margin-top:14px">Geocoding via OpenStreetMap Nominatim — online only; cached results stay available offline.</p>'
  );
  const run = async () => {
    const q = document.getElementById('q').value.trim(); if (!q) return;
    const res = document.getElementById('qres'); res.innerHTML = '<p class="muted"><span class="spin"></span>Searching…</p>';
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' + encodeURIComponent(q));
      const j = await r.json();
      res.innerHTML = j.length ? '' : '<p class="muted">No results.</p>';
      j.forEach((p) => {
        const b = document.createElement('button'); b.className = 'btn ghost';
        b.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0'; b.textContent = p.display_name;
        b.onclick = () => { if (map) map.flyTo({ center: [+p.lon, +p.lat], zoom: 12, duration: dur(900) }); closeSheet(); };
        res.appendChild(b);
      });
    } catch { res.innerHTML = '<p class="muted">Search unavailable offline.</p>'; }
  };
  document.getElementById('go').onclick = run;
  document.getElementById('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}

/* ================================================================
 *  BREADCRUMB HOME  (breadcrumb.js — SAFETY feature, every tier)
 *  Pure GPS math: must work with a dead map, no signal, no AI.
 * ================================================================ */
function setupCrumbDock() {
  const rec = document.getElementById('crumbRec');
  const home = document.getElementById('crumbHome');
  if (!rec || !home) return;
  const B = window.Breadcrumb;
  if (!B) { // module failed to load — disable honestly rather than 404 silently
    rec.disabled = true; home.disabled = true;
    rec.title = home.title = 'breadcrumb module failed to load — refresh';
    return;
  }
  rec.onclick = () => {
    const st = B.breadcrumbState();
    if (st.recording) {
      B.stopBreadcrumb();
      toast('Breadcrumb paused — ' + st.pointCount + ' point' + (st.pointCount === 1 ? '' : 's') + ' kept');
    } else {
      const r = B.startBreadcrumb();
      toast(r.ok ? 'Breadcrumb on — recording your path (~10 m steps)' : 'Cannot record: ' + r.reason);
    }
    updateCrumbDock();
  };
  home.onclick = () => { location.hash = '#/home'; };
  updateCrumbDock();
  setInterval(updateCrumbDock, 4000); // live point count while recording
}
function updateCrumbDock() {
  const rec = document.getElementById('crumbRec');
  const B = window.Breadcrumb;
  if (!rec || !B) return;
  const st = B.breadcrumbState();
  rec.classList.toggle('rec', st.recording);
  rec.setAttribute('aria-pressed', String(st.recording));
  const lbl = document.getElementById('crumbRecLabel');
  if (lbl) lbl.textContent = st.recording ? 'Recording · ' + st.pointCount + ' pt' + (st.pointCount === 1 ? '' : 's') : 'Breadcrumb';
}

/* ---- #/home : bearing arrow + distance back along the recorded trail ---- */
function homeView() {
  State.view = 'home';
  openSheet('<h2>Guide me home</h2><div id="homeBody"></div>');
  const B = window.Breadcrumb;
  const body = () => document.getElementById('homeBody');
  if (!B) {
    body().innerHTML = '<div class="callout"><b>Module unavailable.</b> breadcrumb.js failed to load — refresh to retry.</div>';
    return;
  }

  /* sensors — deliberately map-independent: our own geolocation watch feeds
   * State.userPos (breadcrumb.js's fix fallback), and a compass listener
   * (webkitCompassHeading on iOS, absolute alpha elsewhere) feeds the arrow. */
  let watchId = null, heading = null, timer = null, orientHandler = null, orientEvent = null;
  if ('geolocation' in navigator) {
    try {
      watchId = navigator.geolocation.watchPosition((p) => {
        State.userPos = [p.coords.longitude, p.coords.latitude];
        State.userAcc = p.coords.accuracy; State.posAge = Date.now();
        updateAccuracyLive();
      }, () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 });
    } catch {}
  }
  const attachCompass = () => {
    if (orientHandler) return;
    orientHandler = (e) => {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number' && isFinite(e.webkitCompassHeading)) h = e.webkitCompassHeading;
      else if (e.absolute === true && typeof e.alpha === 'number' && isFinite(e.alpha)) h = 360 - e.alpha;
      if (h != null) heading = ((h % 360) + 360) % 360;
    };
    orientEvent = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
    try { window.addEventListener(orientEvent, orientHandler); } catch { orientHandler = null; }
  };
  const needsOrientPerm = (typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'); // iOS 13+
  if (!needsOrientPerm) attachCompass();

  onViewCleanup(() => {
    if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch {} }
    if (timer) clearInterval(timer);
    if (orientHandler) { try { window.removeEventListener(orientEvent, orientHandler); } catch {} }
  });

  let mode = null; // 'empty' | 'wait-*' | 'arrived' | 'guide' — skeleton re-renders only on change
  const controlsHtml = () => {
    const st = B.breadcrumbState();
    return '<div class="row tight">' +
      '<button class="btn ghost" id="hbRec">' + (st.recording ? '⏸ Pause recording' : '● ' + (st.pointCount ? 'Resume' : 'Start') + ' recording') + '</button>' +
      (st.pointCount ? '<button class="btn ghost" id="hbClear">Clear trail</button>' : '') +
    '</div>' +
    (needsOrientPerm && heading == null
      ? '<div class="row"><button class="btn ghost" id="hbCompass" style="flex:1">Enable compass</button></div>' : '');
  };
  const wireControls = () => {
    const rec = document.getElementById('hbRec');
    if (rec) rec.onclick = () => {
      const st = B.breadcrumbState();
      if (st.recording) { B.stopBreadcrumb(); toast('Recording paused — trail kept'); }
      else { const r = B.startBreadcrumb(); toast(r.ok ? 'Recording your path (~10 m steps)' : 'Cannot record: ' + r.reason); }
      updateCrumbDock(); mode = null; render();
    };
    const clr = document.getElementById('hbClear');
    if (clr) clr.onclick = () => {
      if (confirm('Wipe the recorded breadcrumb trail? Only do this once you are safely back.')) {
        B.clearBreadcrumb(); updateCrumbDock(); mode = null; render();
      }
    };
    const cp = document.getElementById('hbCompass');
    if (cp) cp.onclick = async () => {
      try {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r === 'granted') { attachCompass(); toast('Compass on'); cp.parentElement.remove(); }
        else toast('Compass permission denied — arrow will use true bearing');
      } catch { toast('Compass unavailable'); }
    };
  };

  const render = () => {
    const el = body(); if (!el) return;
    const st = B.breadcrumbState();
    if (!st.pointCount) {
      if (mode === 'empty') return; mode = 'empty';
      el.innerHTML =
        '<div class="callout"><b>No breadcrumb trail yet.</b> Tap <b>Start recording</b> at the trailhead and OpenCairn quietly stores your walked path on this device — pure GPS, no signal, no map, no account. This screen then points you back along it, step by step.</div>' +
        controlsHtml() +
        '<div class="callout"><b>PWA limit — honestly.</b> Recording needs this tab foregrounded with the screen on; background breadcrumbs are the native Android app.</div>';
      wireControls(); return;
    }
    const g = B.guideHome(heading);
    if (!g.ok) {
      const m = 'wait-' + g.reason;
      if (mode === m) return; mode = m;
      el.innerHTML =
        (g.reason === 'permission-denied'
          ? '<div class="verdict bad">Location permission denied<small>Guide-home cannot work without GPS. Re-allow location access for this site, then reopen this panel.</small></div>'
          : '<p class="muted"><span class="spin"></span>Waiting for a GPS fix… (' + st.pointCount + ' points · ' + fmtDist(st.trailLengthM) + ' of trail recorded)</p>') +
        controlsHtml();
      wireControls(); return;
    }
    if (g.arrived) {
      if (mode === 'arrived') return; mode = 'arrived';
      el.innerHTML =
        '<div class="verdict good">You’re back<small>Within a few metres of your trail’s start point.</small></div>' +
        controlsHtml();
      wireControls(); return;
    }
    if (mode !== 'guide') {
      mode = 'guide';
      el.innerHTML =
        '<div class="homearrow-wrap">' +
          '<div class="homearrow"><svg id="homeArrow" viewBox="0 0 24 24" aria-hidden="true" role="img"><path d="M12 2.5 18.5 20 12 15.8 5.5 20 Z" fill="currentColor"/></svg></div>' +
          '<div class="homedist"><span id="homeDist">—</span><small id="homeSub"></small></div>' +
          '<div class="tiny" id="homeNote" style="text-align:center"></div>' +
        '</div>' +
        controlsHtml() +
        '<div class="callout"><b>How it works.</b> This retraces <b>your own recorded path</b> point by point — no routing, no network, no map tiles needed. Keep the screen on; the arrow updates every second.</div>';
      wireControls();
    }
    const rel = g.headingRelative;
    const arrow = document.getElementById('homeArrow');
    if (arrow) arrow.style.transform = 'rotate(' + (rel != null ? rel : g.bearingDeg) + 'deg)';
    const d = document.getElementById('homeDist'); if (d) d.textContent = fmtDist(g.distanceM);
    const s = document.getElementById('homeSub');
    if (s) s.textContent = 'to next breadcrumb · ' + fmtDist(g.totalRemainingM) + ' back to start · ' + g.pointsLeft + ' point' + (g.pointsLeft === 1 ? '' : 's') + ' left';
    const n = document.getElementById('homeNote');
    if (n) n.textContent = (rel != null)
      ? 'arrow is relative to the way you’re facing'
      : 'no compass — arrow shows the true bearing (up = north)';
  };
  render();
  timer = setInterval(render, 1000);
}

/* ---- #/settings ---- */
function settingsView() {
  State.view = 'settings';
  const cur = themePref();
  const p = State.profile;
  openSheet(
    '<h2>Settings</h2>' +
    '<label>Distance unit</label>' +
    '<div class="seg" id="unitSeg"><button data-u="mi"' + (unitPref() === 'mi' ? ' class="on"' : '') + '>Miles</button>' +
      '<button data-u="km"' + (unitPref() === 'km' ? ' class="on"' : '') + '>Kilometres</button></div>' +
    '<label>Theme</label>' +
    '<div class="seg" id="themeSeg">' +
      '<button data-t="system"' + (cur === 'system' ? ' class="on"' : '') + '>System</button>' +
      '<button data-t="light"' + (cur === 'light' ? ' class="on"' : '') + '>Light</button>' +
      '<button data-t="dark"' + (cur === 'dark' ? ' class="on"' : '') + '>Dark</button>' +
    '</div>' +
    '<label>Install</label>' +
    '<div class="row"><button class="btn" id="installBtn">Add to Home Screen</button></div>' +
    '<p class="tiny" id="installHint" style="margin-top:6px"></p>' +
    '<label>Share this app</label>' +
    '<div class="qrwrap"><canvas id="shareQr" role="img" aria-label="QR code to open OpenCairn"></canvas>' +
      '<div class="tiny" style="text-align:center">Scan to open OpenCairn on another phone — no app store, no account.</div></div>' +
    '<div class="row"><button class="btn ghost" id="shareBtn" style="flex:1">Share link</button></div>' +
    '<label>Offline / cache</label>' +
    '<div class="callout" id="cacheInfo">Reading cache…</div>' +
    '<div class="row"><button class="btn ghost" id="clearCache">Clear cached tiles</button></div>' +
    '<label>This device (self-detected)</label>' +
    '<div class="callout" id="tierInfo">' +
      (p ? '<span class="tierchip on">' + esc(p.tier) + ' tier</span>' +
           '<span class="tierchip' + (p.features.animations ? ' on' : '') + '">motion ' + (p.features.animations ? 'on' : 'reduced') + '</span>' +
           '<div class="tiny" style="margin-top:7px">' + p.reasons.map(esc).join('<br>') + '</div>'
         : 'Profile unavailable — running standard defaults.') +
    '</div>' +
    '<label>Release</label>' +
    '<div class="callout" id="releaseInfo">Checking…</div>' +
    '<div class="row"><button class="btn ghost" id="aboutLink">About &amp; honesty →</button></div>'
  );
  document.querySelectorAll('#unitSeg button').forEach((b) => b.onclick = () => { LS.set('unit', b.dataset.u); settingsView(); });
  document.querySelectorAll('#themeSeg button').forEach((b) => b.onclick = () => { LS.set('theme', b.dataset.t); applyTheme(); settingsView(); });
  document.getElementById('aboutLink').onclick = () => { location.hash = '#/about'; };
  const ib = document.getElementById('installBtn');
  ib.onclick = doInstall;
  document.getElementById('installHint').innerHTML = installHintText();
  const appUrl = location.origin + location.pathname;
  renderQR(document.getElementById('shareQr'), appUrl, 180);
  document.getElementById('shareBtn').onclick = () => shareOrCopy('OpenCairn — offline Wisconsin trail map', appUrl);
  updateCacheInfo();
  document.getElementById('clearCache').onclick = async () => {
    if ('caches' in window) { for (const k of await caches.keys()) if (k.includes('tiles')) await caches.delete(k); }
    toast('Tile cache cleared'); updateCacheInfo();
  };
  updateReleaseInfo();
}
/* Release version + signed-update status. release.json existing means this
 * version passed sw.js's signature/hash verification before it was ever
 * allowed to install (see sw.js's verifyRelease()) — this reads it back
 * purely to show that honestly, it doesn't re-verify anything itself. */
async function updateReleaseInfo() {
  const el = document.getElementById('releaseInfo'); if (!el) return;
  try {
    const res = await fetch('./release.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('no release.json');
    const rel = await res.json();
    const built = rel.manifest && rel.manifest.builtAt ? new Date(rel.manifest.builtAt).toLocaleDateString() : '?';
    el.innerHTML = '<b>Signed ✓</b> version ' + esc(rel.manifest.version) + ' · built ' + built +
      '<br><span class="tiny">This build’s files were verified against a signed manifest before install.</span>';
  } catch {
    el.innerHTML = '<b>Unsigned build.</b> No release.json found — this deploy was not signed with scripts/sign_release.mjs.';
  }
}
async function updateCacheInfo() {
  const el = document.getElementById('cacheInfo'); if (!el) return;
  let tiles = 0, shell = false;
  try {
    if ('caches' in window) {
      for (const k of await caches.keys()) {
        const c = await caches.open(k); const n = (await c.keys()).length;
        if (k.includes('tiles')) tiles += n;
        if (k.includes('shell')) shell = n > 0;
      }
    }
  } catch {}
  let quota = '';
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); quota = ' · ~' + Math.round((e.usage || 0) / 1048576) + ' MB used'; } } catch {}
  el.innerHTML = '<b>App shell + all ' + State.routes.length.toLocaleString() + ' trails:</b> ' + (shell ? 'cached ✓' : 'caching…') +
    '<br><b>Map tiles cached:</b> ' + tiles.toLocaleString() + quota +
    '<br><span class="tiny">Panned tiles are stored (LRU-capped ~1600). Trail data, map engine and label fonts are fully offline via precache.</span>';
  // re-poll while the precache is still filling so the pane confirms completion
  if (!shell) { clearTimeout(updateCacheInfo._t); updateCacheInfo._t = setTimeout(updateCacheInfo, 2500); }
}

/* ---- #/about ---- */
function aboutView() {
  State.view = 'about';
  const p = State.profile;
  openSheet(
    '<h2>About OpenCairn</h2>' +
    '<p class="muted">A no-signup, offline-first preview of <b>OpenCairn</b> — a free, open-source trail planner. Opens from a QR or a link, works with no signal, installs to the home screen, no account for the interesting parts.</p>' +
    '<h3>What this PWA does well</h3>' +
    '<ul class="linklist">' +
      '<li>Instant QR open — no install / login friction</li>' +
      '<li>' + State.routes.length.toLocaleString() + ' trails, all offline in the seed</li>' +
      '<li>Honest live GPS + a real accuracy circle</li>' +
      '<li>Self-hosted map engine, fonts &amp; cached tiles — a trail panned once works on the trail</li>' +
      '<li>Fully serverless hike planning (QR / link / .ics / peer RSVP)</li>' +
      '<li>Breadcrumb home — records your walked path and points you back along it; pure GPS, zero signal, every device</li>' +
      '<li>Self-tiering: the app probes this device and enables exactly what it can carry' + (p ? ' (this one: <b>' + esc(p.tier) + '</b>)' : '') + '</li>' +
    '</ul>' +
    '<h3>Where the trail data comes from</h3>' +
    '<div class="callout"><b>OpenStreetMap, not a park service.</b> Every trail in this seed comes from OpenStreetMap, a free, community-edited map — it\'s not an official or authoritative source. Closures, reroutes, washouts, and seasonal or permit access changes aren\'t always reflected right away. Use this to plan and discover, but check current conditions (land manager sites, trailhead postings) before you go.</div>' +
    '<h3>What only native can do</h3>' +
    '<div class="callout"><b>Background GPS</b> — a PWA only tracks while foregrounded; it can’t log a hike screen-off.</div>' +
    '<div class="callout"><b>Real sync &amp; writes</b> — no auth server here. Favorites &amp; rosters are device-local; hike coordination is peer-relayed through the link itself. Create/edit routes, GPX upload, votes &amp; comments need the write API + native files.</div>' +
    '<div class="row"><a class="btn" href="https://opencairn.xyz" target="_blank" rel="noopener" style="flex:1;text-align:center;text-decoration:none">opencairn.xyz ↗</a></div>' +
    '<p class="tiny" style="text-align:center;margin-top:14px">Map © OpenStreetMap contributors © CARTO · free &amp; open source</p>'
  );
}

/* ================================================================
 *  HIKE COORDINATION  (adapted from pwademo.html — serverless)
 * ================================================================ */
function planForm(preId) {
  State.view = 'plan';
  // Trail picker: a searchable datalist over all trails (id-keyed) — default to preId/selection.
  const pre = State.byId.get(Number(preId)) || State.byId.get(State.selectedId) || State.routes[0];
  const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); d.setHours(9, 0, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  openSheet(
    '<h2>Plan a hike</h2>' +
    '<p class="muted">Pick a trail and time — you get a QR + link. The hike lives <b>in the link itself</b>: no sign-up, no database.</p>' +
    '<label>Trail</label>' +
    '<input id="pf-trail" list="trailList" placeholder="Type to search…" value="' + esc(pre ? pre.name : '') + '" autocomplete="off">' +
    '<datalist id="trailList"></datalist>' +
    '<label>When</label><input id="pf-when" type="datetime-local" value="' + local + '">' +
    '<label>Note (optional)</label><input id="pf-note" placeholder="Meet at the trailhead lot">' +
    '<div class="row"><button class="btn" id="pf-make">Make shareable QR</button></div>'
  );
  // populate datalist lazily (cap options so 2k doesn't bloat the DOM until typed)
  const dl = document.getElementById('trailList');
  const inp = document.getElementById('pf-trail');
  const fill = () => {
    const q = inp.value.trim().toLowerCase();
    const matches = (q ? State.routes.filter((r) => r.name.toLowerCase().includes(q)) : State.routes).slice(0, 40);
    dl.innerHTML = matches.map((r) => '<option value="' + esc(r.name) + '">' + esc(regionShort(r.region)) + '</option>').join('');
  };
  fill(); inp.oninput = fill;
  document.getElementById('pf-make').onclick = () => {
    const name = inp.value.trim();
    const r = State.routes.find((x) => x.name === name) || pre;
    if (!r) { toast('Pick a trail'); return; }
    const when = document.getElementById('pf-when').value;
    const note = document.getElementById('pf-note').value || '';
    const k = Math.random().toString(36).slice(2, 9);
    const h = { k, id: r.id, t: r.name, w: when, n: note };
    LS.set('hike:' + k, h); // remember hikes I organize (so RSVPs can land back here)
    showShare(h);
  };
}
function hikeUrl(h) { return location.origin + location.pathname + '#/hike=' + enc(h); }
function showShare(h) {
  const url = hikeUrl(h);
  openSheet(
    '<h2>Share the hike</h2>' +
    '<div class="hikecard"><div class="when">' + fmtWhen(h.w) + '</div><b>' + esc(h.t) + '</b>' +
      '<div class="muted">' + esc(h.n || regionOf(h)) + '</div></div>' +
    '<div class="qrwrap"><canvas id="qr" role="img" aria-label="QR code for this hike link"></canvas><div class="tiny" style="text-align:center">Point a camera here — anyone can open it, app or not.</div></div>' +
    '<div class="row"><button class="btn ghost" id="share">Share</button><button class="btn" id="open">Preview invite</button></div>' +
    '<div class="row"><button class="btn ghost" id="who" style="flex:1">Who’s coming (' + yesCount(roster(h.k)) + ')</button></div>'
  );
  renderQR(document.getElementById('qr'), url, 210);
  document.getElementById('share').onclick = () => shareOrCopy('Hike: ' + h.t, url);
  document.getElementById('open').onclick = () => { location.hash = '#/hike=' + enc(h); };
  document.getElementById('who').onclick = () => rosterCard(h);
}
function regionOf(h) { const r = State.byId.get(h.id) || State.routes.find((x) => x.name === h.t); return r ? r.region : ''; }
function startOf(h) { const r = State.byId.get(h.id) || State.routes.find((x) => x.name === h.t); return r ? r.start : [-89.5, 44.5]; }

function joinCard(h) {
  State.view = 'hike';
  const trail = h.t, when = h.w, note = h.n, id = h.k;
  const start = new Date(when), end = new Date(start.getTime() + 3 * 3600000);
  const st = startOf(h), thLon = st[0], thLat = st[1];
  const region = regionOf(h);
  openSheet(
    '<h2>You’re invited</h2>' +
    '<div class="hikecard"><div class="when">' + fmtWhen(when) + '</div><b>' + esc(trail) + '</b>' +
      '<div class="muted">' + esc(note || region) + (note ? ' · ' + esc(region) : '') + '</div></div>' +
    '<label>Your name</label><input id="handle" placeholder="e.g. hawk" value="' + esc(getHandle()) + '">' +
    '<div class="row"><button class="btn" id="yes">I’m in</button><button class="btn ghost" id="no">Can’t make it</button></div>' +
    '<p class="muted" style="margin-top:8px">Coming? Add it to your calendar (with reminders):</p>' +
    '<div class="row tight"><button class="btn ghost" id="ics">Calendar</button><button class="btn ghost" id="gcal">Google</button>' +
      '<button class="btn ghost" id="dir">Directions</button><button class="btn ghost" id="wx">Forecast</button></div>' +
    '<div class="row"><button class="btn ghost" id="viewmap" style="flex:1">Show trail on map</button></div>' +
    '<p class="tiny" style="margin-top:14px;text-align:center">Powered by <a href="https://opencairn.xyz" target="_blank" rel="noopener">OpenCairn</a> · free &amp; open source</p>'
  );
  const title = 'Hike: ' + trail, details = (note ? note + ' — ' : '') + 'via OpenCairn (opencairn.xyz)', loc = trail + (region ? ', ' + region : '');
  const rsvp = async (status) => {
    const handle = document.getElementById('handle').value.trim();
    if (!handle) { toast('Enter your name first'); return; }
    setHandle(handle); addRsvp(id, handle, status);
    if (FW_BASE) { try { await fetch(FW_BASE + '/hikes/' + id + '/rsvp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle, status }) }); } catch {} }
    const back = location.origin + location.pathname + '#/rsvp=' + enc({ k: id, h: handle, s: status });
    shareOrCopy(handle + ' is ' + (status === 'yes' ? 'in' : 'out') + ' for ' + trail, back);
    toast(status === 'yes' ? "You’re in — reply sent" : 'Marked, reply sent');
  };
  document.getElementById('yes').onclick = () => rsvp('yes');
  document.getElementById('no').onclick = () => rsvp('no');
  document.getElementById('ics').onclick = () => {
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OpenCairn//Hike//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + start.getTime() + '@opencairn', 'DTSTAMP:' + icsStamp(new Date()),
      'DTSTART:' + icsStamp(start), 'DTEND:' + icsStamp(end), 'SUMMARY:' + title, 'DESCRIPTION:' + details, 'LOCATION:' + loc,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Hike tomorrow — ' + trail, 'END:VALARM',
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Hike in 2 hours — ' + trail, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics); a.download = 'hike.ics'; a.click();
    toast('Calendar file ready (with reminders)');
  };
  document.getElementById('gcal').onclick = () => window.open('https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) + '&dates=' + icsStamp(start) + '/' + icsStamp(end) + '&details=' + encodeURIComponent(details) + '&location=' + encodeURIComponent(loc), '_blank');
  document.getElementById('dir').onclick = () => window.open('https://www.google.com/maps/dir/?api=1&destination=' + thLat + ',' + thLon, '_blank');
  document.getElementById('wx').onclick = () => window.open('https://forecast.weather.gov/MapClick.php?lat=' + thLat + '&lon=' + thLon, '_blank');
  document.getElementById('viewmap').onclick = () => { const r = State.byId.get(h.id) || State.routes.find((x) => x.name === trail); if (r) { closeSheet(false); location.hash = '#/route/' + r.id; } };
}
async function rosterCard(h) {
  State.view = 'roster';
  const id = h.k; let list = roster(id);
  if (FW_BASE) { try { const r = await fetch(FW_BASE + '/hikes/' + id + '/rsvps'); const j = await r.json(); list = j.roster || list; } catch {} }
  const rows = list.length ? list.map((x) => '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)"><b>' + esc(x.handle) + '</b><span class="muted">' + esc(x.status) + '</span></div>').join('')
    : '<p class="muted">No replies yet. As people tap “I’m in”, their reply comes back to you — open it and it lands here.</p>';
  openSheet('<h2>Who’s coming</h2><div class="hikecard"><div class="when">' + fmtWhen(h.w) + '</div><b>' + esc(h.t) + '</b>' +
    '<div class="muted">' + yesCount(list) + ' in' + (FW_BASE ? ' · live' : ' · peer-relayed') + '</div></div>' + rows +
    '<div class="row"><button class="btn ghost" id="reshare" style="flex:1">Share invite again</button></div>');
  document.getElementById('reshare').onclick = () => shareOrCopy('Hike: ' + h.t, hikeUrl(h));
}

/* ================================================================
 *  ROUTER
 * ================================================================ */
function route() {
  let h = location.hash.replace(/^#\/?/, ''); // strip '#' and optional leading '/'
  // deep-link forms first (may carry base64 with '=' / '+')
  let m;
  if ((m = h.match(/^hike=(.+)$/))) { try { joinCard(dec(m[1])); } catch { toast('Bad hike link'); } return; }
  if ((m = h.match(/^rsvp=(.+)$/))) {
    try {
      const p = dec(m[1]); addRsvp(p.k, p.h, p.s); toast(p.h + ' → ' + p.s);
      let hk = { k: p.k, id: null, t: '', w: '', n: '' };
      const saved = LS.get('hike:' + p.k, null); if (saved) hk = saved;
      rosterCard(hk);
    } catch { toast('Bad RSVP link'); }
    return;
  }
  const parts = h.split(/[/?]/);
  switch (parts[0]) {
    case '': closeSheet(false); break;
    case 'routes': routesView(); break;
    case 'route': routeDetail(Number(parts[1])); break;
    case 'waypoint': waypointView(parts[1]); break;
    case 'accuracy': accuracyView(); break;
    case 'place': placeSearch(); break;
    case 'plan': planForm(new URLSearchParams(h.split('?')[1] || '').get('t')); break;
    case 'home': homeView(); break;
    case 'settings': settingsView(); break;
    case 'about': aboutView(); break;
    default: closeSheet(false);
  }
}

/* ================================================================
 *  INSTALL / OFFLINE / THEME plumbing
 * ================================================================ */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.getElementById('installChip').hidden = false; });
window.addEventListener('appinstalled', () => { document.getElementById('installChip').hidden = true; toast('Installed — find OpenCairn on your home screen'); });
document.getElementById('installChip').onclick = doInstall;
async function doInstall() {
  if (deferredPrompt) { deferredPrompt.prompt(); try { await deferredPrompt.userChoice; } catch {} deferredPrompt = null; document.getElementById('installChip').hidden = true; }
  else { const hint = document.getElementById('installHint'); toast(isIOS() ? 'iOS: Share → Add to Home Screen' : 'Use your browser menu → Install app'); if (hint) hint.innerHTML = installHintText(); }
}
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function installHintText() {
  if (isStandalone()) return 'Already installed — running as an app ✓';
  if (deferredPrompt) return 'Tap the button to install to your home screen.';
  if (isIOS()) return 'iPhone/iPad: tap the <b>Share</b> icon, then <b>Add to Home Screen</b>.';
  return 'Not offered yet — open your browser menu and choose <b>Install app</b> / <b>Add to Home Screen</b>.';
}

function setThemeColorMeta() {
  // Keep the standalone titlebar/status area in sync when the user forces a theme.
  const dark = isDarkTheme();
  const forced = themePref() !== 'system';
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    if (forced) meta.setAttribute('content', dark ? '#0d1316' : '#00707a');
    else meta.setAttribute('content', meta.media && meta.media.includes('dark') ? '#0d1316' : '#00707a');
  });
}
function applyTheme() {
  const t = themePref();
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  setThemeColorMeta();
  applyBasemapTheme();
}
try {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themePref() === 'system') { setThemeColorMeta(); applyBasemapTheme(); }
  });
} catch {}

function updateOnline() {
  const pill = document.getElementById('statusPill');
  if (pill._updateReady) return; // "new version" pill owns the slot
  if (navigator.onLine) { pill.hidden = true; }
  else { pill.hidden = false; pill.className = 'statuspill'; pill.textContent = '⚠ Offline — cached trails & tiles only'; }
}
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);

function fatal(msg) {
  const pill = document.getElementById('statusPill');
  pill.hidden = false; pill.className = 'statuspill'; pill.textContent = msg;
  const lc = document.getElementById('legendCount'); if (lc) lc.textContent = msg;
}

/* ---------- service worker: register FIRST, real update path ---------- */
let _updateRequested = false;
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // already-waiting worker (page was reopened mid-update)
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        // 'installed' + an existing controller = a NEW version is ready
        if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
      });
    });
  }).catch((e) => console.warn('SW registration failed', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // reload only for a user-approved update, never on first install (claim())
    if (_updateRequested) { _updateRequested = false; location.reload(); }
  });
}
function offerUpdate(worker) {
  const pill = document.getElementById('statusPill');
  pill._updateReady = true;
  pill.hidden = false;
  pill.className = 'statuspill info tappable';
  pill.textContent = '⬆ New version ready — tap to refresh';
  pill.onclick = () => {
    _updateRequested = true;
    try { worker.postMessage('skipWaiting'); } catch { location.reload(); }
    pill.textContent = 'Updating…';
  };
}

/* ================================================================
 *  BOOT
 * ================================================================ */
function legendFromRegions() {
  const rows = document.getElementById('legendRows');
  if (!rows) return;
  rows.innerHTML = Object.keys(REGION_COLOR).map((r) =>
    '<div><b style="background:' + REGION_COLOR[r] + '"></b>' + esc(regionShort(r)) + '</div>').join('');
}

async function boot() {
  applyTheme();
  updateOnline();
  legendFromRegions();

  // SW registration is unconditional and first: one flaky seed fetch must
  // never cost us the offline story.
  registerSW();

  // top-bar buttons
  document.getElementById('homeBtn').onclick = () => { location.hash = '#/'; };
  document.getElementById('routesBtn').onclick = () => { location.hash = '#/routes'; };
  document.getElementById('searchBtn').onclick = () => { location.hash = '#/place'; };
  document.getElementById('gpsBtn').onclick = () => { location.hash = '#/accuracy'; };
  document.getElementById('settingsBtn').onclick = () => { location.hash = '#/settings'; };
  document.getElementById('planBtn').onclick = () => { location.hash = '#/plan'; };
  window.addEventListener('hashchange', route);

  // Breadcrumb dock wires BEFORE any network/profile await: it's the safety
  // feature and must work even if the seed fetch or the map engine fails.
  setupCrumbDock();

  // device self-profile (webProfile.js) — kicked off early, awaited after the
  // seed fetch so the probes run in parallel with the network.
  let profileP = null;
  try { if (typeof window.buildWebProfile === 'function') profileP = window.buildWebProfile(); } catch {}

  // load trail seed (precached by SW → works offline)
  try {
    const res = await fetch('./trails.min.json', { cache: 'force-cache' });
    State.raw = await res.json();
  } catch (e) {
    fatal('Trail data failed to load — check connection & refresh');
    console.error('seed load failed', e); return;
  }
  // build in-memory index (distance derived once; State.raw keeps the only
  // geometry/feature copy — routes hold coords by reference, no duplicates)
  State.raw.features.forEach((f) => {
    const p = f.properties, coords = f.geometry.coordinates;
    if (!coords || !coords.length) return;
    const r = { id: p.id, name: p.name, region: p.region, color: regionColor(p.region),
      coords, start: coords[0], distance_m: trackLength(coords) };
    State.routes.push(r); State.byId.set(r.id, r);
  });

  try { if (profileP) State.profile = await profileP; } catch {}
  if (!State.profile) {
    State.profile = { tier: 'standard',
      features: { fullGeometry: true, vectorTiles: true, animations: !reducedMotion() },
      reasons: ['webProfile.js unavailable — standard defaults'], probes: {} };
  }

  // The map engine is self-hosted, but if it still failed to parse/load,
  // say so visibly instead of throwing into the void.
  if (typeof maplibregl === 'undefined') {
    fatal('Map engine failed to load — refresh to retry');
    return;
  }
  initMap();
}

boot();
