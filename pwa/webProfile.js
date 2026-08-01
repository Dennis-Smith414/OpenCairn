/* OpenCairn PWA — webProfile.js
 * Browser capability self-tiering: the web mirror of the native device profile.
 *
 * Probes (ALL guarded — safe on every browser incl. iOS Safari / old Firefox):
 *   navigator.deviceMemory        (Chrome-only, GB, capped at 8)
 *   navigator.hardwareConcurrency (logical cores)
 *   navigator.connection          (effectiveType + saveData — Chrome/Android)
 *   navigator.gpu                 (WebGPU: presence AND a real adapter probe)
 *   Chrome built-in AI            (new `LanguageModel` global OR legacy `window.ai`)
 *   screen size / devicePixelRatio
 *   prefers-reduced-data / prefers-reduced-motion
 *
 * Returns:
 *   {
 *     tier: 'lite' | 'standard' | 'flagship',
 *     features: { fullGeometry, vectorTiles, voice, webgpuAI, chromeNano, animations },
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

  var TIER = { LITE: 'lite', STANDARD: 'standard', FLAGSHIP: 'flagship' };

  /* ------------------------------------------------------------------ *
   *  Guarded probes — every one returns a plain value, never throws.
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

  /* Never let an async probe hang the boot path. */
  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(fallback); } }, ms);
      Promise.resolve(promise).then(
        function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
        function ()  { if (!done) { done = true; clearTimeout(t); resolve(fallback); } }
      );
    });
  }

  /* WebGPU: `navigator.gpu` existing is NOT enough (adapter can still be null,
   * e.g. blocklisted GPU / software renderer). Probe for a real adapter. */
  function probeWebGPU() {
    try {
      if (!('gpu' in navigator) || !navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') {
        return Promise.resolve({ present: false, adapter: false });
      }
      // 200 ms budget: boot awaits this profile before map init, and a slow /
      // software-rasterizer requestAdapter() was observed blocking first paint
      // ~2 s. A healthy adapter answers in a few ms; past 200 ms we treat
      // WebGPU as absent (worst case: a flagship briefly self-reports standard).
      return withTimeout(
        navigator.gpu.requestAdapter().then(function (adapter) {
          return { present: true, adapter: !!adapter };
        }),
        200, { present: true, adapter: false }
      );
    } catch (e) { return Promise.resolve({ present: false, adapter: false }); }
  }

  /* Chrome built-in AI (Gemini Nano). Two API generations, both feature-detected,
   * neither assumed to exist:
   *   new:    globalThis.LanguageModel.availability() -> 'available'|'downloadable'|'downloading'|'unavailable'
   *   legacy: window.ai.languageModel.capabilities()  -> { available: 'readily'|'after-download'|'no' }
   * "available now" and "available after a download" are reported separately. */
  function probeChromeNano() {
    var none = { supported: false, availability: 'unavailable', ready: false, downloadable: false };
    try {
      var LM = (typeof LanguageModel !== 'undefined') ? LanguageModel : null;
      if (LM && typeof LM.availability === 'function') {
        return withTimeout(
          Promise.resolve(LM.availability()).then(function (a) {
            var s = String(a || 'unavailable');
            return {
              supported: true, availability: s,
              ready: s === 'available',
              downloadable: s === 'downloadable' || s === 'downloading',
            };
          }),
          2000, { supported: true, availability: 'timeout', ready: false, downloadable: false }
        );
      }
      var ai = (typeof window !== 'undefined' && window.ai) ? window.ai : null;
      var lm = ai && (ai.languageModel || ai.assistant);
      if (lm && typeof lm.capabilities === 'function') {
        return withTimeout(
          Promise.resolve(lm.capabilities()).then(function (caps) {
            var s = caps && caps.available ? String(caps.available) : 'no';
            return {
              supported: true, availability: s,
              ready: s === 'readily',
              downloadable: s === 'after-download',
            };
          }),
          2000, { supported: true, availability: 'timeout', ready: false, downloadable: false }
        );
      }
      return Promise.resolve(none);
    } catch (e) { return Promise.resolve(none); }
  }

  /* ------------------------------------------------------------------ *
   *  Tier logic
   * ------------------------------------------------------------------ *
   *  LITE      — the user or the hardware asked for less: Data Saver /
   *              prefers-reduced-data / <=2 GB reported RAM / <=2 cores /
   *              2g-class network / tiny low-DPI screen.
   *              -> simplified geometry, fewer trails per view, raster only,
   *                 no in-browser AI, minimal animation.
   *  STANDARD  — the default. Full geometry + vector-quality rendering,
   *              but no in-browser AI (either no accelerator, or unknown
   *              memory headroom we won't gamble on).
   *  FLAGSHIP  — a real accelerator exists (working WebGPU adapter, or
   *              Chrome's built-in LanguageModel is available/downloadable)
   *              AND memory is ample (>=8 GB reported, or unreported-but-
   *              desktop-class cores). -> in-browser voice AI + full fidelity.
   *
   *  Precedence: LITE signals veto everything (a saveData user never gets
   *  an LLM download); FLAGSHIP requires positive evidence; absence of
   *  evidence lands on STANDARD, never up.
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
      reasons.push('LITE: ' + liteWhy.join('; ') + ' — simplified geometry, fewer trails, no in-browser AI, minimal animation.');
      return TIER.LITE;
    }

    var hasAccel = p.webgpu.adapter || p.nano.ready || p.nano.downloadable;
    var ampleMem = (p.memoryGB !== null && p.memoryGB >= 8) ||                 // deviceMemory caps at 8 = "8 or more"
                   (p.memoryGB === null && p.cores !== null && p.cores >= 8);  // no memory API (Safari/FF): desktop-class cores as proxy

    if (hasAccel && ampleMem) {
      var why = [];
      if (p.webgpu.adapter) why.push('working WebGPU adapter');
      if (p.nano.ready) why.push('Chrome built-in LanguageModel ready');
      else if (p.nano.downloadable) why.push('Chrome built-in LanguageModel available after download');
      why.push(p.memoryGB !== null ? p.memoryGB + '+ GB memory' : p.cores + ' cores (memory unreported)');
      reasons.push('FLAGSHIP: ' + why.join(', ') + ' — in-browser voice AI + full fidelity.');
      return TIER.FLAGSHIP;
    }

    if (hasAccel) reasons.push('STANDARD: accelerator present but memory headroom not proven (' +
      (p.memoryGB !== null ? p.memoryGB + ' GB reported' : 'memory unreported, ' + (p.cores || '?') + ' cores') +
      ') — full geometry, no in-browser AI.');
    else reasons.push('STANDARD: no WebGPU adapter and no Chrome built-in AI — full geometry, no in-browser AI.');
    return TIER.STANDARD;
  }

  /* ------------------------------------------------------------------ *
   *  Public API
   * ------------------------------------------------------------------ */
  var _cached = null;

  function buildWebProfile(opts) {
    if (_cached && !(opts && opts.fresh)) return _cached;
    _cached = Promise.all([probeWebGPU(), probeChromeNano()]).then(function (async_) {
      var p = {
        memoryGB: probeMemory(),
        cores: probeCores(),
        connection: probeConnection(),
        screen: probeScreen(),
        reducedData: probeMedia('(prefers-reduced-data: reduce)'),
        reducedMotion: probeMedia('(prefers-reduced-motion: reduce)'),
        webgpu: async_[0],
        nano: async_[1],
      };

      var reasons = [];
      var tier = decideTier(p, reasons);

      if (p.reducedMotion) reasons.push('Animations off: prefers-reduced-motion is set.');
      if (p.nano.supported && !p.nano.ready && !p.nano.downloadable)
        reasons.push('Chrome built-in AI API present but model unavailable on this device.');
      if (p.webgpu.present && !p.webgpu.adapter)
        reasons.push('navigator.gpu exists but no adapter was granted — WebGPU treated as absent.');

      var flagship = tier === TIER.FLAGSHIP, lite = tier === TIER.LITE;
      var profile = {
        tier: tier,
        features: {
          fullGeometry: !lite,                            // lite: simplified lines, cap visible trails
          vectorTiles:  !lite,                            // lite: raster-only basemap
          voice:        flagship,                         // in-browser push-to-talk (WebGPU or Nano backed)
          webgpuAI:     flagship && p.webgpu.adapter,     // run the model on WebGPU
          chromeNano:   p.nano.ready || (flagship && p.nano.downloadable), // use built-in Gemini Nano
          animations:   !lite && !p.reducedMotion,        // eased camera moves, sheet transitions
        },
        reasons: reasons,
        probes: p,                                        // raw values for the settings/about sheet
      };
      _cached = Promise.resolve(profile);                 // collapse to a settled cache
      return profile;
    });
    return _cached;
  }

  return { buildWebProfile: buildWebProfile, TIER: TIER };
});
