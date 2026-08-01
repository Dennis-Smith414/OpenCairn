/**
 * discover.js — OpenCairn OFFLINE natural-language trail discovery.
 *
 * discover(query, trails) turns a natural request like
 *   "a 5-mile loop near Issaquah with a lake, moderate gain, dog-friendly"
 * into structured criteria and ranks the local 2,068-trail seed against
 * them — no network, ever. Two feature-detected backends:
 *
 *   Backend A (optional): the SAME on-device model path edgeAI.js uses —
 *     Chrome built-in AI Prompt API (global `LanguageModel`, or legacy
 *     `window.ai.languageModel`, i.e. Gemini Nano). Prompted with a JSON
 *     schema (responseConstraint) to extract
 *       {targetMiles, minMiles, maxMiles, region, features[], difficulty, loop}
 *     then everything is filtered/scored locally in plain JS.
 *   Backend B (ALWAYS available): a deterministic regex/keyword parser that
 *     extracts the same criteria shape with zero AI. Every AI result is
 *     validated and back-filled from this parser, so the AI can only ever
 *     ADD precision, never break discovery.
 *
 * Honesty about the data: trails.min.json carries only {id, name, region,
 * LineString geometry}. So we can truly score
 *   - length        (haversine over the track, same math as app.js),
 *   - loop-ness     (start≈end within 120 m, same rule as app.js),
 *   - region        (the four REGION_COLOR regions),
 *   - name features (lake/creek/falls/ridge/… mentioned in the trail name),
 *   - difficulty    (a stated PROXY from length + name hints — no elevation data).
 * Criteria we cannot infer (dog-friendly, shade, wildflowers…) are captured,
 * reported in `notes`, and never silently faked into the ranking.
 *
 * Pure vanilla JS, classic script (no `export` — passes `node --check`).
 * Exposed as globalThis.TrailDiscover and via CommonJS module.exports.
 * Never throws: worst case resolves { ok:false, results:[], … }.
 */

'use strict';

/* ------------------------------------------------------------------ */
/* Region + feature lexicons (aligned with app.js REGION_COLOR)        */
/* ------------------------------------------------------------------ */

var DISCOVER_REGIONS = [
  'Snoqualmie Valley / North Bend, WA',
  'Cascade Foothills, WA',
  'Seattle / Puget Sound, WA',
  'Issaquah Alps, WA',
];

/** keyword → canonical region string */
var REGION_KEYWORDS = [
  { re: /\biss?aquah\b|\bissaquah alps\b|\btiger (?:mt|mountain)\b|\bcougar (?:mt|mountain)\b|\bsquak\b/, region: 'Issaquah Alps, WA' },
  { re: /\bsnoqualmie\b|\bnorth bend\b|\bsnoqualmie valley\b|\bsnoqualmie pass\b/, region: 'Snoqualmie Valley / North Bend, WA' },
  { re: /\bseattle\b|\bpuget\b|\bpuget sound\b|\bkitsap\b|\bhansville\b/, region: 'Seattle / Puget Sound, WA' },
  { re: /\bcascades?\b|\bfoothills?\b/, region: 'Cascade Foothills, WA' },
];

/**
 * Features we can genuinely infer from a trail NAME. Each entry:
 *   key      — canonical feature tag,
 *   ask      — matches the feature in the USER QUERY,
 *   name     — matches evidence in the TRAIL NAME.
 */
