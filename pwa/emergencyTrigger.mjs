/**
 * emergencyTrigger.mjs — screen-free hardware activation for emergency mode.
 *
 * TWO volume-rocker patterns (deterministic, no model):
 *   ACTIVATE  : alternating up/down x20 presses (10 cycles) -> enter emergency
 *               mode. Distinct from any normal volume use.
 *   FAST-911  : while ARMED, up-up-down-down-up-up (6 presses) -> dial 911,
 *               hardcoded. A muscle-memory shortcut when every second counts.
 *
 * HONEST PLATFORM NOTE (robotdick):
 *   Mobile browsers do NOT deliver volume-key events to a web page — the OS
 *   owns the volume rocker. So the real "screen is shattered, rocker still
 *   works" path is a NATIVE capability: the Android app registers a volume-key
 *   listener (foreground service / media session / accessibility) and calls
 *   feedPress('up'|'down') into this same matcher. In the browser this module
 *   still runs and can be driven by:
 *     - a test key binding (ArrowUp/ArrowDown) for desktop verification,
 *     - the on-screen SOS control + the settings switch,
 *     - feedPress() from any host that DOES get the keys.
 *   The pattern logic is identical everywhere; only the event source differs.
 */

'use strict';

const ACTIVATE_LEN = 20;   // alternating up/down x20
const FAST911 = ['up', 'up', 'down', 'down', 'up', 'up'];
const WINDOW_MS = 6000;    // whole pattern must complete within this
const IDLE_RESET_MS = 2500; // gap longer than this clears the buffer

let _armed = false;
let _presses = [];         // [{dir,t}]
let _onActivate = null;
let _on911 = null;
let _bound = false;

function _now() { try { return Date.now(); } catch (_e) { return 0; } }

function _trim(t) {
  // drop presses older than the window; reset entirely on a long idle gap
  if (_presses.length) {
    const last = _presses[_presses.length - 1].t;
    if (t - last > IDLE_RESET_MS) _presses = [];
  }
  const cut = t - WINDOW_MS;
  while (_presses.length && _presses[0].t < cut) _presses.shift();
}

function _isAlternating(arr) {
  if (arr.length < ACTIVATE_LEN) return false;
  const tail = arr.slice(-ACTIVATE_LEN);
  for (let i = 1; i < tail.length; i += 1) if (tail[i] === tail[i - 1]) return false;
  return true;
}

function _matchesFast911(arr) {
  if (arr.length < FAST911.length) return false;
  const tail = arr.slice(-FAST911.length);
  for (let i = 0; i < FAST911.length; i += 1) if (tail[i] !== FAST911[i]) return false;
  return true;
}

/** Feed one rocker press. dir = 'up' | 'down'. Returns the pattern that fired
 * ('activate' | 'fast911') or null. The host (native or browser) calls this. */
function feedPress(dir) {
  if (dir !== 'up' && dir !== 'down') return null;
  const t = _now();
  _trim(t);
  _presses.push({ dir, t });
  const dirs = _presses.map((p) => p.dir);

  // Fast-911 only counts once emergency mode is already armed.
  if (_armed && _matchesFast911(dirs)) {
    _presses = [];
    try { if (_on911) _on911(); } catch (_e) { /* ignore */ }
    return 'fast911';
  }
  // Activation: 20 alternating (works whether or not already armed; re-arming
  // is harmless).
  if (_isAlternating(dirs)) {
    _presses = [];
    try { if (_onActivate) _onActivate(); } catch (_e) { /* ignore */ }
    return 'activate';
  }
  return null;
}

function setArmed(v) { _armed = !!v; }
function isArmed() { return _armed; }
function reset() { _presses = []; }

/** Progress hint for a UI ("13/20"), so a hiker gets feedback while cycling. */
function activationProgress() {
  const dirs = _presses.map((p) => p.dir);
  let run = 1;
  for (let i = dirs.length - 1; i > 0 && dirs[i] !== dirs[i - 1]; i -= 1) run += 1;
  return { count: Math.min(run, ACTIVATE_LEN), need: ACTIVATE_LEN };
}

/**
 * start({ onActivate, on911, bindTestKeys }) — wire the matcher. Attaches a
 * volume-key listener where the platform delivers one, plus optional
 * ArrowUp/ArrowDown test keys for desktop. Safe to call once; never throws.
 */
function start(opts) {
  const o = opts || {};
  _onActivate = o.onActivate || _onActivate;
  _on911 = o.on911 || _on911;
  if (_bound || typeof window === 'undefined') return;
  _bound = true;
  try {
    window.addEventListener('keydown', (e) => {
      const k = e.key || e.code || '';
      // Volume keys where a platform delivers them.
      if (k === 'AudioVolumeUp' || k === 'VolumeUp') return void feedPress('up');
      if (k === 'AudioVolumeDown' || k === 'VolumeDown') return void feedPress('down');
      // Desktop test binding (only when explicitly enabled).
      if (o.bindTestKeys) {
        if (k === 'ArrowUp') feedPress('up');
        else if (k === 'ArrowDown') feedPress('down');
      }
    }, { passive: true });
  } catch (_e) { _bound = false; }
}

export {
  start, feedPress, setArmed, isArmed, reset, activationProgress,
  ACTIVATE_LEN, FAST911,
};

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.EmergencyTrigger = { start, feedPress, setArmed, isArmed, reset, activationProgress, ACTIVATE_LEN, FAST911 };
  }
} catch (_e) { /* ignore */ }
