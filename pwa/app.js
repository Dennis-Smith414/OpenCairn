/* OpenCairn PWA — Seattle Tech Week.
 * Vanilla JS, no framework. Persistent MapLibre shell + hash router + bottom sheets.
 * Data: 2,000+ trail LineStrings from trails.min.json (id/name/region). No backend.
 *
 * Perf strategy for ~2k trails / ~38k vertices:
 *   - ALL trail lines live in ONE GeoJSON source / ONE WebGL line layer (data-driven
 *     colour by region) — GPU-rendered, effectively free to pan/zoom.
 *   - The GeoJSON source is tiled+simplified by zoom by MapLibre's built-in
 *     geojson-vt (explicit `tolerance`/`maxzoom`/`buffer` below): at overview zooms
 *     each tile carries a few hundred simplified vertices, never all 38k.
 *   - Trailhead "cairns" (one Point per trail) live in a CLUSTERED GeoJSON source,
 *     so the map only ever draws a few dozen circles, not 2,000 DOM markers.
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
  'Snoqualmie Valley / North Bend, WA': '#c0503f',
  'Cascade Foothills, WA': '#4f8a3f',
  'Seattle / Puget Sound, WA': '#0e83a3',
  'Issaquah Alps, WA': '#7a5cc0',
};
const REGION_DEFAULT = '#7c6c4f';
const REGION_SHORT = {
  'Snoqualmie Valley / North Bend, WA': 'Snoqualmie / North Bend',
  'Cascade Foothills, WA': 'Cascade Foothills',
  'Seattle / Puget Sound, WA': 'Seattle / Puget Sound',
  'Issaquah Alps, WA': 'Issaquah Alps',
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
    center: [-121.9, 47.5], zoom: 8.6, maxZoom: 19,
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
  // Mic leak fix: closing the voice sheet must kill any in-flight recognizer
  // immediately — otherwise the mic stays hot ~9 s with no UI on screen.
  try { if (window.EdgeAI && typeof window.EdgeAI.cancelListen === 'function') window.EdgeAI.cancelListen(); } catch {}
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
        '<button class="pill" id="pDisc">✨ Describe a hike</button>' +
      '</div>' +
    '</div>' +
    '<div class="list" id="list"></div>'
  );
  const regions = ['all', ...Object.keys(REGION_COLOR)];
  document.getElementById('regionPills').innerHTML = regions.map((r) =>
    '<button class="pill' + (Browse.region === r ? ' on' : '') + '" data-r="' + esc(r) + '" aria-pressed="' + (Browse.region === r) + '">' +
    (r === 'all' ? 'All regions' : esc(regionShort(r))) + '</button>').join('');
  document.querySelectorAll('#regionPills .pill').forEach((b) => b.onclick = () => { Browse.region = b.dataset.r; Browse.shown = 60; routesView(); });
  document.getElementById('pDisc').onclick = () => { location.hash = '#/discover'; };
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
    (window.TrailPulse ? // conditions layer (pulse.js) — localStorage-only, every tier
      '<h3>Trail pulse <span class="tiny">(conditions)</span></h3>' +
      '<div id="pulseWrap"></div>' +
      '<div class="row tight"><button class="btn ghost" id="pulseReport">⚑ Report conditions</button></div>' +
      '<div id="pulseForm" hidden>' +
        '<label for="pulseKind">Condition</label>' +
        '<select id="pulseKind">' + window.TrailPulse.KINDS.map((k) =>
          '<option value="' + esc(k) + '">' + esc(k.replace(/-/g, ' ')) + '</option>').join('') + '</select>' +
        '<label for="pulseNote">Where / note (optional)</label>' +
        '<input id="pulseNote" maxlength="280" placeholder="e.g. big blowdown at the second creek crossing" autocomplete="off">' +
        '<div class="row tight"><button class="btn" id="pulseSave">Post report</button></div>' +
      '</div>'
    : '') +
    '<h3>Waypoints <span class="tiny">(derived from track)</span></h3>' +
    '<div id="wps">' + wps.map((w) => {
      const t = TYPE[w.type] || TYPE.generic;
      return '<button class="wp" data-wp="' + w.id + '">' +
        '<span class="wpin" style="background:' + t.c + '"><span>' + t.e + '</span></span>' +
        '<span><span class="wp-name">' + esc(w.name) + '</span><br>' +
        '<span class="wp-sub">' + w.type.replace(/-/g, ' ') + ' · ' + w.coord[1].toFixed(4) + ', ' + w.coord[0].toFixed(4) + '</span></span>' +
      '</button>';
    }).join('') + '</div>' +
    '<div class="callout"><b>Honest note.</b> This seed carries the GPX <b>track</b> only, so waypoints are derived from the line (trailhead / midpoint / turnaround). Named cairns, photos, votes &amp; comments live in the full OpenCairn app.</div>'
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

  // Trail pulse wiring (only when pulse.js loaded — section is absent otherwise)
  const pw = document.getElementById('pulseWrap');
  if (pw && window.TrailPulse) {
    const TP = window.TrailPulse;
    const renderPulse = () => {
      // renderPulseBadge escapes every user string itself (module contract)
      try { pw.innerHTML = TP.renderPulseBadge(TP.getPulse(id)); } catch { pw.innerHTML = ''; }
    };
    renderPulse();
    const form = document.getElementById('pulseForm');
    document.getElementById('pulseReport').onclick = () => { form.hidden = !form.hidden; if (!form.hidden) document.getElementById('pulseNote').focus(); };
    document.getElementById('pulseSave').onclick = () => {
      const kind = document.getElementById('pulseKind').value;
      const note = document.getElementById('pulseNote').value;
      const rep = TP.addReport({ trailId: id, kind, note });
      if (!rep) { toast('Could not save that report'); return; }
      document.getElementById('pulseNote').value = '';
      form.hidden = true;
      renderPulse();
      toast('Condition report saved' + (TP.getPulse(id).local ? ' on this device' : ''));
    };
  }
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
    '<input id="q" placeholder="e.g. North Bend, WA" autocomplete="off" aria-label="Place search">' +
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
 *  VOICE  (#/voice — tiered by webProfile + edgeAI)
 *    flagship : push-to-talk mic → Chrome built-in AI (Gemini Nano) → tools
 *    standard : typed command box → rules (or Nano when present) → tools
 *    lite     : hidden entirely (FAB never shows; deep-link gets an honest note)
 * ================================================================ */