var FEATURE_LEXICON = [
  { key: 'lake',      ask: /\blakes?\b|\balpine lake\b/,                       name: /\blakes?\b/ },
  // NB: "cascades" is deliberately NOT a waterfall ask — in this WA dataset
  // it is the Cascade Foothills region word (see REGION_KEYWORDS).
  { key: 'waterfall', ask: /\bwater ?falls?\b|\bfalls\b/,                      name: /\bfalls\b/ },
  { key: 'creek',     ask: /\bcreeks?\b|\bstreams?\b|\bbrooks?\b/,             name: /\bcreek\b|\bbrook\b/ },
  { key: 'river',     ask: /\brivers?\b|\briverside\b/,                        name: /\briver\b|\bfork\b/ },
  { key: 'pond',      ask: /\bponds?\b/,                                       name: /\bpond\b/ },
  { key: 'ridge',     ask: /\bridge(?:line)?s?\b/,                             name: /\bridge\b/ },
  { key: 'summit',    ask: /\bsummits?\b|\bpeaks?\b|\bmountain ?tops?\b|\bmountains?\b/, name: /\bmountains?\b|\bmtn?\b|\bpeak\b|\bsummit\b|\bsi\b/ },
  { key: 'forest',    ask: /\bforests?\b|\bwoods?\b|\bold[- ]growth\b|\btrees?\b/, name: /\bforest\b|\bgrove\b|\btimber\b|\bcedar\b|\bfir\b|\bhemlock\b/ },
  { key: 'coast',     ask: /\bbeach(?:es)?\b|\bcoast(?:line)?\b|\bshore(?:line)?\b|\bsaltwater\b|\bsound\b/, name: /\bbeach\b|\bpoint\b|\bsound\b|\bbay\b|\bcove\b/ },
  { key: 'meadow',    ask: /\bmeadows?\b|\bprairies?\b/,                       name: /\bmeadow\b|\bprairie\b/ },
  { key: 'view',      ask: /\bviews?\b|\bviewpoints?\b|\bvistas?\b|\boverlooks?\b|\blookouts?\b|\bscenic\b/, name: /\bview\b|\bvista\b|\boverlook\b|\blookout\b|\bpoint\b/ },
  { key: 'wetland',   ask: /\bwetlands?\b|\bmarsh(?:es)?\b|\bswamps?\b|\bbogs?\b/, name: /\bwetland\b|\bmarsh\b|\bswamp\b|\bbog\b|\bbeaver\b/ },
  { key: 'canyon',    ask: /\bcanyons?\b|\bgorges?\b/,                         name: /\bcanyon\b|\bgorge\b/ },
];

/** Popular asks the seed simply cannot answer — captured, surfaced, not scored. */
var UNINFERABLE = [
  { key: 'dog-friendly',  re: /\bdogs?(?:[- ]friendly)?\b|\bpups?\b|\bleash\b/ },
  { key: 'kid-friendly',  re: /\bkids?(?:[- ]friendly)?\b|\bfamily(?:[- ]friendly)?\b|\bstroller\b|\btoddlers?\b/ },
  { key: 'wildflowers',   re: /\bwild ?flowers?\b|\bblooms?\b/ },
  { key: 'shade',         re: /\bshad(?:e|y|ed)\b/ },
  { key: 'parking',       re: /\bparking\b|\btrailhead parking\b/ },
  { key: 'crowds',        re: /\bquiet\b|\buncrowded\b|\bcrowds?\b|\bsolitude\b|\bless[- ]traveled\b/ },
  { key: 'accessible',    re: /\bwheelchair\b|\bada\b|\baccessible\b|\bpaved\b/ },
];

var WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  half: 0.5, 'a couple': 2, 'a few': 3,
};

var KM_PER_MI = 1.609344;
var M_PER_MI = 1609.34; // same constant app.js fmtDist uses
var LOOP_CLOSE_M = 120; // same loop rule as app.js waypointsFor()

/* ------------------------------------------------------------------ */
/* Geometry (mirrors app.js math so numbers agree across the app)      */
/* ------------------------------------------------------------------ */

