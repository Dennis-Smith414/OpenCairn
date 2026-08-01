/* OpenCairn — CROSS-PLATFORM INSTALL module  (Path C, concern #2)
 * ==================================================================
 * Makes the (received / reconstructed) PWA installable on BOTH:
 *   - Android / Chromium : captures `beforeinstallprompt`, offers a
 *     real one-tap install button, drives prompt() + userChoice.
 *   - iOS Safari         : NEVER fires beforeinstallprompt. We detect
 *     iOS Safari and surface the manual "Share -> Add to Home Screen"
 *     guidance instead. (WKWebView / in-app browsers cannot A2HS at
 *     all — we detect and say so.)
 *
 * It ALSO exposes a diagnostics probe (`diagnose()`) that reports the
 * hard installability truth per-OS + the secure-context verdict, so a
 * page reconstructed from a peer can tell the user honestly whether it
 * will ever be installable/runnable on THIS device, or what blocks it.
 *
 * Zero dependencies. Works as an ES module (`import`) OR a classic
 * <script> (attaches `window.OCInstall`). No build step.
 *
 * EVIDENCE GRADE of the runtime claims encoded here: RESEARCHED +
 * independently confirmed against p2p/receiver.js (sibling Path B).
 * The DOM/UX wiring is PROTOTYPED (written + statically verified);
 * it has not been MEASURED on physical Android/iOS hardware from this
 * environment (headless Linux, no mobile browser).
 * ================================================================== */

'use strict';

/* ---- platform / context detection (all best-effort, never throw) ---- */

function ua() { try { return navigator.userAgent || ''; } catch (_e) { return ''; } }

/** iOS/iPadOS, including iPadOS-13+ desktop-UA masquerade. */
export function isIOS() {
  const u = ua();
  if (/iphone|ipad|ipod/i.test(u)) return true;
  // iPadOS 13+ reports as "MacIntel" but has a touch screen.
  try {
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  } catch (_e) { return false; }
}

/** True only for REAL Safari on iOS (the sole engine that can A2HS).
 *  Chrome/Firefox/Edge on iOS are WebKit skins that CAN also A2HS via
 *  their own share menu, but in-app webviews (Instagram/FB/Gmail) canNOT.
 */
export function isIOSSafari() {
  if (!isIOS()) return false;
  const u = ua();
  // CriOS=Chrome-iOS, FxiOS=Firefox-iOS, EdgiOS=Edge-iOS still A2HS-capable.
  // A generic WKWebView (no "Safari" token, no known-browser token) cannot.
  const knownBrowser = /safari|crios|fxios|edgios/i.test(u);
  return knownBrowser;
}

/** Standalone = already installed / launched from home screen. */
export function isStandalone() {
  try {
    if (window.matchMedia && matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia && matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia && matchMedia('(display-mode: minimal-ui)').matches) return true;
    return navigator.standalone === true; // iOS-specific flag
  } catch (_e) { return false; }
}

/** Secure context = https OR localhost/127.0.0.1/[::1]. The load-bearing
 *  wall: SW + WebGPU + persistent Cache Storage require this to be true.
 *  A LAN/USB http://<ip> origin returns FALSE here. */
export function isSecure() {
  try { return !!self.isSecureContext; } catch (_e) { return false; }
}

/* ---- deferred prompt capture (must run at module load, synchronously,
 *      because beforeinstallprompt fires early and once) ---- */

let _deferred = null;             // the captured BeforeInstallPromptEvent
let _installed = false;           // set by appinstalled
const _listeners = new Set();     // subscribers to state changes

function _emit() {
  const s = getState();
  for (const fn of _listeners) { try { fn(s); } catch (_e) {} }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Chromium: stop the mini-infobar so WE control when to prompt.
    e.preventDefault();
    _deferred = e;
    _emit();
  });
  window.addEventListener('appinstalled', () => {
    _installed = true;
    _deferred = null;
    _emit();
  });
}

/** Subscribe to install-state changes. Returns an unsubscribe fn. */
export function onChange(fn) {
  _listeners.add(fn);
  try { fn(getState()); } catch (_e) {}
  return () => _listeners.delete(fn);
}

/* ---- install strategy resolution ---- */

/**
 * Which install path applies on THIS device right now.
 *   'installed'   — already running standalone; nothing to do.
 *   'prompt'      — Chromium beforeinstallprompt captured; one-tap available.
 *   'ios-manual'  — iOS Safari-family; must use Share -> Add to Home Screen.
 *   'ios-webview' — iOS in-app browser; cannot install at all here.
 *   'insecure'    — origin is http://<ip>: NOTHING is installable here.
 *   'menu-manual' — Chromium desktop/Android that hasn't fired the event
 *                   yet (criteria not met, or already dismissed): fall back
 *                   to the browser menu -> Install app.
 */
