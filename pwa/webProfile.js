/* OpenCairn PWA — webProfile.js
 * Browser capability self-tiering: the web mirror of the native device profile.
 *
 * Probes (ALL guarded — safe on every browser incl. iOS Safari / old Firefox):
 *   navigator.deviceMemory        (Chrome-only, GB, capped at 8)
 *   navigator.hardwareConcurrency (logical cores)
 *   navigator.connection          (effectiveType + saveData — Chrome/Android)
 *   screen size / devicePixelRatio
 *   prefers-reduced-data / prefers-reduced-motion
 *
 * Returns:
 *   {
 *     tier: 'lite' | 'standard',
 *     features: { fullGeometry, vectorTiles, animations },
 *     reasons: string[],           // human-readable audit trail of every decision
 *     probes: {...}                // raw probe values, for the settings/about sheet
 *   }
 *
 * Usage from app.js (classic script, load this BEFORE app.js):
 *   <script src="./webProfile.js" defer></script>
 *   <script src="./app.js" defer></script>
 *   ...
 *   const profile = await window.buildWebProfile();
 *   if (!profile.features.fullGeometry) { ...simplify... }
 *
 * Also exports via CommonJS/AMD/ESM-interop if the app ever migrates to modules.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;           // CommonJS / bundlers
  else if (typeof define === 'function' && define.amd) define([], function () { return api; }); // AMD
  if (root) {                                                                        // classic <script> (this app)
    root.buildWebProfile = api.buildWebProfile;
    root.OpenCairnWebProfile = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var TIER = { LITE: 'lite', STANDARD: 'standard' };

  /* ------------------------------------------------------------------ *
   *  Guarded probes — every one returns a plain value, never throws.
   *  All synchronous: no accelerator probing here, so there's nothing
   *  that can block first paint waiting on an async adapter handshake.
   * ------------------------------------------------------------------ */

  function probeMemory() {
    try {
      var m = navigator.deviceMemory;                 // GB; undefined off-Chrome
      return (typeof m === 'number' && m > 0) ? m : null;
    } catch (e) { return null; }
  }

  function probeCores() {
    try {
      var c = navigator.hardwareConcurrency;
      return (typeof c === 'number' && c > 0) ? c : null;
    } catch (e) { return null; }
  }

  function probeConnection() {
    try {
      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!conn) return { effectiveType: null, saveData: false };
      return {
        effectiveType: typeof conn.effectiveType === 'string' ? conn.effectiveType : null, // 'slow-2g'|'2g'|'3g'|'4g'
        saveData: conn.saveData === true,
      };
    } catch (e) { return { effectiveType: null, saveData: false }; }
  }

  function probeScreen() {
    try {
      var w = (screen && screen.width) || 0, h = (screen && screen.height) || 0;
      return {
        width: w, height: h,
        dpr: (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1,
        shortSide: Math.min(w, h) || null,
      };
    } catch (e) { return { width: 0, height: 0, dpr: 1, shortSide: null }; }
  }

  function probeMedia(query) {
    try { return typeof matchMedia === 'function' && matchMedia(query).matches; }
    catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ *
   *  Tier logic
   * ------------------------------------------------------------------ *
   *  LITE      — the user or the hardware asked for less: Data Saver /
   *              prefers-reduced-data / <=2 GB reported RAM / <=2 cores /
   *              2g-class network / tiny low-DPI screen.
   *              -> simplified geometry, fewer trails per view, raster only,
   *                 minimal animation.
   *  STANDARD  — everything else. Full geometry + vector-quality rendering.
   * ------------------------------------------------------------------ */
  function decideTier(p, reasons) {
    var liteWhy = [];
    if (p.connection.saveData)                liteWhy.push('Data Saver is on');
    if (p.reducedData)                        liteWhy.push('prefers-reduced-data is set');
    if (p.memoryGB !== null && p.memoryGB <= 2) liteWhy.push('low device memory (' + p.memoryGB + ' GB reported)');
    if (p.cores !== null && p.cores <= 2)     liteWhy.push('few CPU cores (' + p.cores + ')');
    if (p.connection.effectiveType === 'slow-2g' || p.connection.effectiveType === '2g')
                                              liteWhy.push('2g-class network (' + p.connection.effectiveType + ')');
    if (p.screen.shortSide !== null && p.screen.shortSide < 360 && p.screen.dpr <= 1.5)
                                              liteWhy.push('small low-density screen (' + p.screen.width + 'x' + p.screen.height + ')');

    if (liteWhy.length) {
      reasons.push('LITE: ' + liteWhy.join('; ') + ' — simplified geometry, fewer trails, minimal animation.');
      return TIER.LITE;
    }

    reasons.push('STANDARD: full geometry, vector-quality rendering.');
    return TIER.STANDARD;
  }

  /* ------------------------------------------------------------------ *
   *  Public API
   * ------------------------------------------------------------------ */
  var _cached = null;

  function buildWebProfile(opts) {
    if (_cached && !(opts && opts.fresh)) return _cached;

    var p = {
      memoryGB: probeMemory(),
      cores: probeCores(),
      connection: probeConnection(),
      screen: probeScreen(),
      reducedData: probeMedia('(prefers-reduced-data: reduce)'),
      reducedMotion: probeMedia('(prefers-reduced-motion: reduce)'),
    };

    var reasons = [];
    var tier = decideTier(p, reasons);

    if (p.reducedMotion) reasons.push('Animations off: prefers-reduced-motion is set.');

    var lite = tier === TIER.LITE;
    var profile = {
      tier: tier,
      features: {
        fullGeometry: !lite,                            // lite: simplified lines, cap visible trails
        vectorTiles:  !lite,                            // lite: raster-only basemap
        animations:   !lite && !p.reducedMotion,        // eased camera moves, sheet transitions
      },
      reasons: reasons,
      probes: p,                                        // raw values for the settings/about sheet
    };
    _cached = Promise.resolve(profile);                 // still a promise: callers `await` this
    return _cached;
  }

  return { buildWebProfile: buildWebProfile, TIER: TIER };
});