function _haversineM(a, b) { // [lon,lat] pairs → metres
  var R = 6371000, toR = Math.PI / 180;
  var dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
  var la1 = a[1] * toR, la2 = b[1] * toR;
  var s1 = Math.sin(dLat / 2), s2 = Math.sin(dLon / 2);
  var h = s1 * s1 + Math.cos(la1) * Math.cos(la2) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function _trackLengthM(coords) {
  var d = 0;
  for (var i = 1; i < coords.length; i++) d += _haversineM(coords[i - 1], coords[i]);
  return d;
}

/* ------------------------------------------------------------------ */
/* Trail normalization + derived signals (cached per trail object)     */
/* ------------------------------------------------------------------ */

var _signalCache = typeof WeakMap === 'function' ? new WeakMap() : null;

/**
 * Accepts any of:
 *   - a GeoJSON FeatureCollection ({features:[...]}) — trails.min.json as-is,
 *   - an array of GeoJSON Features,
 *   - app.js State.routes entries ({id,name,region,coords,distance_m}).
 * Returns a plain array of source objects (never throws; bad input → []).
 */
function _normalizeTrails(trails) {
  try {
    if (!trails) return [];
    if (Array.isArray(trails)) return trails;
    if (Array.isArray(trails.features)) return trails.features;
  } catch (_e) { /* ignore */ }
  return [];
}

/** Derive {id,name,region,lengthMi,isLoop,nameLower} once per trail object. */
function _signalsFor(t) {
  if (_signalCache) {
    var hit = null;
    try { hit = _signalCache.get(t); } catch (_e) { hit = null; }
    if (hit) return hit;
  }
  var sig = null;
  try {
    var props = t.properties || t;
    var coords = (t.geometry && t.geometry.coordinates) || t.coords || null;
    var lengthM = typeof t.distance_m === 'number' ? t.distance_m
      : (coords && coords.length > 1 ? _trackLengthM(coords) : 0);
    var isLoop = !!(coords && coords.length > 2 &&
      _haversineM(coords[0], coords[coords.length - 1]) < LOOP_CLOSE_M);
    var name = String(props.name || 'Unnamed trail');
    sig = {
      id: props.id != null ? props.id : null,
      name: name,
      nameLower: name.toLowerCase(),
      region: String(props.region || ''),
      lengthMi: lengthM / M_PER_MI,
      isLoop: isLoop,
    };
  } catch (_e) {
    sig = null;
  }
  if (sig && _signalCache) {
    try { _signalCache.set(t, sig); } catch (_e2) { /* primitives etc. */ }
  }
  return sig;
}

/* ------------------------------------------------------------------ */
/* Backend B — rule-based query parser (ALWAYS available, no AI)       */
/* ------------------------------------------------------------------ */

function _numFrom(s) {
  var n = parseFloat(s);
  if (isFinite(n)) return n;
  var w = String(s || '').toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(WORD_NUMBERS, w) ? WORD_NUMBERS[w] : NaN;
}

/** miles from "<num> <unit>" — km converted, plain number assumed miles */
function _toMiles(numStr, unitStr) {
  var n = _numFrom(numStr);
  if (!isFinite(n) || n <= 0 || n > 500) return null;
  var u = String(unitStr || '').toLowerCase();
  if (/km|kilomet/.test(u)) return n / KM_PER_MI;
  return n; // 'mi', 'mile(s)', or unitless
}

var NUM_RE = '(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|half)';
var UNIT_RE = '(miles?|mi\\b|kilometers?|kilometres?|km\\b|k\\b)';

/**
 * Deterministic query → criteria. Never throws. Criteria shape:
 * { targetMiles, minMiles, maxMiles, region, features[], difficulty, loop,
 *   uninferable[] }  — every field nullable except the arrays.
 */
function ruleParseQuery(query) {
  var c = { targetMiles: null, minMiles: null, maxMiles: null, region: null,
    features: [], difficulty: null, loop: null, uninferable: [] };
  var q = String(query == null ? '' : query).toLowerCase();
  if (!q.trim()) return c;

  try {
    /* --- distance --- */
    var m;
    // bounded: "under/less than/at most/no more than/up to/within 5 miles"
    m = q.match(new RegExp('\\b(?:under|less than|at most|no more than|up to|within|max(?:imum)? of|shorter than)\\s+' + NUM_RE + '(?:\\s*|-)' + UNIT_RE, 'i'));
    if (m) c.maxMiles = _toMiles(m[1], m[2]);
    m = q.match(new RegExp('\\b(?:over|more than|at least|min(?:imum)? of|longer than)\\s+' + NUM_RE + '(?:\\s*|-)' + UNIT_RE, 'i'));
    if (m) c.minMiles = _toMiles(m[1], m[2]);
    // range: "3 to 6 miles", "3-6 miles"
    m = q.match(new RegExp('\\b' + NUM_RE + '\\s*(?:to|-|–)\\s*' + NUM_RE + '\\s*' + UNIT_RE, 'i'));
    if (m && c.minMiles == null && c.maxMiles == null) {
      var lo = _toMiles(m[1], m[3]), hi = _toMiles(m[2], m[3]);
      if (lo != null && hi != null && hi >= lo) { c.minMiles = lo; c.maxMiles = hi; }
    }
    // target: "a 5-mile loop", "about five miles", "roughly 8 km hike"
    if (c.targetMiles == null) {
      m = q.match(new RegExp('\\b(?:about|around|roughly|approximately|~)?\\s*' + NUM_RE + '(?:\\s*|-)' + UNIT_RE, 'i'));
      if (m && c.minMiles == null && c.maxMiles == null) c.targetMiles = _toMiles(m[1], m[2]);
    }
    // vague sizes
    if (c.targetMiles == null && c.maxMiles == null && c.minMiles == null) {
      if (/\b(short|quick|easy stroll|after[- ]work)\b/.test(q)) c.maxMiles = 3;
      else if (/\b(long|all[- ]day|big day|epic)\b/.test(q)) c.minMiles = 8;
    }

    /* --- region --- */
    for (var i = 0; i < REGION_KEYWORDS.length; i++) {
      if (REGION_KEYWORDS[i].re.test(q)) { c.region = REGION_KEYWORDS[i].region; break; }
    }

    /* --- loop vs out-and-back --- */
    if (/\bout[- ](?:and|n)[- ]back\b|\bthere and back\b|\bone[- ]way\b|\bpoint[- ]to[- ]point\b/.test(q)) c.loop = false;
    else if (/\bloops?\b|\bcircuits?\b|\bround[- ]trip loop\b/.test(q)) c.loop = true;

    /* --- difficulty --- */
    if (/\b(hard|difficult|strenuous|challenging|steep|brutal|big (?:elevation )?gain|lots of gain|leg[- ]burner)\b/.test(q)) c.difficulty = 'hard';
    else if (/\b(moderate|medium|intermediate|some gain|moderate (?:elevation )?gain|decent workout)\b/.test(q)) c.difficulty = 'moderate';
    else if (/\b(easy|gentle|flat|mellow|beginner|low (?:elevation )?gain|minimal gain|casual|leisurely)\b/.test(q)) c.difficulty = 'easy';

    /* --- inferable features --- */
    for (var f = 0; f < FEATURE_LEXICON.length; f++) {
      if (FEATURE_LEXICON[f].ask.test(q)) c.features.push(FEATURE_LEXICON[f].key);
    }

    /* --- honest "can't score this" bucket --- */
    for (var u = 0; u < UNINFERABLE.length; u++) {
      if (UNINFERABLE[u].re.test(q)) c.uninferable.push(UNINFERABLE[u].key);
    }
  } catch (_e) {
    // regex problems must never take discovery down — return what we have
  }
  return c;
}

/* ------------------------------------------------------------------ */
/* Backend A — Chrome built-in AI (same model path as edgeAI.js)       */
/* ------------------------------------------------------------------ */

/** JSON schema handed to the Prompt API as responseConstraint. */
var CRITERIA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    targetMiles: { type: 'number' },
    minMiles: { type: 'number' },
    maxMiles: { type: 'number' },
    region: { type: 'string', enum: DISCOVER_REGIONS.concat(['']) },
    features: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    difficulty: { type: 'string', enum: ['easy', 'moderate', 'hard', ''] },
    loop: { type: 'string', enum: ['loop', 'out-and-back', 'any'] },
  },
};