export function strategy() {
  if (isStandalone() || _installed) return 'installed';
  if (!isSecure()) return 'insecure';
  if (_deferred) return 'prompt';
  if (isIOS()) return isIOSSafari() ? 'ios-manual' : 'ios-webview';
  return 'menu-manual';
}

/** Human guidance string for the current strategy (safe HTML). */
export function guidanceHTML() {
  switch (strategy()) {
    case 'installed':
      return 'Already installed — running as an app ✓';
    case 'insecure':
      return 'This page is served over an <b>insecure</b> origin (http/LAN/USB IP). ' +
             'It <b>cannot</b> be installed or run offline here. It must be opened from ' +
             'the app’s secure origin (https / localhost) at least once.';
    case 'prompt':
      return 'Tap <b>Install app</b> to add OpenCairn to your home screen.';
    case 'ios-manual':
      return 'iPhone / iPad: tap the <b>Share</b> icon (↑), scroll down, ' +
             'then tap <b>Add to Home Screen</b>.';
    case 'ios-webview':
      return 'You’re in an in-app browser that can’t install web apps. ' +
             'Open this page in <b>Safari</b>, then Share → Add to Home Screen.';
    case 'menu-manual':
    default:
      return 'Open your browser menu and choose <b>Install app</b> / ' +
             '<b>Add to Home Screen</b>. (Not offered automatically yet — the ' +
             'install criteria may still be warming up, or you dismissed it.)';
  }
}

/**
 * Trigger install. On Chromium this shows the native prompt and resolves
 * with the user's choice ('accepted'|'dismissed'|'unavailable'). On iOS
 * there is NO programmatic install — resolves 'manual' (caller should show
 * guidanceHTML()).
 */
export async function promptInstall() {
  const s = strategy();
  if (s === 'installed') return 'installed';
  if (s === 'insecure') return 'insecure';
  if (s === 'prompt' && _deferred) {
    try {
      _deferred.prompt();
      const choice = await _deferred.userChoice;   // {outcome, platform}
      _deferred = null;
      _emit();
      return (choice && choice.outcome) || 'dismissed';
    } catch (_e) {
      _deferred = null;
      return 'unavailable';
    }
  }
  // iOS + menu-manual: nothing to fire; caller renders guidance.
  return 'manual';
}

/** Full snapshot for UI. Never throws. */
export function getState() {
  return {
    strategy: strategy(),
    canPromptNow: !!_deferred,
    installed: isStandalone() || _installed,
    ios: isIOS(),
    iosSafari: isIOSSafari(),
    standalone: isStandalone(),
    secureContext: isSecure(),
    guidanceHTML: guidanceHTML(),
  };
}

/* ---- one-tap button wiring ------------------------------------------ */

/**
 * Wire an existing button element. Shows/hides it based on strategy,
 * sets its label, and handles the tap. `opts.hintEl` (optional) gets
 * guidanceHTML() written into it. Returns an unsubscribe fn.
 */
export function attachButton(btn, opts = {}) {
  if (!btn) return () => {};
  const hintEl = opts.hintEl || null;
  const onResult = typeof opts.onResult === 'function' ? opts.onResult : () => {};

  const render = (st) => {
    if (hintEl) hintEl.innerHTML = st.guidanceHTML;
    switch (st.strategy) {
      case 'installed':
        btn.hidden = true; break;
      case 'insecure':
      case 'ios-webview':
        // Nothing actionable; keep the button but let it explain.
        btn.hidden = !!opts.hideWhenNoAction;
        btn.textContent = opts.label || 'Add to Home Screen';
        break;
      case 'prompt':
        btn.hidden = false;
        btn.textContent = opts.label || 'Install app';
        break;
      case 'ios-manual':
      case 'menu-manual':
      default:
        btn.hidden = false;
        btn.textContent = opts.label || 'Add to Home Screen';
        break;
    }
  };

  const onClick = async () => {
    const res = await promptInstall();
    // For non-Chromium paths, make sure the guidance is visible.
    if ((res === 'manual' || res === 'insecure') && hintEl) hintEl.innerHTML = guidanceHTML();
    onResult(res);
  };

  btn.addEventListener('click', onClick);
  const off = onChange(render);
  return () => { off(); btn.removeEventListener('click', onClick); };
}

/* ---- deep installability / secure-context DIAGNOSIS ----------------- */

/**
 * Rigorous per-device readout of whether this page can become an
 * installed, runnable, OFFLINE PWA — and if not, exactly what blocks it.
 * Async because it probes SW registration + Cache Storage + the model.
 *
 * Returns { checks: [{id,label,ok,grade,detail}], verdict, canRunOffline }.
 */
