/**
 * emergency.mjs — OpenCairn / HawkTalk DETERMINISTIC emergency layer.
 *
 * THE ONE COMMAND THAT MUST NEVER DEPEND ON A NEURAL MODEL.
 * Everything here is pure rules + a spoken-number parser — no 270M model, no
 * cloud, no probability on the critical path. A broken screen, a panicking
 * voice, or a model whiff must not be able to swallow a call for help.
 *
 * Two jobs:
 *   1. isEmergencyIntent(text)      -> true if the utterance is a clear call
 *      for help (keyword rules; deterministic).
 *   2. parseSpokenNumber(text)      -> "911" / "112" / "000" ... so a hiker can
 *      SPEAK any nation's emergency number and have it dialled.
 *   interpretEmergency(text, opts)  -> {action:'dial'|'prompt'|'none', number, reason}
 *
 * Honest scope:
 *   - dialNumber() opens the OS dialer via tel: — the WEB cannot auto-place a
 *     call (that's a native capability; flagged). It gets the hiker one tap
 *     from the call with the number pre-filled, on a huge high-contrast screen.
 *   - The hardware volume-cycle trigger is native (browsers can't intercept
 *     volume keys on mobile) — see emergencyTrigger.js.
 */

'use strict';

/* Common national emergency numbers — for the big-button UI + validation.
 * 112 is the GSM-standard fallback (routes to local emergency on most networks
 * worldwide even with no SIM / roaming), so it's the safest default. */
const EMERGENCY_NUMBERS = [
  { num: '112', label: 'EU / GSM worldwide' },
  { num: '911', label: 'US / Canada' },
  { num: '999', label: 'UK / HK / many' },
  { num: '000', label: 'Australia' },
  { num: '111', label: 'New Zealand' },
  { num: '113', label: 'Norway / others' },
  { num: '118', label: 'parts of Asia' },
  { num: '119', label: 'Japan / Korea (fire/amb)' },
];
const KNOWN = new Set(EMERGENCY_NUMBERS.map((e) => e.num));
const DEFAULT_NUMBER = '112'; // GSM-universal fallback; user-configurable

/* Digit words. "oh"/"o" -> 0 is common in spoken numbers. */
const DIGIT = {
  zero: '0', oh: '0', o: '0', nought: '0', naught: '0',
  one: '1', won: '1', two: '2', to: '2', too: '2', three: '3', tree: '3',
  four: '4', for: '4', fore: '4', five: '5', six: '6', seven: '7',
  eight: '8', ate: '8', nine: '9', niner: '9',
};
const TEENS = { ten: '10', eleven: '11', twelve: '12' };
const REPEAT = { double: 2, triple: 3, treble: 3 };

/**
 * Extract a dialable digit string from spoken text. Handles digit words,
 * "oh"/"o" as 0, literal digits, and double/triple/treble N. Returns '' if no
 * plausible number. Deterministic.
 */
function parseSpokenNumber(text) {
  const t = String(text == null ? '' : text).toLowerCase();
  // tokens: words and digit-runs
  const toks = t.match(/[a-z]+|\d+/g) || [];
  let out = '';
  let mult = 0;
  for (const tk of toks) {
    if (/^\d+$/.test(tk)) { out += tk; mult = 0; continue; }
    if (REPEAT[tk] != null) { mult = REPEAT[tk]; continue; }
    if (DIGIT[tk] != null) { out += DIGIT[tk].repeat(mult || 1); mult = 0; continue; }
    if (TEENS[tk] != null) { out += TEENS[tk]; mult = 0; continue; }
    // any other word breaks a pending multiplier but not the accumulated string
    mult = 0;
  }
  return out;
}

/** A parsed number is dialable as an emergency number if it's a known one, or a
 * short 2–4 digit sequence (emergency numbers are short everywhere). */
function isDialableEmergency(num) {
  if (!num) return false;
  if (KNOWN.has(num)) return true;
  return /^\d{2,4}$/.test(num);
}