var EXTRACT_PROMPT = [
  'You extract structured hiking-trail search criteria from a request.',
  'Known regions (use EXACTLY one of these strings, or "" if none named):',
  DISCOVER_REGIONS.map(function (r) { return '- ' + r; }).join('\n'),
  '(Issaquah/Tiger/Cougar => Issaquah Alps; Snoqualmie/North Bend => Snoqualmie Valley / North Bend;',
  'Seattle/Puget Sound/Kitsap => Seattle / Puget Sound; otherwise Cascade Foothills if foothills/cascades named.)',
  'features: short lowercase nouns like "lake","waterfall","creek","river","ridge","summit","forest","view","meadow","pond","coast","dog-friendly".',
  'Distances in miles (convert km). Omit fields the request does not state.',
  'Respond ONLY with JSON matching the schema.',
].join('\n');

/** Same detection cascade edgeAI.js uses (modern LanguageModel, legacy window.ai). */
function _detectPromptAPI() {
  try {
    if (typeof LanguageModel !== 'undefined' && LanguageModel &&
        typeof LanguageModel.create === 'function') {
      return { api: LanguageModel, flavor: 'modern' };
    }
  } catch (_e) { /* ignore */ }
  try {
    if (typeof window !== 'undefined' && window.ai && window.ai.languageModel &&
        typeof window.ai.languageModel.create === 'function') {
      return { api: window.ai.languageModel, flavor: 'legacy' };
    }
  } catch (_e) { /* ignore */ }
  return null;
}

