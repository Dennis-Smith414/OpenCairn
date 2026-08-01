/* OpenCairn PWA — breadcrumb.js
 * "Breadcrumb home" safety module. TOP PRIORITY: works with a dead map and no
 * signal — pure GPS math, zero network, zero tiles.
 *
 *   startBreadcrumb()  — record the walked path via watchPosition (high accuracy)
 *                        into localStorage, distance-throttled (~10 m), so the
 *                        trail survives an app kill / tab reload.
 *   stopBreadcrumb()   — stop recording (trail is kept; clearBreadcrumb() wipes).
 *   guideHome()        — from the CURRENT fix, bearing + distance to retrace the
 *                        trail back to its start: great-circle initial bearing to
 *                        the next un-retraced point, collapsing points already
 *                        passed (monotonic cursor — it only ever moves homeward).
 *   breadcrumbState()  — small read-only state accessor.
 *
 * Reverse-nav approach:
 *   The trail is p[0..n-1] as walked out; home = p[0]. A persisted cursor marks
 *   the highest index not yet retraced. Each guideHome():
 *     1. find the trail point nearest the current fix among [0..cursor];
 *        within the search ring (nearest + 25 m) prefer the LOWEST index — if
 *        you cut a switchback and stand near both legs, aim at the homeward one.
 *     2. if we're ON that point (dist ≤ max(15 m, 1.5×accuracy)) it counts as
 *        retraced → cursor collapses below it and the target becomes the next
 *        point toward home; otherwise the target is that nearest point itself
 *        (rejoin the trail where it's closest AND most homeward).
 *     3. bearing = initial great-circle bearing (atan2 form) current → target;
 *        distance = haversine; totalRemaining = that leg + the summed trail
 *        segment lengths from the target down to p[0].
 *   The cursor never increases, so GPS jitter can't bounce guidance backward.
 *
 * Jitter handling while recording: fixes worse than 60 m accuracy are ignored,
 * positions are EMA-smoothed (unless the jump is big enough to be real motion),
 * and a point is only appended once you're ≥ ~10 m (and ≥ half the fix's own
 * accuracy) from the last stored point.
 *
 * No dependencies. Coexists with app.js (IIFE — does not touch its globals);
 * uses app.js's LS helper when present, else its own guarded fallback.
 */
'use strict';