/* Deterministic emergency-intent keywords. Kept tight to avoid crying wolf, but
 * covers the words a hurt/scared person actually says. */
const EMERGENCY_RE = new RegExp(
  '\\b(' +
  // sos with optional letter separators: ASR renders spoken "S O S" as
  // "S-O-S" / "S.O.S." / "S O S" — all must dial (word-bounded, so no FP).
  'help|helm[e]?|s[\\s.\\-]?o[\\s.\\-]?s|mayday|emergency|ambulance|paramedics?|rescue|' +
  'police|fire\\s?(?:truck|department|brigade)?|' +
  '9\\s?1\\s?1|1\\s?1\\s?2|9\\s?9\\s?9|0\\s?0\\s?0|' +
  "i'?m\\s+(?:hurt|injured|bleeding|trapped|stuck|dying|choking)|" +
  // strong medical signals — trigger regardless of subject
  '(?:not\\s+breathing|unconscious|collapsed|passed\\s+out|drowning|choking|' +
  'cardiac\\s+arrest|heart\\s+attack|having\\s+a\\s+stroke|overdos|severe\\s+bleeding)|' +
  // someone (any subject) is hurt/down
  "(?:he|she|they|someone|somebody|my\\s+\\w+|the\\s+\\w+|a\\s+hiker)\\s+(?:is|s|isn'?t|got|fell|are)?\\s*(?:hurt|injured|bleeding|not\\s+breathing|unconscious|down|collapsed|choking)|" +
  'broke\\s+my|broken\\s+(?:leg|arm|ankle|wrist)|fell\\s+(?:off|down)|' +
  'call\\s+(?:for\\s+)?(?:help|911|112|999|000|an?\\s+ambulance|the\\s+police|emergency)|' +
  'i\\s+need\\s+help' +
  ')\\b',
  'i'
);

function isEmergencyIntent(text) {
  const t = String(text == null ? '' : text);
  try { return EMERGENCY_RE.test(t); } catch (_e) { return false; }
}

/* Words that, if present, mean a bare number is NOT a dial request (distance,
 * ratings, counts) — guards spoken-number dialing OUTSIDE emergency mode. */