var _aiSession = null;

async function _getAISession() {
  if (_aiSession) return _aiSession;
  var found = _detectPromptAPI();
  if (!found) return null;
  try {
    // If edgeAI.js already probed the model, respect its verdict (shared
    // model path — no point re-downloading state it knows is unavailable).
    try {
      if (typeof globalThis !== 'undefined' && globalThis.EdgeAI &&
          typeof globalThis.EdgeAI.getStatus === 'function') {
        var st = await globalThis.EdgeAI.getStatus();
        if (st && st.nano === 'unavailable') return null;
      }
    } catch (_e) { /* advisory only */ }

    if (found.flavor === 'modern') {
      _aiSession = await found.api.create({
        initialPrompts: [{ role: 'system', content: EXTRACT_PROMPT }],
      });
    } else {
      _aiSession = await found.api.create({ systemPrompt: EXTRACT_PROMPT });
    }
    return _aiSession;
  } catch (_e) {
    _aiSession = null;
    return null;
  }
}

/** Clamp/validate whatever the model returned into the rule-parser shape. */
function _validateAICriteria(raw, ruleFallback) {
  var obj = null;
  try { obj = JSON.parse(raw); } catch (_e) {
    try {
      var m = String(raw || '').match(/\{[\s\S]*\}/);
      if (m) obj = JSON.parse(m[0]);
    } catch (_e2) { /* ignore */ }
  }
  if (!obj || typeof obj !== 'object') return null;

  var num = function (v) {
    return (typeof v === 'number' && isFinite(v) && v > 0 && v <= 500) ? v : null;
  };
  var c = {
    targetMiles: num(obj.targetMiles),
    minMiles: num(obj.minMiles),
    maxMiles: num(obj.maxMiles),
    region: DISCOVER_REGIONS.indexOf(obj.region) !== -1 ? obj.region : null,
    features: [],
    difficulty: (obj.difficulty === 'easy' || obj.difficulty === 'moderate' || obj.difficulty === 'hard')
      ? obj.difficulty : null,
    loop: obj.loop === 'loop' ? true : obj.loop === 'out-and-back' ? false : null,
    uninferable: [],
  };
  if (Array.isArray(obj.features)) {
    for (var i = 0; i < obj.features.length && c.features.length < 8; i++) {
      var f = String(obj.features[i] || '').toLowerCase().trim();
      if (!f) continue;
      var known = false;
      for (var k = 0; k < FEATURE_LEXICON.length; k++) {
        if (FEATURE_LEXICON[k].key === f || FEATURE_LEXICON[k].ask.test(f)) {
          if (c.features.indexOf(FEATURE_LEXICON[k].key) === -1) c.features.push(FEATURE_LEXICON[k].key);
          known = true; break;
        }
      }
      if (!known) {
        for (var u = 0; u < UNINFERABLE.length; u++) {
          if (UNINFERABLE[u].key === f || UNINFERABLE[u].re.test(f)) {
            if (c.uninferable.indexOf(UNINFERABLE[u].key) === -1) c.uninferable.push(UNINFERABLE[u].key);
            known = true; break;
          }
        }
      }
      // truly unknown feature nouns are dropped — we cannot score what the
      // data cannot express, and we refuse to pretend otherwise
    }
  }
  // Back-fill anything the model omitted from the deterministic parse: the
  // AI may only ADD precision, never lose what rules already caught.
  if (ruleFallback) {
    if (c.targetMiles == null) c.targetMiles = ruleFallback.targetMiles;
    if (c.minMiles == null) c.minMiles = ruleFallback.minMiles;
    if (c.maxMiles == null) c.maxMiles = ruleFallback.maxMiles;
    if (c.region == null) c.region = ruleFallback.region;
    if (c.difficulty == null) c.difficulty = ruleFallback.difficulty;
    if (c.loop == null) c.loop = ruleFallback.loop;
    for (var rf = 0; rf < ruleFallback.features.length; rf++) {
      if (c.features.indexOf(ruleFallback.features[rf]) === -1) c.features.push(ruleFallback.features[rf]);
    }
    for (var ru = 0; ru < ruleFallback.uninferable.length; ru++) {
      if (c.uninferable.indexOf(ruleFallback.uninferable[ru]) === -1) c.uninferable.push(ruleFallback.uninferable[ru]);
    }
  }
  return c;
}