function edgeAI() { return (typeof window !== 'undefined' && window.EdgeAI) ? window.EdgeAI : null; }

function setupVoiceFab() {
  const btn = document.getElementById('voiceBtn');
  if (!btn) return;
  const p = State.profile;
  if (!p || p.tier === 'lite') { btn.hidden = true; return; }
  const flagship = !!(p.features && p.features.voice);
  btn.hidden = false;
  btn.classList.toggle('degraded', !flagship);
  btn.setAttribute('aria-label', flagship ? 'Voice assistant (push to talk)' : 'Trail assistant (typed commands)');
  btn.title = btn.getAttribute('aria-label');
  btn.onclick = () => { location.hash = '#/voice'; };
}

/* ---- TTS read-back (Web Speech Synthesis) — speaks tool-call results back,
 *      hands-free. Voice + speed are user-selectable and persisted. All guarded:
 *      on a browser without speechSynthesis this is simply inert. ---- */
const TTS = { supported: (typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'), voices: [] };
function ttsLoadVoices() {
  if (!TTS.supported) return [];
  try {
    const all = window.speechSynthesis.getVoices() || [];
    const en = all.filter((v) => /^en/i.test(v.lang || ''));
    TTS.voices = en.length ? en : all;   // prefer English, fall back to everything
  } catch { TTS.voices = []; }
  return TTS.voices;
}
if (TTS.supported) { try { ttsLoadVoices(); window.speechSynthesis.addEventListener('voiceschanged', ttsLoadVoices); } catch {} }
function ttsStrip(html) { try { const d = document.createElement('div'); d.innerHTML = html; return (d.textContent || '').replace(/\s+/g, ' ').trim(); } catch { return String(html || ''); } }
function ttsSpeak(text) {
  if (!TTS.supported || !LS.get('ttsEnabled', true)) return;
  const t = String(text || '').trim(); if (!t) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    const uri = LS.get('ttsVoice', '');
    if (uri) { const v = (TTS.voices || []).find((x) => x.voiceURI === uri); if (v) u.voice = v; }
    u.rate = Number(LS.get('ttsRate', 1)) || 1;
    u.lang = (u.voice && u.voice.lang) || 'en-US';
    window.speechSynthesis.speak(u);
  } catch {}
}

function voiceView() {
  const p = State.profile;
  const EA = edgeAI();
  if (!p || p.tier === 'lite') {
    State.view = 'voice';
    openSheet('<h2>Trail assistant</h2>' +
      '<div class="callout"><b>Not on this device.</b> This browser/device reported a low-resource profile (' +
      esc(p ? p.reasons.join(' ') : 'no profile') + ') — the assistant is switched off rather than shipped broken.</div>');
    return;
  }
  State.view = 'voice';
  const flagship = !!(p.features && p.features.voice);
  const micOK = !!(flagship && EA && EA.isVoiceAvailable());
  openSheet(
    '<h2>Trail assistant</h2>' +
    '<div id="vstatus" class="tiny" style="margin:4px 0 2px"></div>' +
    '<div id="fspanel" class="fspanel"></div>' +
    (micOK
      ? '<button class="ptt" id="ptt" aria-label="Push to talk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg></button>' +
        '<span class="ptt-label" id="pttLabel">Tap &amp; speak</span>'
      : '') +
    '<label for="vq">' + (micOK ? 'Or type a command' : 'Type a command') + '</label>' +
    '<div class="row tight" style="margin-top:2px">' +
      '<input id="vq" placeholder="e.g. drop a cairn called lunch spot" autocomplete="off" style="flex:3;min-width:0">' +
      '<button class="btn" id="vgo" style="flex:1">Run</button>' +
    '</div>' +
    '<div class="vlog" id="vlog"></div>' +
    (TTS.supported
      ? '<details class="vset" id="vset"><summary>Voice &amp; read-back</summary>' +
        '<label class="vrow"><input type="checkbox" id="ttsOn"> <span>Speak results back</span></label>' +
        '<label class="vrow"><span>Voice</span><select id="ttsVoice"></select></label>' +
        '<label class="vrow"><span>Speed</span><input type="range" id="ttsRate" min="0.6" max="1.4" step="0.1"></label>' +
        '<button class="btn ghost" id="ttsTest" type="button">Test voice</button>' +
        '</details>'
      : '') +
    '<div class="callout" id="vhonest"></div>'
  );
  // navigating to another sheet view must also cut the mic (closeSheet isn't
  // on that path — openSheet runs the registered cleanups instead)
  onViewCleanup(() => { try { if (window.EdgeAI) window.EdgeAI.cancelListen(); } catch {} });

  const honest = document.getElementById('vhonest');
  if (flagship) {
    honest.innerHTML = '<b>How this works.</b> Speech → Chrome’s <b>on-device</b> built-in model (Gemini Nano) → OpenCairn tool calls. The model runs in your browser; utterances are not sent to any OpenCairn server. The mic capture itself uses the browser’s speech service.' + (micOK ? '' : ' <b>No mic API on this browser</b> — typed commands still run on-device.');
  } else {
    honest.innerHTML = '<b>Degraded on this browser — honestly.</b> No on-device model is available here, so commands are parsed by deterministic rules (typed only, fully offline). The full push-to-talk assistant lights up on flagship Chrome and in the native Android app.';
  }

  const status = document.getElementById('vstatus');
  const setStatus = (html) => { if (document.getElementById('vstatus')) document.getElementById('vstatus').innerHTML = html; };
  const tierChip = '<span class="tierchip on">' + esc(p.tier) + ' tier</span>';
  setStatus(tierChip + '<span class="tierchip">interpreter: …</span>');
  if (EA) {
    EA.getStatus().then((s) => {
      let chip = s.interpreter;
      if (s.nano === 'downloading') chip = 'gemini-nano · downloading' + (s.nanoDownloadProgress != null ? ' ' + Math.round(s.nanoDownloadProgress * 100) + '%' : '…');
      else if (s.nano === 'downloadable' && flagship) chip = 'gemini-nano · first use downloads the model';
      setStatus(tierChip + '<span class="tierchip' + (s.nano === 'available' ? ' on' : '') + '">' + esc(chip) + '</span>');
    }).catch(() => {});
    if (flagship && p.features.chromeNano) { try { EA.warmUp(); } catch {} }
  } else {
    setStatus(tierChip + '<span class="tierchip">assistant module unavailable</span>');
  }

  // ── Feedseed on-device (WebGPU): the app's OWN model, downloaded once from
  // this URL, then run in the browser — no store, no cloud. Flagship + real
  // WebGPU adapter only; everything else never sees this panel.
  renderFeedseedPanel(flagship, setStatus, tierChip);

  // Voice & read-back settings (TTS): populate the voice list, restore + persist
  // the user's choices. Voices load async on some browsers -> refill on change.
  if (TTS.supported) {
    const onEl = document.getElementById('ttsOn');
    const vsel = document.getElementById('ttsVoice');
    const rate = document.getElementById('ttsRate');
    const fillVoices = () => {
      if (!document.getElementById('ttsVoice')) return;
      const cur = LS.get('ttsVoice', '');
      const vs = ttsLoadVoices();
      vsel.innerHTML = '<option value="">System default</option>' +
        vs.map((v) => '<option value="' + esc(v.voiceURI) + '"' + (v.voiceURI === cur ? ' selected' : '') + '>' +
          esc(v.name) + ' · ' + esc(v.lang) + (v.localService ? '' : ' (online)') + '</option>').join('');
    };
    if (onEl) { onEl.checked = LS.get('ttsEnabled', true); onEl.onchange = () => LS.set('ttsEnabled', onEl.checked); }
    if (rate) { rate.value = LS.get('ttsRate', 1); rate.oninput = () => LS.set('ttsRate', Number(rate.value)); }
    if (vsel) vsel.onchange = () => { LS.set('ttsVoice', vsel.value); ttsSpeak('This is the OpenCairn voice.'); };
    fillVoices();
    const test = document.getElementById('ttsTest');
    if (test) test.onclick = () => { LS.set('ttsEnabled', true); if (onEl) onEl.checked = true; ttsSpeak('OpenCairn voice ready. Dropped a cairn at your location.'); };
    let _vc = fillVoices;
    try { window.speechSynthesis.addEventListener('voiceschanged', _vc); } catch {}
    onViewCleanup(() => { try { window.speechSynthesis.removeEventListener('voiceschanged', _vc); window.speechSynthesis.cancel(); } catch {} });
  }

  const log = (transcript, calls, backend, failReason) => {
    const el = document.getElementById('vlog'); if (!el) return;
    const results = failReason ? [] : executeCalls(calls || []);
    const div = document.createElement('div'); div.className = 'vturn';
    div.innerHTML =
      (transcript ? '<div class="vt-you">' + esc(transcript) + '</div>' : '') +
      (failReason
        ? '<div class="vt-call">' + esc(failReason) + '</div>'
        : (results.length
            ? results.map((x) => '<div class="vt-call"><code>' + esc(x.name) + '</code><span>' + x.html + '</span></div>').join('')
            : '<div class="vt-call">No matching trail command — try “where am I”, “drop a cairn” or “how far to the trailhead”.</div>')) +
      (backend ? '<div class="vt-backend">interpreted by ' + esc(backend) + '</div>' : '');
    el.prepend(div);
    // Read the outcome back, hands-free (guarded + user-toggled).
    const spoken = failReason ? failReason
      : (results.length ? results.map((x) => ttsStrip(x.html)).join('. ') : '');
    if (spoken) ttsSpeak(spoken);
  };

  const runTyped = async () => {
    const inp = document.getElementById('vq');
    const text = inp.value.trim(); if (!text) return;
    inp.value = '';
    if (!EA) { log(text, [], null, 'Assistant module failed to load — refresh to retry.'); return; }
    try {
      const out = await EA.interpret(text);
      const s = await EA.getStatus().catch(() => null);
      log(text, out && out.calls, s ? s.interpreter : 'rules');
    } catch { log(text, [], null, 'Could not interpret that.'); }
  };
  document.getElementById('vgo').onclick = runTyped;
  document.getElementById('vq').addEventListener('keydown', (e) => { if (e.key === 'Enter') runTyped(); });

  if (micOK) {
    const ptt = document.getElementById('ptt');
    const lbl = document.getElementById('pttLabel');
    let busy = false;
    ptt.onclick = async () => {
      if (busy) return;
      busy = true; ptt.classList.add('listening'); lbl.textContent = 'Listening…';
      try {
        const res = await EA.startVoiceTurn({ timeoutMs: 9000 });
        if (res.ok) log(res.transcript, res.calls, res.backend);
        else log('', [], null, res.reason === 'voice unavailable on this browser' ? res.reason : 'Didn’t catch that (' + res.reason + ') — try again or type below.');
      } catch { log('', [], null, 'Voice turn failed — type below instead.'); }
      ptt.classList.remove('listening'); lbl.innerHTML = 'Tap &amp; speak';
      busy = false;
    };
  }
}

/* Feedseed-on-WebGPU opt-in panel. Renders inside #fspanel. Flagship + real
 * WebGPU adapter only. One button → downloads OUR ~90MB model once (cached
 * forever), then the browser voice runs Feedseed on-device. Honest at every
 * step: size up front, progress during, "offline, our model" when ready,
 * plain error if the assets aren't hosted yet. Never throws. */
function renderFeedseedPanel(flagship, setStatus, tierChip) {
  const el = document.getElementById('fspanel');
  const FB = (typeof window !== 'undefined') ? window.FeedseedBackend : null;
  if (!el) return;
  if (!FB || !FB.webgpuSupported() || !(flagship && State.profile.features && State.profile.features.webgpuAI)) {
    el.hidden = true; return;                      // silent: this tier can't run it
  }
  el.hidden = false;
  const mb = Math.round((FB.getState().approxBytes || 0) / (1024 * 1024));

  const paint = (st) => {
    if (!document.getElementById('fspanel')) return;
    if (st.state === 'ready') {
      el.innerHTML =
        '<div class="fs-ready"><b>✓ Feedseed is running on-device.</b> ' +
        'OpenCairn’s own fine-tuned model (Gemma3-270M · ' + esc(st.dtype) + ') — downloaded once, now WebGPU, fully offline. ' +
        'No store, no cloud, no data-center.' +
        (st.grammar ? ' <b>Grammar-locked</b>: it can only emit a valid command with a <b>real</b> trail name — no malformed calls, no invented trails.' : '') +
        '</div>';
      try { setStatus(tierChip + '<span class="tierchip on">feedseed · on-device' + (st.grammar ? ' · grammar-locked' : '') + '</span>'); } catch {}
      return;
    }
    if (st.state === 'downloading') {
      const pct = Math.round((st.progress || 0) * 100);
      el.innerHTML =
        '<div class="fs-dl"><b>Downloading Feedseed…</b> ' + pct + '%' +
        '<div class="fs-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="tiny">Once only — it’s cached in your browser and runs offline after this.</div></div>';
      return;
    }
    if (st.state === 'error') {
      el.innerHTML =
        '<div class="fs-err"><b>Couldn’t load the on-device model.</b> ' +
        esc(st.error || 'model assets not reachable') + '. ' +
        'The assistant still runs — falling back to the built-in AI / offline rules below.</div>';
      return;
    }
    // idle / not downloaded yet
    el.innerHTML =
      '<div class="fs-offer"><b>Run OpenCairn’s own model on your phone.</b> ' +
      'Download <b>Feedseed</b> once (~' + mb + ' MB) and the voice assistant runs <b>our fine-tuned model</b> ' +
      'on WebGPU — no app store, no cloud, offline forever after. ' +
      '<button class="btn" id="fsdl">Download offline AI · ~' + mb + ' MB</button>' +
      '<div class="tiny">Best on Wi-Fi. Grounded to real trail names so it can’t invent a trail.</div></div>';
    const btn = document.getElementById('fsdl');
    if (btn) btn.onclick = async () => {
      paint(Object.assign(FB.getState(), { state: 'downloading', progress: 0 }));
      await FB.download((p) => paint(FB.getState()));
      paint(FB.getState());
    };
  };

  // Reflect an already-cached model as ready-to-reattach without re-downloading.
  FB.isDownloaded().then((cached) => {
    const st = FB.getState();
    if (cached && st.state !== 'ready') {
      // Reattach the pipeline from cache (fast, no network) in the background.
      paint(Object.assign(FB.getState(), { state: 'downloading', progress: 1 }));
      FB.download(() => {}).then(() => paint(FB.getState()));
    } else {
      paint(st);
    }
  }).catch(() => paint(FB.getState()));
}

/* Execute validated tool calls against the real app. Pure honest wiring:
 * what works offline works; what needs native says so. Never throws. */
function executeCalls(calls) {
  const out = [];
  for (const call of calls) {
    let html = '';
    try { html = execOne(call); } catch { html = 'That action failed.'; }
    out.push({ name: call.name, html });
  }
  return out;
}
function execOne(call) {
  const args = call.arguments || {};
  const sel = State.byId.get(State.selectedId);
  switch (call.name) {
    case 'get_location': {
      if (State.userPos) {
        return 'You’re at <b>' + State.userPos[1].toFixed(5) + ', ' + State.userPos[0].toFixed(5) + '</b> (±' + Math.round(State.userAcc || 0) + ' m).';
      }
      try { window._geo.trigger(); } catch {}
      return 'No GPS fix yet — requesting one now (allow location access).';
    }
    case 'drop_cairn': {
      if (!State.userPos) { try { window._geo.trigger(); } catch {} return 'Need a GPS fix to drop a cairn — requesting one; try again in a moment.'; }
      const label = (args.label == null ? '' : String(args.label)).trim();
      const c = { id: 'c' + Date.now(), label: label || 'Cairn', coord: State.userPos.slice(), at: Date.now() };
      const all = savedCairns(); all.push(c); LS.set('cairns', all);
      addCairnMarker(c);
      return 'Dropped <b>' + esc(c.label) + '</b> at ' + c.coord[1].toFixed(5) + ', ' + c.coord[0].toFixed(5) + ' — saved on this device.';
    }
    case 'list_waypoints': {
      const mine = savedCairns();
      const parts = [];
      if (sel) parts.push('On <b>' + esc(sel.name) + '</b>: ' + waypointsFor(sel).map((w) => esc(w.name)).join(', ') + '.');
      if (mine.length) parts.push('Your dropped cairns: ' + mine.map((c) => esc(c.label)).join(', ') + '.');
      if (!parts.length) return 'No waypoints yet — open a trail (they’re derived from the track) or say “drop a cairn”.';
      return parts.join(' ');
    }
    case 'query_waypoint': {
      const q = String(args.name || '').toLowerCase();
      if (!q) return 'Which waypoint?';
      if (sel) {
        const w = waypointsFor(sel).find((x) => x.name.toLowerCase().includes(q));
        if (w) return '<b>' + esc(w.name) + '</b> — ' + esc(w.description) + ' (' + w.coord[1].toFixed(4) + ', ' + w.coord[0].toFixed(4) + ')';
      }
      const mine = savedCairns().find((c) => (c.label || '').toLowerCase().includes(q));
      if (mine) return '<b>' + esc(mine.label) + '</b> — a cairn you dropped at ' + mine.coord[1].toFixed(4) + ', ' + mine.coord[0].toFixed(4) + '.';
      const tr = State.routes.find((r) => r.name.toLowerCase().includes(q));
      if (tr) { location.hash = '#/route/' + tr.id; return 'Opening trail <b>' + esc(tr.name) + '</b>…'; }
      return 'No waypoint or trail named “' + esc(args.name) + '” here.';
    }
    case 'distance_to_waypoint': {
      const q = String(args.name || '').toLowerCase();
      if (!State.userPos) { try { window._geo.trigger(); } catch {} return 'Need a GPS fix first — requesting one.'; }
      let target = null, label = null;
      if (sel) { const w = waypointsFor(sel).find((x) => x.name.toLowerCase().includes(q)); if (w) { target = w.coord; label = w.name; } }
      if (!target) { const c = savedCairns().find((x) => (x.label || '').toLowerCase().includes(q)); if (c) { target = c.coord; label = c.label; } }
      if (!target) { const tr = State.routes.find((r) => r.name.toLowerCase().includes(q)); if (tr) { target = tr.start; label = tr.name + ' trailhead'; } }
      if (!target) return 'Nothing named “' + esc(args.name) + '” to measure to.';
      return '<b>' + fmtDist(haversine(State.userPos, target)) + '</b> line-of-sight to ' + esc(label) + '.';
    }
    case 'check_off_route': {
      if (!sel) return 'No trail selected — open one first, then I can check.';
      if (!State.userPos) { try { window._geo.trigger(); } catch {} return 'Need a GPS fix first — requesting one.'; }
      const d = nearestOnTrack(State.userPos, sel.coords);
      if (d <= 60) return 'You’re <b>on route</b> — within ' + fmtDist(d) + ' of ' + esc(sel.name) + '.';
      if (d <= 200) return 'Slightly off — about ' + fmtDist(d) + ' from the ' + esc(sel.name) + ' track.';
      return '<b>Off route</b>: ' + fmtDist(d) + ' from ' + esc(sel.name) + '. Head back toward the line on the map.';
    }
    case 'control_music':
      return 'Music control (' + esc(args.action || '?') + ') is wired to the system player in the <b>native app</b> — this web demo has no playback to control. No fake buttons.';
    case 'dial_emergency':
      return '<b>Emergency:</b> <a href="tel:911">tap to call 911</a>. (The web demo can only open the dialer — auto-dial &amp; offline SOS are native-app features.)';
    default:
      return 'Unknown tool.';
  }
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

/* ================================================================
 *  DISCOVER  (#/discover — discover.js natural-language trail search)
 *  Works on EVERY tier via the offline rules backend; the Gemini Nano
 *  refinement only runs when webProfile granted features.chromeNano
 *  (forceRules otherwise — discovery must never trigger the download).
 * ================================================================ */
function discoverView() {
  State.view = 'discover';
  const TD = window.TrailDiscover;
  const nanoOK = !!(State.profile && State.profile.features && State.profile.features.chromeNano);
  openSheet(
    '<h2>Discover trails</h2>' +
    '<p class="muted">Describe the hike you want in plain words — matching runs entirely <b>on this device</b>, against the offline seed.</p>' +
    '<div class="row tight" style="margin-top:8px">' +
      '<input id="dq" placeholder="e.g. a 5-mile loop near Issaquah with a lake" autocomplete="off" style="flex:3;min-width:0" aria-label="Describe a hike">' +
      '<button class="btn" id="dgo" style="flex:1">Find</button>' +
    '</div>' +
    '<div class="tiny" id="dBackend" style="margin:7px 0 0">' +
      (nanoOK ? 'interpreter: on-device AI (Gemini Nano) refined by offline rules'
              : 'interpreter: offline rules — no on-device AI on this profile, nothing downloads') +
    '</div>' +
    '<div id="dNotes"></div>' +
    '<div class="list" id="dRes"></div>' +
    (TD ? '' : '<div class="callout"><b>Module unavailable.</b> discover.js failed to load — refresh to retry.</div>')
  );
  if (!TD) return;
  const run = async () => {
    const q = document.getElementById('dq').value.trim(); if (!q) return;
    const res = document.getElementById('dRes');
    res.innerHTML = '<p class="muted"><span class="spin"></span>Matching…</p>';
    let out;
    try { out = await TD.discover(q, State.routes, { limit: 12, forceRules: !nanoOK }); }
    catch { out = { ok: false, notes: ['discovery failed — try again'], results: [], backend: 'rules' }; }
    if (State.view !== 'discover') return; // navigated away mid-await
    const notes = document.getElementById('dNotes');
    if (notes) notes.innerHTML = (out.notes || []).map((n) => '<div class="callout">' + esc(n) + '</div>').join('');
    const bk = document.getElementById('dBackend');
    if (bk) bk.textContent = 'interpreted by ' + (out.backend === 'prompt-api' ? 'gemini-nano (on-device)' : 'offline rules');
    if (!out.ok || !out.results.length) {
      res.innerHTML = '<div class="emptynote">No matches.<br><span class="tiny">Try naming a length, region or feature (lake, falls, ridge…).</span></div>';
      return;
    }
    res.innerHTML = out.results.map((r) =>
      '<button class="listitem" data-id="' + r.id + '">' +
        '<span class="dot" style="background:' + regionColor(r.region) + '"></span>' +
        '<span class="li-main"><span class="li-name">' + esc(r.name) + '</span>' +
        '<span class="li-sub">' + esc(r.reason) + '</span></span>' +
        '<span class="li-meta">' + r.lengthMi.toFixed(1) + ' mi<br>' + (r.isLoop ? 'loop' : 'out &amp; back') + '</span>' +
      '</button>').join('');
    res.querySelectorAll('.listitem').forEach((b) => b.onclick = () => { location.hash = '#/route/' + b.dataset.id; });
  };
  document.getElementById('dgo').onclick = run;
  document.getElementById('dq').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}

/* ================================================================
 *  GROUP  (#/group — comms.js: Meshtastic LoRa over Web Bluetooth)
 *  Gated twice: MeshComms.isCommsAvailable() (Chrome-only API) AND the
 *  webProfile tier (lite never gets the BLE panel). Hidden, not broken.
 * ================================================================ */
const Mesh = { log: [], peerMarkers: new Map(), status: 'idle', device: null, wired: false };
function meshAllowed() {
  return !!(window.MeshComms && window.MeshComms.isCommsAvailable() &&
    State.profile && State.profile.tier !== 'lite');
}
function setupGroupBtn() {
  const btn = document.getElementById('groupBtn');
  if (!btn) return;
  const ok = meshAllowed();
  btn.hidden = !ok;
  if (ok) btn.onclick = () => { location.hash = '#/group'; };
}
function setupMesh() {
  if (Mesh.wired || !window.MeshComms || !window.MeshComms.isCommsAvailable()) return;
  Mesh.wired = true;
  const MC = window.MeshComms;
  MC.onStatus((s) => {
    Mesh.status = s.state;
    if (s.detail && s.detail.deviceName) Mesh.device = s.detail.deviceName;
    if (s.state === 'disconnected') toast('Mesh radio disconnected');
    if (State.view === 'group') groupView(); // re-render reflects connect state
  });
  MC.onMessage((m) => {
    Mesh.log.push({ who: m.fromName || 'mesh', text: String(m.text), me: false, at: Date.now() });
    if (Mesh.log.length > 200) Mesh.log.shift();
    if (State.view === 'group') renderMeshLog();
    else toast('Mesh · ' + (m.fromName || 'peer') + ': ' + String(m.text).slice(0, 60)); // toast uses textContent — safe
  });
  MC.onPosition((p) => {
    if (!map || p.lat == null || p.lon == null) return; // map dead → chat still works, just no pins
    let mk = Mesh.peerMarkers.get(p.num);
    if (mk) { mk.setLngLat([p.lon, p.lat]); return; }
    const el = document.createElement('div'); el.className = 'pin'; el.style.background = 'var(--water)';
    el.innerHTML = '<span>◈</span>';
    const pop = new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
      '<div class="pop-t">' + esc(p.name || 'peer') + '</div><div class="pop-type">mesh peer (LoRa)</div>');
    mk = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lon, p.lat]).setPopup(pop).addTo(map);
    Mesh.peerMarkers.set(p.num, mk);
  });
}
function groupView() {
  State.view = 'group';
  const MC = window.MeshComms;
  if (!meshAllowed()) {
    openSheet('<h2>Group (off-grid)</h2>' +
      '<div class="callout"><b>Not on this ' + (MC && MC.isCommsAvailable() ? 'profile' : 'browser') + '.</b> ' +
      (MC && MC.isCommsAvailable()
        ? 'This device self-reported a low-resource profile, so the Bluetooth mesh panel is switched off rather than shipped broken.'
        : 'Off-grid group chat needs <b>Web Bluetooth</b> (Chrome/Edge on desktop or Android) plus a Meshtastic LoRa radio. This browser has no Web Bluetooth — no fake buttons.') +
      '</div>');
    return;
  }
  const conn = MC.isConnected();
  const peers = conn ? MC.getPeers() : [];
  const voiceOK = !!(window.EdgeAI && window.EdgeAI.isVoiceAvailable && window.EdgeAI.isVoiceAvailable());
  openSheet(
    '<h2>Group (off-grid)</h2>' +
    '<p class="muted">Text your hiking group with <b>zero cell signal</b>: this page talks over Bluetooth to a <b>Meshtastic LoRa radio</b>, which relays through the mesh for miles.</p>' +
    '<div style="margin:4px 0 2px">' +
      '<span class="tierchip' + (conn ? ' on' : '') + '">' + (conn ? 'connected · ' + esc(Mesh.device || 'radio') : 'not connected') + '</span>' +
      (conn ? '<span class="tierchip' + (Mesh.status === 'ready' ? ' on' : '') + '">' + esc(Mesh.status) + '</span>' : '') +
    '</div>' +
    (conn
      ? (peers.length
          ? '<div>' + peers.map((p) => '<span class="meshpeer">' + esc(p.name) + '</span>').join('') + '</div>'
          : '<p class="tiny">No peers heard yet — they appear as their radios beacon in.</p>') +
        '<div class="meshlog" id="meshLog"></div>' +
        '<div class="row tight" style="margin-top:8px">' +
          '<input id="meshText" placeholder="Message the group…" maxlength="200" autocomplete="off" style="flex:3;min-width:0" aria-label="Mesh message">' +
          '<button class="btn" id="meshSend" style="flex:1">Send</button>' +
        '</div>' +
        '<div class="row tight">' +
          (voiceOK ? '<button class="btn ghost" id="meshVoice">🎙 Speak to group</button>' : '') +
          '<button class="btn ghost" id="meshSpeak" aria-pressed="' + MC.getVoiceMode() + '">' + (MC.getVoiceMode() ? '🔊 Read aloud: on' : '🔇 Read aloud: off') + '</button>' +
          '<button class="btn ghost" id="meshDisc">Disconnect</button>' +
        '</div>'
      : '<div class="row"><button class="btn" id="meshConnect" style="flex:1">Connect radio (Bluetooth)</button></div>') +
    '<div class="callout"><b>Honest note.</b> Chrome-only (Web Bluetooth) and needs a Meshtastic node in range. The protobuf codec inside is a minimal hand-rolled subset — text + positions only, encrypted-only packets skipped — not the official Meshtastic stack.</div>'
  );
  if (!conn) {
    document.getElementById('meshConnect').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'Connecting…';
      const r = await MC.connectMesh(); // must run inside this user gesture
      if (!r.ok) { toast(r.reason); if (State.view === 'group') groupView(); }
      // success path re-renders via the onStatus('connected') subscription
    };
    return;
  }
  renderMeshLog();
  const send = async () => {
    const inp = document.getElementById('meshText');
    const v = inp.value.trim(); if (!v) return;
    const r = await MC.sendText(v);
    if (r.ok) { inp.value = ''; Mesh.log.push({ who: 'you', text: r.sent, me: true, at: Date.now() }); renderMeshLog(); }
    else toast(r.reason);
  };
  document.getElementById('meshSend').onclick = send;
  document.getElementById('meshText').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  const mv = document.getElementById('meshVoice');
  if (mv) mv.onclick = async () => {
    mv.disabled = true; mv.textContent = 'Listening…';
    const r = await MC.sendVoice(); // closeSheet()/navigation cancels the mic via EdgeAI.cancelListen()
    mv.disabled = false; mv.textContent = '🎙 Speak to group';
    if (r.ok) {
      Mesh.log.push({ who: 'you', text: r.transcript, me: true, at: Date.now() });
      renderMeshLog();
      const sp = document.getElementById('meshSpeak'); // sendVoice() switched read-aloud on
      if (sp) { sp.textContent = '🔊 Read aloud: on'; sp.setAttribute('aria-pressed', 'true'); }
    } else toast(r.reason);
  };
  document.getElementById('meshSpeak').onclick = (e) => {
    const on = MC.setVoiceMode(!MC.getVoiceMode());
    e.target.textContent = on ? '🔊 Read aloud: on' : '🔇 Read aloud: off';
    e.target.setAttribute('aria-pressed', String(on));
  };
  document.getElementById('meshDisc').onclick = () => { MC.disconnectMesh(); };
}
function renderMeshLog() {
  const el = document.getElementById('meshLog'); if (!el) return;
  el.innerHTML = Mesh.log.length
    ? Mesh.log.map((m) => '<div class="meshmsg' + (m.me ? ' me' : '') + '"><b>' + esc(m.who) + '</b>' + esc(m.text) + '</div>').join('')
    : '<p class="tiny" style="padding:6px 0">No messages yet.</p>';
  el.scrollTop = el.scrollHeight;
}