const NUMBER_NOT_DIAL_RE = /\b(mile|miles|km|kilomet|meter|metre|feet|foot|minute|hour|hours|out\s+of|rating|degrees?|percent|o'?clock|number\s+\w+\s+trail|trail\s+number)\b/i;

/**
 * interpretEmergency(text, { mode, defaultNumber })
 *   mode 'armed'  — emergency mode is ACTIVE (post hardware/switch trigger):
 *     a spoken number dials it; an emergency keyword dials the default; anything
 *     else -> 'prompt' (ask again, never a wrong dial).
 *   mode 'passive' (default) — normal listening: ONLY a clear emergency keyword
 *     triggers; a bare spoken number does NOT dial (too risky to auto-dial
 *     "nine miles to go"). Returns 'dial' with the default number on a keyword.
 * Fully deterministic. Returns {action, number, reason}.
 */
function interpretEmergency(text, opts) {
  const o = opts || {};
  const mode = o.mode === 'armed' ? 'armed' : 'passive';
  const def = o.defaultNumber || DEFAULT_NUMBER;
  const t = String(text == null ? '' : text).trim();
  if (!t) return { action: mode === 'armed' ? 'prompt' : 'none', number: null, reason: 'empty' };

  const kw = isEmergencyIntent(t);
  const num = parseSpokenNumber(t);
  const dialable = isDialableEmergency(num);
  const numberLooksLikeDial = dialable && !NUMBER_NOT_DIAL_RE.test(t);

  if (mode === 'armed') {
    // Armed: a spoken number wins (they're telling us what to dial), else a
    // keyword dials the default, else ask again — NEVER a spurious dial.
    if (numberLooksLikeDial) return { action: 'dial', number: num, reason: 'spoken-number' };
    if (kw) return { action: 'dial', number: def, reason: 'keyword' };
    return { action: 'prompt', number: null, reason: 'unclear' };
  }
  // Passive: keyword only. A bare number never auto-dials outside emergency mode.
  if (kw) return { action: 'dial', number: def, reason: 'keyword' };
  // Exception: an explicit "dial/call <number>" IS a dial even passive.
  if (numberLooksLikeDial && /\b(dial|call)\b/i.test(t)) {
    return { action: 'dial', number: num, reason: 'explicit-dial' };
  }
  return { action: 'none', number: null, reason: 'not-emergency' };
}

/** Open the OS dialer with the number pre-filled. Web can't auto-call — this
 * gets them one tap away, on the big emergency screen. Returns the tel: URL. */
function dialNumber(number) {
  const n = String(number || '').replace(/[^\d*#+]/g, '');
  const url = 'tel:' + n;
  try { if (typeof window !== 'undefined') window.location.href = url; } catch (_e) { /* ignore */ }
  return url;
}

/* ------------------------------------------------------------------ */
/* GPS -> correct emergency number, OFFLINE.                           */
/* Conservative on purpose: we only override to a country-specific     */
/* number where it's unambiguous and we're certain; everywhere else    */
/* falls back to 112 (GSM-universal, routes to local emergency on most  */
/* networks worldwide). Dialing a WRONG specific number is worse than   */
/* dialing the universal one, so the bboxes are wide + well-separated   */
/* and the default is always the safe 112.                             */
/* ------------------------------------------------------------------ */

// [minLon, minLat, maxLon, maxLat] -> {number, region}. Order = priority.
const GPS_REGIONS = [
  { box: [-170, 14, -52, 73], number: '911', region: 'North America (US/CA/MX)' },
  { box: [-11, 49.5, 2.1, 61], number: '999', region: 'UK / British Isles' },
  { box: [112, -44, 154, -10], number: '000', region: 'Australia' },
  { box: [166, -48, 179.5, -34], number: '111', region: 'New Zealand' },
];

/** {number, region, source} for a GPS fix. Always returns a dialable number
 *  (112 if the location isn't in a region we're certain about). Pure + offline. */
function emergencyNumberForCoords(lat, lon) {
  if (typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon)) {
    for (const r of GPS_REGIONS) {
      const [x0, y0, x1, y1] = r.box;
      if (lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1) {
        return { number: r.number, region: r.region, source: 'gps' };
      }
    }
    return { number: DEFAULT_NUMBER, region: 'universal (112)', source: 'gps-fallback' };
  }
  return { number: DEFAULT_NUMBER, region: 'universal (112)', source: 'no-fix' };
}

/** Get the current-location emergency number via geolocation (offline; GPS
 *  needs no network). Resolves {number, region, source} — never rejects; on
 *  timeout/denied returns the 112 fallback so a call is always one tap away. */
function emergencyNumberFromGPS(timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return fin({ number: DEFAULT_NUMBER, region: 'universal (112)', source: 'no-geo' });
      }
      navigator.geolocation.getCurrentPosition(
        (p) => fin(emergencyNumberForCoords(p.coords.latitude, p.coords.longitude)),
        () => fin({ number: DEFAULT_NUMBER, region: 'universal (112)', source: 'denied' }),
        { enableHighAccuracy: false, timeout: timeoutMs || 4000, maximumAge: 60000 }
      );
    } catch (_e) { fin({ number: DEFAULT_NUMBER, region: 'universal (112)', source: 'error' }); }
  });
}

export {
  parseSpokenNumber,
  isEmergencyIntent,
  interpretEmergency,
  isDialableEmergency,
  dialNumber,
  emergencyNumberForCoords,
  emergencyNumberFromGPS,
  EMERGENCY_NUMBERS,
  DEFAULT_NUMBER,
};

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.Emergency = {
      parseSpokenNumber, isEmergencyIntent, interpretEmergency,
      isDialableEmergency, dialNumber, emergencyNumberForCoords, emergencyNumberFromGPS,
      EMERGENCY_NUMBERS, DEFAULT_NUMBER,
    };
  }
} catch (_e) { /* ignore */ }