(function (root) {

  /* ----------------------------- constants ----------------------------- */
  const KEY = 'breadcrumb';        // localStorage key for the whole trail blob
  const MIN_STEP_M = 10;           // distance throttle between stored points
  const ACC_REJECT_M = 60;         // ignore fixes with worse accuracy than this
  const ARRIVE_BASE_M = 15;        // "you're on this point" radius (min)
  const HOMEWARD_SLACK_M = 25;     // ring around the nearest point where a lower index wins
  const HOME_DONE_M = 20;          // within this of p[0] → arrived
  const SMOOTH_ALPHA = 0.4;        // EMA weight for the new fix
  const MAX_POINTS = 4000;         // hard cap (~40 km at 10 m spacing) → thin, never wipe
  const WATCH_OPTS = { enableHighAccuracy: true, timeout: 20000, maximumAge: 2000 };

  /* ----------------------------- storage (LS-compatible, guarded) ----------------------------- */
  // app.js defines a global LS {get,set}; use it if it's there, else fall back.
  const store = (root && root.LS && typeof root.LS.get === 'function') ? root.LS : {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  function loadTrail() {
    const t = store.get(KEY, null);
    if (!t || !Array.isArray(t.points)) return { points: [], startedAt: null, cursor: -1 };
    if (typeof t.cursor !== 'number') t.cursor = t.points.length - 1;
    return t;
  }
  function saveTrail() {
    store.set(KEY, { points: Trail.points, startedAt: Trail.startedAt, cursor: Trail.cursor });
  }

  /* ----------------------------- module state ----------------------------- */
  const Trail = loadTrail();       // { points:[{lat,lon,acc,t}], startedAt, cursor } — survives kills
  const Live = {
    watchId: null,                 // navigator.geolocation watch handle
    recording: false,
    lastFix: null,                 // freshest RAW fix {lat,lon,acc,heading,t}
    smoothed: null,                // EMA-smoothed {lat,lon}
    error: null,                   // last geolocation error string ('permission-denied' | 'unavailable' | 'timeout')
    permissionDenied: false,
  };

  /* ----------------------------- geo math (haversine + initial bearing) ----------------------------- */
  const R = 6371000, toR = Math.PI / 180, toD = 180 / Math.PI;

  // great-circle distance in metres between {lat,lon} points
  function distM(a, b) {
    const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    const la1 = a.lat * toR, la2 = b.lat * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  // initial great-circle bearing a → b, degrees clockwise from true north [0,360)
  function initialBearingDeg(a, b) {
    const la1 = a.lat * toR, la2 = b.lat * toR, dLon = (b.lon - a.lon) * toR;
    const y = Math.sin(dLon) * Math.cos(la2);
    const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
    return (Math.atan2(y, x) * toD + 360) % 360;
  }
  const norm180 = (d) => { d = ((d % 360) + 360) % 360; return d > 180 ? d - 360 : d; };

  /* ----------------------------- recording ----------------------------- */
  function onFix(pos) {
    const c = pos && pos.coords;
    if (!c || !isFinite(c.latitude) || !isFinite(c.longitude)) return;
    const acc = isFinite(c.accuracy) ? c.accuracy : 9999;
    Live.error = null;
    Live.lastFix = { lat: c.latitude, lon: c.longitude, acc,
      heading: (isFinite(c.heading) && c.speed > 0.5) ? c.heading : null, t: Date.now() };
    if (acc > ACC_REJECT_M) return; // too coarse — never let a wild fix into the trail

    // smooth: EMA toward the new fix, but a jump > 3×accuracy is real movement
    const raw = { lat: c.latitude, lon: c.longitude };
    if (!Live.smoothed || distM(Live.smoothed, raw) > 3 * acc) Live.smoothed = raw;
    else Live.smoothed = {
      lat: Live.smoothed.lat + SMOOTH_ALPHA * (raw.lat - Live.smoothed.lat),
      lon: Live.smoothed.lon + SMOOTH_ALPHA * (raw.lon - Live.smoothed.lon),
    };
    if (!Live.recording) return;

    const pt = { lat: Live.smoothed.lat, lon: Live.smoothed.lon, acc: Math.round(acc), t: Date.now() };
    const last = Trail.points[Trail.points.length - 1];
    // distance throttle: ≥ 10 m and ≥ half the fix's own accuracy (jitter guard)
    if (last && distM(last, pt) < Math.max(MIN_STEP_M, acc * 0.5)) return;
    Trail.points.push(pt);
    Trail.cursor = Trail.points.length - 1; // recording resets retrace progress to the new end
    if (Trail.points.length > MAX_POINTS) thinTrail();
    saveTrail(); // write-through: an app kill loses at most the last un-stepped fix
  }

  function onFixError(err) {
    const code = err && err.code;
    if (code === 1) { Live.permissionDenied = true; Live.error = 'permission-denied'; stopBreadcrumb(); }
    else if (code === 3) Live.error = 'timeout';           // watch keeps running
    else Live.error = 'unavailable';
  }

  // over the cap: drop every 2nd point of the older half (start point is sacred)
  function thinTrail() {
    const half = Math.floor(Trail.points.length / 2);
    const kept = [Trail.points[0]];
    for (let i = 1; i < half; i += 2) kept.push(Trail.points[i]);
    for (let i = half; i < Trail.points.length; i++) kept.push(Trail.points[i]);
    Trail.points = kept;
    Trail.cursor = Trail.points.length - 1;
  }

  /* startBreadcrumb() — begin (or resume after a kill) recording the walked path.
   * Returns { ok, reason? } synchronously; fixes stream in via the watch. */
  function startBreadcrumb() {
    if (!('geolocation' in navigator)) return { ok: false, reason: 'no-geolocation' };
    if (Live.recording) return { ok: true, reason: 'already-recording' };
    if (!Trail.startedAt) Trail.startedAt = Date.now(); // fresh trail; else resume + append
    Live.recording = true;
    Live.permissionDenied = false;
    Live.error = null;
    try {
      Live.watchId = navigator.geolocation.watchPosition(onFix, onFixError, WATCH_OPTS);
    } catch {
      Live.recording = false;
      return { ok: false, reason: 'watch-failed' };
    }
    saveTrail();
    return { ok: true };
  }

  /* stopBreadcrumb() — stop recording. The stored trail is KEPT (it's the way home). */
  function stopBreadcrumb() {
    if (Live.watchId != null) { try { navigator.geolocation.clearWatch(Live.watchId); } catch {} }
    Live.watchId = null;
    Live.recording = false;
    saveTrail();
  }

  /* clearBreadcrumb() — explicitly wipe the trail (e.g. safely home). */
  function clearBreadcrumb() {
    stopBreadcrumb();
    Trail.points = []; Trail.startedAt = null; Trail.cursor = -1;
    Live.smoothed = null;
    saveTrail();
  }

  /* ----------------------------- guide home ----------------------------- */
  // Best current position: our own smoothed/last fix, else app.js's State.userPos.
  function currentPos() {
    if (Live.smoothed && Live.lastFix) return { lat: Live.smoothed.lat, lon: Live.smoothed.lon, acc: Live.lastFix.acc };
    if (Live.lastFix) return { lat: Live.lastFix.lat, lon: Live.lastFix.lon, acc: Live.lastFix.acc };
    try {
      const S = root && root.State;
      if (S && S.userPos) return { lat: S.userPos[1], lon: S.userPos[0], acc: S.userAcc || 30 };
    } catch {}
    return null;
  }
  // remaining trail length from point index i down to p[0]
  function remainingFrom(i) {
    let d = 0;
    for (let k = i; k > 0; k--) d += distM(Trail.points[k], Trail.points[k - 1]);
    return d;
  }

  /* guideHome(deviceHeadingDeg?) — pure GPS math, no map, no network.
   * Returns:
   *   { ok:true, arrived?:true,
   *     bearingDeg, distanceM, totalRemainingM,
   *     headingRelative,          // signed −180..180 ("turn right 40°"), or null
   *     nextPoint,                // {lat,lon,acc,t} target breadcrumb
   *     nextIndex, pointsLeft }
   *   { ok:false, reason: 'no-trail' | 'no-fix' | 'permission-denied' }
   * Optional deviceHeadingDeg: compass heading from deviceorientation; falls
   * back to the GPS course (coords.heading) when moving. */
  function guideHome(deviceHeadingDeg) {
    if (!Trail.points.length) return { ok: false, reason: 'no-trail' };
    if (Live.permissionDenied) return { ok: false, reason: 'permission-denied' };
    const me = currentPos();
    if (!me) return { ok: false, reason: 'no-fix' };
    if (Trail.cursor < 0) Trail.cursor = Trail.points.length - 1;

    const arriveR = Math.max(ARRIVE_BASE_M, (me.acc || 0) * 1.5);

    // 1) nearest un-retraced point; within +25 m of that, lowest index wins
    //    (collapses the switchback case toward home)
    let best = Infinity, bestI = Trail.cursor;
    for (let i = Trail.cursor; i >= 0; i--) {
      const d = distM(me, Trail.points[i]);
      if (d < best) { best = d; bestI = i; }
    }
    for (let i = bestI - 1; i >= 0; i--) {
      if (distM(me, Trail.points[i]) <= best + HOMEWARD_SLACK_M) bestI = i;
    }

    // 2) collapse points we're standing on; target the next homeward one
    let target = bestI;
    if (distM(me, Trail.points[bestI]) <= arriveR) {
      Trail.cursor = Math.max(0, bestI - 1);
      target = Trail.cursor;
    } else if (bestI < Trail.cursor) {
      Trail.cursor = bestI; // monotonic: never guide backward on jitter
    }
    saveTrail(); // cursor progress survives a kill too

    // 3) arrived?
    const home = Trail.points[0];
    if (target === 0 && distM(me, home) <= Math.max(HOME_DONE_M, arriveR)) {
      return { ok: true, arrived: true, bearingDeg: 0, distanceM: 0, totalRemainingM: 0,
        headingRelative: null, nextPoint: home, nextIndex: 0, pointsLeft: 0 };
    }

    const next = Trail.points[target];
    const bearing = initialBearingDeg(me, next);
    const leg = distM(me, next);
    let heading = (typeof deviceHeadingDeg === 'number' && isFinite(deviceHeadingDeg)) ? deviceHeadingDeg : null;
    if (heading == null && Live.lastFix && Live.lastFix.heading != null) heading = Live.lastFix.heading;

    return {
      ok: true,
      bearingDeg: Math.round(bearing * 10) / 10,        // absolute, ° true
      distanceM: Math.round(leg),                        // to the next breadcrumb
      totalRemainingM: Math.round(leg + remainingFrom(target)),
      headingRelative: heading == null ? null : Math.round(norm180(bearing - heading)),
      nextPoint: next,
      nextIndex: target,
      pointsLeft: target + 1,
    };
  }

  /* ----------------------------- state accessor ----------------------------- */
  function breadcrumbState() {
    return {
      recording: Live.recording,
      pointCount: Trail.points.length,
      startedAt: Trail.startedAt,
      trailLengthM: Trail.points.length > 1 ? Math.round(remainingFrom(Trail.points.length - 1)) : 0,
      cursor: Trail.cursor,
      lastFix: Live.lastFix ? Object.assign({}, Live.lastFix) : null,
      error: Live.error,
      permissionDenied: Live.permissionDenied,
    };
  }

  /* ----------------------------- exports ----------------------------- */
  const api = { startBreadcrumb, stopBreadcrumb, clearBreadcrumb, guideHome, breadcrumbState,
    _math: { distM, initialBearingDeg } };
  if (root) {
    root.Breadcrumb = api;
    // convenience globals in app.js style
    root.startBreadcrumb = startBreadcrumb;
    root.stopBreadcrumb = stopBreadcrumb;
    root.guideHome = guideHome;
    root.breadcrumbState = breadcrumbState;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // tests

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