/** AI extraction; returns criteria or null (→ caller uses rules alone). */
async function _aiParseQuery(query, ruleFallback) {
  var session = await _getAISession();
  if (!session) return null;
  var raw = null;
  try {
    raw = await session.prompt(String(query), { responseConstraint: CRITERIA_SCHEMA });
  } catch (_e) {
    try {
      raw = await session.prompt(String(query) +
        '\n\nRespond ONLY with JSON: {"targetMiles":n,"minMiles":n,"maxMiles":n,"region":"...","features":[],"difficulty":"...","loop":"loop|out-and-back|any"}');
    } catch (_e2) {
      _aiSession = null; // crashed session → recreate next time
      return null;
    }
  }
  return _validateAICriteria(raw, ruleFallback);
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

/** Stated proxy: no elevation in the seed, so difficulty ≈ length + name hints. */
function _difficultyProxy(sig) {
  if (/\bmountains?\b|\bmtn?\b|\bpeak\b|\bsummit\b|\bridge\b|\bpass\b/.test(sig.nameLower) || sig.lengthMi > 8) return 'hard';
  if (/\bnature\b|\bgreenway\b|\bpark\b|\bpond\b|\binterpretive\b|\bboardwalk\b|\bgarden\b/.test(sig.nameLower) || sig.lengthMi < 2.5) return 'easy';
  return 'moderate';
}

/** Obvious street/road segments rank below real trails when criteria exist. */
function _looksLikeStreet(nameLower) {
  return /\b(road|rd|avenue|ave|street|st|way|place|pl|boulevard|blvd|drive|dr|lane|ln|court|ct|development)\b/.test(nameLower) &&
    !/\btrail\b|\bloop\b|\bpath\b|\bgreenway\b/.test(nameLower);
}

/**
 * Score one trail against criteria. Returns { score, reasons[] } — reasons
 * only contain claims the data actually supports.
 */
function _scoreTrail(sig, c) {
  var score = 0;
  var reasons = [];
  var lenTxt = sig.lengthMi.toFixed(1) + ' mi';

  // length — misses are PENALIZED (not just unrewarded) so a strong feature
  // hit on a 0.1-mi stub cannot outrank a genuinely right-sized trail
  if (c.targetMiles != null) {
    var delta = Math.abs(sig.lengthMi - c.targetMiles);
    var pts = Math.min(30, Math.max(-15, 30 - 12 * delta));
    score += pts;
    if (pts > 18) reasons.push(lenTxt + ' — right at your ~' + c.targetMiles.toFixed(1) + ' mi ask');
    else if (pts > 6) reasons.push(lenTxt + ' — near your ~' + c.targetMiles.toFixed(1) + ' mi ask');
  }
  if (c.maxMiles != null) {
    if (sig.lengthMi <= c.maxMiles) { score += 20; reasons.push(lenTxt + ' — under your ' + c.maxMiles.toFixed(1) + ' mi cap'); }
    else score += Math.max(-15, -30 * ((sig.lengthMi - c.maxMiles) / Math.max(c.maxMiles, 0.5)));
  }
  if (c.minMiles != null) {
    if (sig.lengthMi >= c.minMiles) { score += 20; reasons.push(lenTxt + ' — over your ' + c.minMiles.toFixed(1) + ' mi floor'); }
    else score += Math.max(-15, -30 * ((c.minMiles - sig.lengthMi) / Math.max(c.minMiles, 0.5)));
  }

  // near-zero-length "trails" are connector stubs in this seed — demote them
  if (sig.lengthMi < 0.15) score -= 10;

  // region
  if (c.region != null) {
    if (sig.region === c.region) { score += 25; reasons.push('in ' + c.region.replace(/, WA$/, '')); }
    else score -= 10;
  }

  // loop / out-and-back (start≈end within 120 m, same rule as the app map)
  if (c.loop === true) {
    if (sig.isLoop) { score += 15; reasons.push('track closes into a loop'); }
    else score -= 8;
  } else if (c.loop === false) {
    if (!sig.isLoop) { score += 15; reasons.push('out-and-back track'); }
    else score -= 8;
  }

  // name-inferable features
  for (var i = 0; i < c.features.length; i++) {
    var key = c.features[i];
    for (var k = 0; k < FEATURE_LEXICON.length; k++) {
      if (FEATURE_LEXICON[k].key !== key) continue;
      if (FEATURE_LEXICON[k].name.test(sig.nameLower)) {
        score += 18;
        reasons.push('name mentions a ' + key);
      } else {
        score -= 2; // asked-for feature with no evidence: mild, not fatal
      }
      break;
    }
  }

  // difficulty (proxy — honest about it)
  if (c.difficulty != null) {
    var proxy = _difficultyProxy(sig);
    if (proxy === c.difficulty) {
      score += 8;
      reasons.push('reads ' + c.difficulty + ' (length/name proxy — no elevation data)');
    } else if ((proxy === 'hard' && c.difficulty === 'easy') || (proxy === 'easy' && c.difficulty === 'hard')) {
      score -= 6;
    }
  }

  // demote bare road/street segments once the user expressed any hiking intent
  if (_looksLikeStreet(sig.nameLower)) score -= 6;

  return { score: score, reasons: reasons };
}

function _hasAnyCriteria(c) {
  return !!(c && (c.targetMiles != null || c.minMiles != null || c.maxMiles != null ||
    c.region != null || c.difficulty != null || c.loop != null || c.features.length));
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * discover(query, trails, opts?) → Promise resolving:
 * {
 *   ok, backend: 'prompt-api' | 'rules',
 *   criteria: {targetMiles,minMiles,maxMiles,region,features[],difficulty,loop,uninferable[]},
 *   notes: [ ...honest caveats... ],
 *   results: [ { id, name, region, lengthMi, isLoop, score, reason } ]  // ranked
 * }
 * opts: { limit (default 10), forceRules (skip AI even if present) }
 * Never rejects, never throws.
 */
async function discover(query, trails, opts) {
  var options = opts || {};
  var limit = (typeof options.limit === 'number' && options.limit > 0) ? Math.floor(options.limit) : 10;

  var out = { ok: false, backend: 'rules', criteria: null, notes: [], results: [] };
  try {
    var list = _normalizeTrails(trails);
    if (!list.length) {
      out.notes.push('no trails supplied — pass trails.min.json (FeatureCollection) or State.routes');
      return out;
    }

    // 1) parse the query — rules always run; AI (same model path as edgeAI)
    //    refines on top when actually usable
    var ruleCriteria = ruleParseQuery(query);
    var criteria = ruleCriteria;
    if (!options.forceRules) {
      try {
        var ai = await _aiParseQuery(query, ruleCriteria);
        if (ai) { criteria = ai; out.backend = 'prompt-api'; }
      } catch (_e) { /* stay on rules */ }
    }
    out.criteria = criteria;

    if (!_hasAnyCriteria(criteria)) {
      out.notes.push('no usable criteria found in the query — returning trails ranked by name relevance only');
    }
    for (var un = 0; un < criteria.uninferable.length; un++) {
      out.notes.push('"' + criteria.uninferable[un] + '" is not in the offline seed (names + geometry only) — not scored');
    }

    // 2) score every trail locally
    var scored = [];
    for (var i = 0; i < list.length; i++) {
      var sig = _signalsFor(list[i]);
      if (!sig) continue;
      var s = _scoreTrail(sig, criteria);
      // tiny lexical nudge: query words appearing verbatim in the name
      try {
        var qWords = String(query || '').toLowerCase().match(/[a-z]{4,}/g) || [];
        for (var w = 0; w < qWords.length; w++) {
          if (sig.nameLower.indexOf(qWords[w]) !== -1) { s.score += 3; break; }
        }
      } catch (_e2) { /* ignore */ }
      scored.push({ sig: sig, score: s.score, reasons: s.reasons });
    }

    // 3) rank, keep positive-signal rows first, cap at limit
    scored.sort(function (a, b) {
      return b.score - a.score || a.sig.lengthMi - b.sig.lengthMi;
    });
    var top = scored.slice(0, limit);

    out.results = top.map(function (row) {
      var sig = row.sig;
      var reason = row.reasons.length
        ? row.reasons.slice(0, 3).join('; ')
        : sig.lengthMi.toFixed(1) + ' mi ' + (sig.isLoop ? 'loop' : 'out-and-back') +
          ' in ' + (sig.region ? sig.region.replace(/, WA$/, '') : 'the seed area');
      return {
        id: sig.id,
        name: sig.name,
        region: sig.region,
        lengthMi: Math.round(sig.lengthMi * 100) / 100,
        isLoop: sig.isLoop,
        score: Math.round(row.score * 10) / 10,
        reason: reason,
      };
    });
    out.ok = true;
    return out;
  } catch (_e) {
    out.notes.push('discovery failed safely: ' + ((_e && _e.message) || 'unknown error'));
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Exports — classic script + CommonJS, both guarded                   */
/* ------------------------------------------------------------------ */

var _API = {
  discover: discover,
  ruleParseQuery: ruleParseQuery,
  DISCOVER_REGIONS: DISCOVER_REGIONS,
  CRITERIA_SCHEMA: CRITERIA_SCHEMA,
};

try {
  if (typeof globalThis !== 'undefined') globalThis.TrailDiscover = _API;
} catch (_e) { /* ignore */ }

try {
  if (typeof module !== 'undefined' && module.exports) module.exports = _API;
} catch (_e) { /* ignore */ }