/* ---- #/settings ---- */
function settingsView() {
  State.view = 'settings';
  const cur = themePref();
  const p = State.profile;
  openSheet(
    '<h2>Settings</h2>' +
    '<button id="emBtn" type="button" style="width:100%;background:#c62828;color:#fff;border:2px solid #ff5a5a;' +
      'border-radius:14px;padding:16px;font-weight:900;font-size:1.15rem;cursor:pointer;margin:2px 0 16px;text-align:left;' +
      'animation:em-glow 2.4s infinite">🆘 Emergency &amp; SOS' +
      '<div style="font-weight:600;font-size:.78rem;opacity:.92;margin-top:4px">Screen-free 911 · say any number · call-first contact · GPS auto-country</div></button>' +
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
    '<label>Offline / cache</label>' +
    '<div class="callout" id="cacheInfo">Reading cache…</div>' +
    '<div class="row"><button class="btn ghost" id="clearCache">Clear cached tiles</button></div>' +
    '<label>This device (self-detected)</label>' +
    '<div class="callout" id="tierInfo">' +
      (p ? '<span class="tierchip on">' + esc(p.tier) + ' tier</span>' +
           '<span class="tierchip' + (p.features.voice ? ' on' : '') + '">voice ' + (p.features.voice ? 'on' : 'off') + '</span>' +
           '<span class="tierchip' + (p.features.chromeNano ? ' on' : '') + '">built-in AI ' + (p.features.chromeNano ? 'yes' : 'no') + '</span>' +
           '<span class="tierchip' + (p.features.animations ? ' on' : '') + '">motion ' + (p.features.animations ? 'on' : 'reduced') + '</span>' +
           '<div class="tiny" style="margin-top:7px">' + p.reasons.map(esc).join('<br>') + '</div>'
         : 'Profile unavailable — running standard defaults.') +
    '</div>' +
    '<label>Voice assistant</label>' +
    '<div class="callout">' + voiceSettingsCopy(p) + '</div>' +
    '<div class="row"><button class="btn ghost" id="aboutLink">About &amp; honesty →</button></div>'
  );
  document.querySelectorAll('#unitSeg button').forEach((b) => b.onclick = () => { LS.set('unit', b.dataset.u); settingsView(); });
  document.querySelectorAll('#themeSeg button').forEach((b) => b.onclick = () => { LS.set('theme', b.dataset.t); applyTheme(); settingsView(); });
  document.getElementById('aboutLink').onclick = () => { location.hash = '#/about'; };
  const emB = document.getElementById('emBtn');
  if (emB) emB.onclick = () => { try { if (window.EmergencyUI) window.EmergencyUI.open(); } catch (_e) {} };
  const ib = document.getElementById('installBtn');
  ib.onclick = doInstall;
  document.getElementById('installHint').innerHTML = installHintText();
  updateCacheInfo();
  document.getElementById('clearCache').onclick = async () => {
    if ('caches' in window) { for (const k of await caches.keys()) if (k.includes('tiles')) await caches.delete(k); }
    toast('Tile cache cleared'); updateCacheInfo();
  };
}
function voiceSettingsCopy(p) {
  if (!p || p.tier === 'lite') return '<b>Off on this device.</b> The device self-reported a low-resource profile, so the assistant is disabled instead of shipped broken. The offline push-to-talk assistant with the on-device model is the native Android app.';
  if (p.features.voice) return '<b>On — flagship tier.</b> Push-to-talk runs against Chrome’s built-in on-device model (Gemini Nano). Open it with the mic button on the map. The always-offline version with background GPS is the native Android app.';
  return '<b>Typed fallback.</b> No on-device model on this browser, so the assistant accepts typed commands parsed by offline rules — no fake mic. Flagship Chrome gets true push-to-talk; the native Android app gets the full offline voice brain.';
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
    '<p class="muted">A no-signup, offline-first preview of <b>OpenCairn</b> — a free, open-source trail planner. Built for Seattle Tech Week: opens from a QR, works with no signal, installs to the home screen, no account for the interesting parts.</p>' +
    '<h3>What this PWA does well</h3>' +
    '<ul class="linklist">' +
      '<li>Instant QR open — no install / login friction</li>' +
      '<li>' + State.routes.length.toLocaleString() + ' Seattle-area trails, all offline in the seed</li>' +
      '<li>Honest live GPS + a real accuracy circle</li>' +
      '<li>Self-hosted map engine, fonts &amp; cached tiles — a trail panned once works on the trail</li>' +
      '<li>Fully serverless hike planning (QR / link / .ics / peer RSVP)</li>' +
      '<li>Breadcrumb home — records your walked path and points you back along it; pure GPS, zero signal, every device</li>' +
      '<li>“Describe a hike” discovery — natural-language trail matching via offline rules (AI-refined on flagship Chrome)</li>' +
      '<li>Trail pulse — freshness-decayed condition reports, stored on this device</li>' +
      '<li>Off-grid group chat via a Meshtastic LoRa radio (Chrome + Web Bluetooth only — hidden elsewhere)</li>' +
      '<li>Self-tiering: the app probes this device and enables exactly what it can carry' + (p ? ' (this one: <b>' + esc(p.tier) + '</b>)' : '') + '</li>' +
    '</ul>' +
    '<h3>Voice, tier by tier — honestly</h3>' +
    '<div class="callout"><b>Flagship browsers</b> (Chrome with built-in AI + real headroom): push-to-talk runs Gemini Nano <b>on-device</b> — utterances never reach an OpenCairn server. <b>Other browsers</b>: typed commands via offline rules, no fake mic. <b>Low-resource devices</b>: hidden entirely. The always-offline voice brain with background GPS is the <b>native Android app</b>.</div>' +
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
function startOf(h) { const r = State.byId.get(h.id) || State.routes.find((x) => x.name === h.t); return r ? r.start : [-122, 47.5]; }

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
    case 'voice': voiceView(); break;
    case 'home': homeView(); break;
    case 'discover': discoverView(); break;
    case 'group': groupView(); break;
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
    if (forced) meta.setAttribute('content', dark ? '#0d1316' : '#0e83a3');
    else meta.setAttribute('content', meta.media && meta.media.includes('dark') ? '#0d1316' : '#0e83a3');
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
      features: { fullGeometry: true, vectorTiles: true, voice: false, webgpuAI: false, chromeNano: false, animations: !reducedMotion() },
      reasons: ['webProfile.js unavailable — standard defaults'], probes: {} };
  }
  setupVoiceFab();

  // Data-Saver / lite guard: the Nano path can trigger a ~GB model download,
  // so edgeAI is told the profile's verdict before any interpret() runs.
  try {
    if (window.EdgeAI && typeof window.EdgeAI.setNanoEnabled === 'function') {
      window.EdgeAI.setNanoEnabled(!!(State.profile.features && State.profile.features.chromeNano));
    }
  } catch {}

  // MoM grounding: teach edgeAI the real trail names (+ live GPS for proximity
  // tie-breaks) so EVERY interpreter tier resolves a spoken/typed trail name to
  // a real canonical trail instead of a hallucinated one. Lazy + cached; a no-op
  // until the routes are loaded (they are, by here). userPos is [lon,lat];
  // retrieval wants [lat,lon].
  try {
    if (window.EdgeAI && typeof window.EdgeAI.configureGrounding === 'function') {
      window.EdgeAI.configureGrounding({
        getNames: () => State.routes.map((r) => ({
          name: r.name, region: r.region,
          lat: r.start ? r.start[1] : null,
          lon: r.start ? r.start[0] : null,
        })),
        getGps: () => (State.userPos ? [State.userPos[1], State.userPos[0]] : null),
      });
    }
  } catch {}

  // Feedseed on-device (WebGPU) tier: only enable on flagship + a real WebGPU
  // adapter, and mirror the Data-Saver veto. Nothing downloads here — the user
  // opts in from the voice sheet; this just arms the backend.
  try {
    if (window.FeedseedBackend && typeof window.FeedseedBackend.setEnabled === 'function') {
      window.FeedseedBackend.setEnabled(!!(State.profile.features && State.profile.features.webgpuAI));
    }
  } catch {}

  // Off-grid group panel: Web Bluetooth + non-lite tier only (hidden elsewhere).
  setupGroupBtn();
  setupMesh();

  // The map engine is self-hosted, but if it still failed to parse/load,
  // say so visibly instead of throwing into the void.
  if (typeof maplibregl === 'undefined') {
    fatal('Map engine failed to load — refresh to retry');
    return;
  }
  initMap();
}

boot();