export async function diagnose() {
  const checks = [];
  const add = (id, label, ok, detail) => checks.push({ id, label, ok, detail });

  // 1) Secure context — the wall.
  const secure = isSecure();
  add('secure-context', 'Secure context (https / localhost)', secure,
      secure ? 'origin=' + safeOrigin()
             : 'origin=' + safeOrigin() + ' is http/LAN/USB → SW + WebGPU + Cache Storage BLOCKED.');

  // 2) Service Worker API present AND a controller/registration exists.
  const swApi = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  let swReg = false, swController = false;
  if (swApi && secure) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      swReg = regs && regs.length > 0;
      swController = !!navigator.serviceWorker.controller;
    } catch (_e) {}
  }
  add('sw-support', 'Service Worker API available', swApi,
      swApi ? '' : 'No serviceWorker in navigator (or blocked by context).');
  add('sw-registered', 'Service Worker registered for this origin', swReg,
      swReg ? (swController ? 'controlling this page' : 'registered (not yet controlling)')
            : 'App shell will NOT boot offline until a SW is registered from the secure origin.');

  // 3) Cache Storage reachable + shell present.
  let cacheApi = typeof caches !== 'undefined';
  let shellCached = false, modelCached = false, shellCacheName = '', modelBytes = 0;
  if (cacheApi) {
    try {
      const names = await caches.keys();
      const shellName = names.find((n) => /opencairn-shell/.test(n));
      shellCacheName = shellName || '';
      if (shellName) {
        const c = await caches.open(shellName);
        shellCached = !!(await c.match('./index.html')) || !!(await c.match('./'));
      }
      if (names.includes('transformers-cache')) {
        const mc = await caches.open('transformers-cache');
        const keys = await mc.keys();
        const onnx = keys.filter((r) => /\.onnx(_data)?$/.test(r.url) || /\/onnx\//.test(r.url));
        modelCached = onnx.length > 0;
        // best-effort size (content-length headers)
        for (const r of onnx) {
          try {
            const res = await mc.match(r);
            const len = res && res.headers.get('content-length');
            if (len) modelBytes += parseInt(len, 10) || 0;
          } catch (_e) {}
        }
      }
    } catch (_e) { cacheApi = false; }
  }
  add('cache-storage', 'Cache Storage reachable', cacheApi,
      cacheApi ? '' : 'Cache Storage unavailable (insecure context or file://).');
  add('shell-cached', 'App shell cached (boots offline)', shellCached,
      shellCached ? ('cache=' + shellCacheName) : 'Visit the secure origin online once to precache the shell.');
  add('model-cached', 'Feedseed model present (131MB) in transformers-cache', modelCached,
      modelCached ? ('~' + Math.round(modelBytes / 1048576) + ' MB cached')
                  : 'Model not cached yet — download once online OR receive it P2P from a peer.');

  // 4) WebGPU — required to actually RUN Feedseed (also needs secure ctx).
  let webgpu = false;
  try { webgpu = typeof navigator !== 'undefined' && !!navigator.gpu; } catch (_e) {}
  add('webgpu', 'WebGPU available (runs the model)', webgpu,
      webgpu ? '' : (secure ? 'No navigator.gpu on this browser/device.'
                            : 'WebGPU is gated on secure context too — insecure origin blocks it.'));

  // 5) Manifest link present (install metadata).
  let hasManifest = false;
  try { hasManifest = !!document.querySelector('link[rel="manifest"]'); } catch (_e) {}
  add('manifest', 'Web App Manifest linked', hasManifest,
      hasManifest ? '' : 'No <link rel="manifest"> — Android install prompt will not trigger.');

  // 6) Installability strategy on THIS OS.
  const st = strategy();
  add('installable', 'Installable on this OS', st !== 'insecure' && st !== 'ios-webview',
      'strategy=' + st + (isIOS() ? ' (iOS = manual Share→A2HS; no auto prompt)' : ''));

  // Verdict synthesis.
  const canRunOffline = secure && shellCached && modelCached && webgpu;
  let verdict;
  if (!secure) {
    verdict = 'BLOCKED: insecure origin. This device can neither install nor run the ' +
              'offline app from here. It must load the app’s https origin once.';
  } else if (canRunOffline) {
    verdict = 'READY: secure origin, shell + model cached, WebGPU present. Runs fully ' +
              'offline; installable to home screen.';
  } else if (secure && shellCached && !modelCached) {
    verdict = 'ARMED: code is secured + cached and installable. Missing ONLY the model ' +
              '— receive the 131MB weights from a peer (P2P) into transformers-cache, ' +
              'then it runs offline. No internet required for this step.';
  } else if (secure && !shellCached) {
    verdict = 'PARTIAL: secure origin but shell not fully cached. Load online once to ' +
              'precache, then it works offline.';
  } else {
    verdict = 'PARTIAL: secure origin; some capability missing (see checks).';
  }

  return { checks, verdict, canRunOffline, strategy: st, secure };
}

function safeOrigin() { try { return location.origin; } catch (_e) { return '(unknown)'; } }

/* ---- classic-script global (no-op under module import) -------------- */
try {
  if (typeof window !== 'undefined') {
    window.OCInstall = {
      isIOS, isIOSSafari, isStandalone, isSecure,
      strategy, guidanceHTML, promptInstall, getState, onChange,
      attachButton, diagnose,
    };
  }
} catch (_e) {}
