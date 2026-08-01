/**
 * edgeAI.js — OpenCairn PWA in-browser edge-AI voice module.
 *
 * Turns speech (or typed text) into the hiking function-call format:
 *   {"calls":[{"name":"drop_cairn","arguments":{"label":"lunch spot"}}]}
 *
 * PROGRESSIVE by design — every browser API is feature-detected and wrapped
 * in try/catch. On Safari / Firefox / old Chrome nothing here ever throws at
 * load time or call time; capability simply degrades:
 *
 *   Tier 1: Chrome built-in AI (Gemini Nano) via the Prompt API
 *           ('LanguageModel' global, or legacy window.ai.languageModel),
 *           with STRUCTURED OUTPUT (responseConstraint JSON schema).
 *   Tier 2: [FUTURE HOOK] WebGPU / WebLLM "Feedseed" backend — see
 *           registerInterpreterBackend() below. NOT implemented here.
 *   Tier 3: Rule-based typed-intent fallback (always available).
 *
 * STT: Web Speech API (SpeechRecognition / webkitSpeechRecognition) when
 * present; otherwise the module reports "voice unavailable on this browser"
 * and the app should offer typed input routed through interpret(text).
 *
 * Load as an ES module:  <script type="module" src="./edgeAI.js"></script>
 * Exports: isVoiceAvailable(), interpret(text), startVoiceTurn(), plus
 * helpers getStatus(), warmUp(), registerInterpreterBackend().
 * Also attached (guarded) to globalThis.EdgeAI for non-import consumers.
 */

'use strict';

import { retrieve, snap, namesFromTrails } from './retrieval_decode.mjs';

/* ------------------------------------------------------------------ */
/* Tool catalog — the 8 hiking tools                                   */
/* ------------------------------------------------------------------ */

const TOOL_NAMES = [
  'dial_emergency',
  'control_music',
  'query_waypoint',
  'list_waypoints',
  'drop_cairn',
  'distance_to_waypoint',
  'check_off_route',
  'get_location',
];

const SYSTEM_PROMPT = [
  'You are the offline voice brain of OpenCairn, a hiking PWA.',
  'Convert the user\'s utterance into zero or more tool calls.',
  'Available tools (name — arguments):',
  '1. dial_emergency — {} : call emergency services (SOS, 911, help, injured).',
  '2. control_music — {"action": one of "play","pause","stop","skip_next","skip_previous","volume_up","volume_down"} : control music playback.',
  '3. query_waypoint — {"name": string} : get info about a named waypoint.',
  '4. list_waypoints — {} : list all saved waypoints.',
  '5. drop_cairn — {"label": string (optional)} : mark/save the current spot as a waypoint (a "cairn").',
  '6. distance_to_waypoint — {"name": string} : distance from here to a named waypoint.',
  '7. check_off_route — {} : check whether the hiker has strayed off the planned route.',
  '8. get_location — {} : report current GPS location/coordinates.',
  'Respond ONLY with JSON of the exact shape {"calls":[{"name":"...","arguments":{...}}]}.',
  'Use an empty calls array if the utterance matches no tool. Never invent tool names.',
].join('\n');

/** JSON schema used as the Prompt API responseConstraint (structured output). */
const CALLS_SCHEMA = {
  type: 'object',
  required: ['calls'],
  additionalProperties: false,
  properties: {
    calls: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'arguments'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', enum: TOOL_NAMES.slice() },
          arguments: {
            type: 'object',
            additionalProperties: false,
            properties: {
              action: {
                type: 'string',
                enum: ['play', 'pause', 'stop', 'skip_next', 'skip_previous', 'volume_up', 'volume_down'],
              },
              name: { type: 'string' },
              label: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

/* ------------------------------------------------------------------ */
/* Feature detection (all guarded — safe on any browser / any realm)   */
/* ------------------------------------------------------------------ */

/**
 * Detect the Chrome built-in AI Prompt API.
 * Returns { api, flavor: 'modern' | 'legacy' } or null.
 *  - modern: global `LanguageModel` (Chrome 128+ origin trial / stable Prompt API)
 *  - legacy: `window.ai.languageModel` (earlier Chrome builds)
 */
function detectPromptAPI() {
  try {
    // typeof-check is safe even when the global does not exist.
    if (typeof LanguageModel !== 'undefined' &&
        LanguageModel &&
        typeof LanguageModel.create === 'function') {
      return { api: LanguageModel, flavor: 'modern' };
    }
  } catch (_e) { /* ignore */ }
  try {
    if (typeof window !== 'undefined' &&
        window.ai &&
        window.ai.languageModel &&
        typeof window.ai.languageModel.create === 'function') {
      return { api: window.ai.languageModel, flavor: 'legacy' };
    }
  } catch (_e) { /* ignore */ }
  return null;
}

/** Detect Web Speech API speech recognition. Returns the constructor or null. */
function detectSpeechRecognition() {
  try {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  } catch (_e) {
    return null;
  }
}

/** Detect WebGPU (only used to report future WebLLM viability — see hook below). */
function detectWebGPU() {
  try {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  } catch (_e) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Tier 1 — Gemini Nano (Chrome built-in AI, Prompt API)               */
/* ------------------------------------------------------------------ */

let _nanoSession = null;          // cached live session
let _nanoState = 'unknown';       // 'available'|'downloadable'|'downloading'|'unavailable'|'unknown'
let _nanoDownloadProgress = null; // 0..1 while downloading, else null

/* App-level veto on the Nano path. `create()` on a 'downloadable' model kicks
 * off a ~GB model download, so the host app MUST be able to switch this tier
 * off (lite tier / Data Saver). null = ungated (standalone use of this module);
 * false = Nano never invoked (rules/pluggable backends still run). */
let _nanoEnabled = null;
function setNanoEnabled(v) { _nanoEnabled = (v == null) ? null : !!v; }

/**
 * Query model availability, normalized to the modern vocabulary:
 * 'available' | 'downloadable' | 'downloading' | 'unavailable'.
 */
async function nanoAvailability() {
  const found = detectPromptAPI();
  if (!found) { _nanoState = 'unavailable'; return 'unavailable'; }
  try {
    if (found.flavor === 'modern' && typeof found.api.availability === 'function') {
      const s = await found.api.availability();
      _nanoState = (s === 'available' || s === 'downloadable' || s === 'downloading')
        ? s : 'unavailable';
      return _nanoState;
    }
    if (found.flavor === 'legacy' && typeof found.api.capabilities === 'function') {
      const caps = await found.api.capabilities();
      const legacy = caps && caps.available; // 'readily' | 'after-download' | 'no'
      _nanoState = legacy === 'readily' ? 'available'
        : legacy === 'after-download' ? 'downloadable'
        : 'unavailable';
      return _nanoState;
    }
    // API object exists but exposes no availability probe — try optimistically.
    _nanoState = 'available';
    return _nanoState;
  } catch (_e) {
    _nanoState = 'unavailable';
    return 'unavailable';
  }
}

/**
 * Create (or reuse) a Gemini Nano session primed with the hiking system
 * prompt. Handles the 'downloadable'/'downloading' states by letting
 * create() trigger/await the download, reporting progress via monitor.
 * Returns the session, or null when the model can't be used.
 */
async function getNanoSession() {
  if (_nanoEnabled === false) return null; // app vetoed (lite tier / Data Saver) — never trigger the download
  if (_nanoSession) return _nanoSession;
  const found = detectPromptAPI();
  if (!found) return null;

  const state = await nanoAvailability();
  if (state === 'unavailable') return null;
  // 'available'    -> create() resolves immediately.
  // 'downloadable' -> create() kicks off the model download, then resolves.
  // 'downloading'  -> create() awaits the in-flight download, then resolves.
  if (state === 'downloadable' || state === 'downloading') _nanoState = 'downloading';

  try {
    const monitor = (m) => {
      try {
        m.addEventListener('downloadprogress', (e) => {
          try {
            _nanoDownloadProgress =
              (e && typeof e.loaded === 'number')
                ? (typeof e.total === 'number' && e.total > 0 ? e.loaded / e.total : e.loaded)
                : null;
          } catch (_e2) { /* ignore */ }
        });
      } catch (_e2) { /* ignore */ }
    };

    if (found.flavor === 'modern') {
      _nanoSession = await found.api.create({
        initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
        monitor,
      });
    } else {
      _nanoSession = await found.api.create({
        systemPrompt: SYSTEM_PROMPT,
        monitor,
      });
    }
    _nanoState = 'available';
    _nanoDownloadProgress = null;
    return _nanoSession;
  } catch (_e) {
    _nanoSession = null;
    _nanoState = 'unavailable';
    return null;
  }
}

/**
 * Interpret text with Gemini Nano using structured output.
 * Returns a validated calls object, or null so the caller can fall back.
 */
async function nanoInterpret(text) {
  const session = await getNanoSession();
  if (!session) return null;
  let raw = null;
  try {
    // Preferred: structured output via responseConstraint (JSON schema).
    raw = await session.prompt(text, { responseConstraint: CALLS_SCHEMA });
  } catch (_e) {
    // Older builds may not accept options / responseConstraint — retry plain.
    try {
      raw = await session.prompt(
        text + '\n\nRespond ONLY with JSON: {"calls":[{"name":"...","arguments":{...}}]}'
      );
    } catch (_e2) {
      // Session may have been destroyed/crashed — drop it so we re-create next time.
      _nanoSession = null;
      return null;
    }
  }
  return parseAndValidateCalls(raw);
}

/** Lenient JSON extraction + strict validation against the tool catalog. */
function parseAndValidateCalls(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let obj = null;
  try {
    obj = JSON.parse(raw);
  } catch (_e) {
    // Model may have wrapped JSON in prose/markdown — grab the first {...} block.
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) obj = JSON.parse(m[0]);
    } catch (_e2) { /* ignore */ }
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.calls)) return null;
  const calls = [];
  for (const c of obj.calls) {
    if (!c || typeof c !== 'object') continue;
    if (TOOL_NAMES.indexOf(c.name) === -1) continue; // never pass invented tools through
    const args = (c.arguments && typeof c.arguments === 'object') ? c.arguments : {};
    calls.push({ name: c.name, arguments: args });
  }
  return { calls };
}

/* ------------------------------------------------------------------ */
/* Retrieval grounding — MoM's "SELECT a real name, never invent one"  */
/* ------------------------------------------------------------------ */

/**
 * Tools whose named argument is a CANONICAL TRAIL NAME (must resolve to a real
 * trail), and which arg key holds it. drop_cairn.label is intentionally NOT
 * here — that's a free-form user label, not a trail lookup.
 */
const NAME_SLOT_TOOLS = { query_waypoint: 'name', distance_to_waypoint: 'name' };

/* The app injects a name source (built from the loaded trails) + an optional GPS
 * getter. Until configured, grounding is a no-op and every tier behaves exactly
 * as before. This is the browser half of MoM: the name slot is resolved by
 * retrieval over real trail names, so a garbled/hallucinated name collapses onto
 * the nearest REAL one instead of shipping an invented trail. */
let _nameRecords = null;     // cached [{name, region, lat, lon}]
let _getNames = null;        // () => trails-or-records  (lazy, cached)
let _getGps = null;          // () => [lat, lon] | null
let _snapThreshold = 0.5;    // below this, keep the raw string (honest "no match")

/**
 * configureGrounding({ getNames, getGps, threshold })
 *  - getNames:  () => trails.min.json (any shape) OR a [{name,...}] array.
 *  - getGps:    () => [lat, lon] | null   (proximity tie-break; optional)
 *  - threshold: min retrieval score to accept a snap (default 0.5)
 */
function configureGrounding(cfg) {
  if (!cfg) return;
  if (typeof cfg.getNames === 'function') { _getNames = cfg.getNames; _nameRecords = null; }
  if (typeof cfg.getGps === 'function') _getGps = cfg.getGps;
  if (typeof cfg.threshold === 'number') _snapThreshold = cfg.threshold;
}

function _names() {
  if (_nameRecords) return _nameRecords;
  if (!_getNames) return null;
  try {
    const raw = _getNames();
    const recs = Array.isArray(raw) && raw[0] && typeof raw[0].name === 'string'
      ? raw
      : namesFromTrails(raw);
    _nameRecords = (recs && recs.length) ? recs : null;
  } catch (_e) { _nameRecords = null; }
  return _nameRecords;
}

/**
 * retrieveCandidates(query, k) -> [canonicalName, ...] for the grammar enum.
 * Uses the configured grounding name source (+ GPS proximity). Returns [] when
 * no source is configured — callers then fall back to a free-string slot.
 */
function retrieveCandidates(query, k) {
  const names = _names();
  if (!names) return [];
  let gps = null;
  try { if (_getGps) { const g = _getGps(); if (Array.isArray(g) && g.length >= 2) gps = [g[0], g[1]]; } } catch (_e) { /* ignore */ }
  try {
    return retrieve(String(query || ''), names, { k: k || 8, gps }).map((c) => c.name);
  } catch (_e) { return []; }
}

/**
 * retrieveTopScore(query) -> number in [0,1]. The best retrieval score of the
 * query against the configured trail-name index (0 when no source configured or
 * on any error). Used by the Feedseed negative gate to decide whether an
 * utterance carries a trail-name signal worth firing a command for.
 */
function retrieveTopScore(query) {
  const names = _names();
  if (!names) return 0;
  let gps = null;
  try { if (_getGps) { const g = _getGps(); if (Array.isArray(g) && g.length >= 2) gps = [g[0], g[1]]; } } catch (_e) { /* ignore */ }
  try {
    const cands = retrieve(String(query || ''), names, { k: 1, gps });
    return (cands && cands.length && typeof cands[0].score === 'number') ? cands[0].score : 0;
  } catch (_e) { return 0; }
}

/**
 * Snap trail-name arguments to real canonical names. Pure over its input; safe
 * on any {calls} object. When no name source is configured it returns the input
 * unchanged. Attaches `_grounded` metadata (the retrieval candidates + whether
 * the name was changed) so the UI can show "did you mean" / confidence.
 */
function groundCalls(obj) {
  const names = _names();
  if (!names || !obj || !Array.isArray(obj.calls)) return obj;
  let gps = null;
  try { if (_getGps) { const g = _getGps(); if (Array.isArray(g) && g.length >= 2) gps = [g[0], g[1]]; } } catch (_e) { /* ignore */ }
  for (const c of obj.calls) {
    const key = NAME_SLOT_TOOLS[c && c.name];
    if (!key) continue;
    const spoken = c.arguments && c.arguments[key];
    if (typeof spoken !== 'string' || !spoken.trim()) continue;
    let cands;
    try { cands = retrieve(spoken, names, { k: 8, gps }); } catch (_e) { continue; }
    if (!cands || !cands.length) continue;
    const picked = snap(spoken, cands) || cands[0];
    c._grounded = {
      spoken,
      resolved: picked.name,
      score: picked.score,
      changed: picked.name !== spoken,
      accepted: picked.score >= _snapThreshold,
      candidates: cands.slice(0, 3).map((x) => ({ name: x.name, score: x.score })),
    };
    // Only overwrite when retrieval is confident — otherwise keep what was heard
    // (honest: a name with no real match stays as-is; the app can say "no trail").
    if (picked.score >= _snapThreshold) c.arguments[key] = picked.name;
  }
  return obj;
}

/* ------------------------------------------------------------------ */
/* Tier 2 — WebGPU / transformers.js "Feedseed" backend (pluggable)    */
/* ------------------------------------------------------------------ */

/**
 * Pluggable interpreter backend slot, tried AFTER Gemini Nano and BEFORE the
 * rule-based fallback. A later WebLLM/Feedseed module (running a small model
 * over WebGPU) registers itself like:
 *
 *   import { registerInterpreterBackend } from './edgeAI.js';
 *   registerInterpreterBackend({
 *     name: 'feedseed-webllm',
 *     // return true when this backend can run (e.g. WebGPU present, model cached)
 *     isAvailable: async () => !!navigator.gpu,
 *     // return {"calls":[...]} or null to pass through to the next tier
 *     interpret: async (text) => { ... },
 *   });
 *
 * detectWebGPU() above already reports whether such a backend would be viable
 * on this browser (surfaced in getStatus().webgpu). Intentionally NOT
 * implemented here — this file ships no model weights and no WebLLM code.
 */
let _pluggableBackend = null;

function registerInterpreterBackend(backend) {
  try {
    if (backend && typeof backend.interpret === 'function') {
      _pluggableBackend = backend;
      return true;
    }
  } catch (_e) { /* ignore */ }
  return false;
}

async function pluggableInterpret(text) {
  if (!_pluggableBackend) return null;
  try {
    if (typeof _pluggableBackend.isAvailable === 'function') {
      const ok = await _pluggableBackend.isAvailable();
      if (!ok) return null;
    }
    const out = await _pluggableBackend.interpret(text);
    if (out && Array.isArray(out.calls)) {
      // Revalidate — third-party backends get no trust either.
      return parseAndValidateCalls(JSON.stringify(out));
    }
  } catch (_e) { /* ignore */ }
  return null;
}

/* ------------------------------------------------------------------ */
/* Tier 3 — rule-based typed-intent fallback (always works)            */
/* ------------------------------------------------------------------ */

function cleanName(s) {
  return String(s || '')
    .split(/\s+(?:and|then|also)\s+/i)[0] // stop at a compound clause: "X and pause the music"
    .replace(/^(the|a|an|my)\s+/i, '')
    .replace(/[?.!,]+$/g, '')
    .trim();
}

/**
 * Deterministic keyword/regex intent parser. Never throws, always returns
 * {"calls":[...]} (possibly empty). This is both the no-AI fallback and the
 * typed-input path.
 */
function ruleInterpret(text) {
  const calls = [];
  const t = String(text == null ? '' : text).toLowerCase().trim();
  if (!t) return { calls };

  try {
    // 1. dial_emergency
    if (/\b(emergency|sos|911|112|999|call for help|i'?m (hurt|injured|lost and hurt)|mayday)\b/.test(t)) {
      calls.push({ name: 'dial_emergency', arguments: {} });
    }

    // 2. control_music
    if (/\b(music|song|track|playlist|volume|playback)\b/.test(t) ||
        /\b(play|pause|resume|skip|next track|previous track)\b/.test(t)) {
      let action = null;
      if (/\b(pause|stop)\b/.test(t)) action = /\bstop\b/.test(t) ? 'stop' : 'pause';
      else if (/\b(skip|next)\b/.test(t)) action = 'skip_next';
      else if (/\b(previous|back|last (song|track))\b/.test(t)) action = 'skip_previous';
      else if (/\bvolume\b/.test(t) && /\b(up|louder|raise|increase)\b/.test(t)) action = 'volume_up';
      else if (/\bvolume\b/.test(t) && /\b(down|quieter|lower|decrease)\b/.test(t)) action = 'volume_down';
      else if (/\b(play|resume|start)\b/.test(t)) action = 'play';
      if (action) calls.push({ name: 'control_music', arguments: { action } });
    }

    // 4. list_waypoints (before query_waypoint so "what waypoints..." wins)
    if (/\b(list|show|what|which)\b.*\bwaypoints?\b/.test(t) ||
        /\bwaypoints?\b.*\b(do i have|are (there|saved|nearby))\b/.test(t)) {
      calls.push({ name: 'list_waypoints', arguments: {} });
    }

    // 6. distance_to_waypoint (before query_waypoint — "how far to X" is more specific)
    let m = t.match(/\b(?:how far(?: away)?(?: is it)?(?: to| is| from here to)?|distance to|how many (?:miles|kilometers|km) to)\s+(.+)/);
    if (m && cleanName(m[1])) {
      calls.push({ name: 'distance_to_waypoint', arguments: { name: cleanName(m[1]) } });
    }

    // 3. query_waypoint
    if (!m) {
      const q = t.match(/\b(?:where is|tell me about|what is at|info(?:rmation)? (?:on|about)|describe|look up)\s+(.+)/);
      if (q && cleanName(q[1]) && !/\bwaypoints\b/.test(q[1])) {
        calls.push({ name: 'query_waypoint', arguments: { name: cleanName(q[1]) } });
      }
    }

    // 5. drop_cairn
    const d = t.match(/\b(?:drop|leave|place|build|set)\s+(?:a\s+)?cairn(?:\s+(?:called|named|labell?ed|for|at)\s+(.+))?/) ||
              t.match(/\b(?:mark|save|remember)\s+(?:this|my|the current)\s+(?:spot|place|location|position)(?:\s+as\s+(.+))?/);
    if (d) {
      const args = {};
      if (d[1] && cleanName(d[1])) args.label = cleanName(d[1]);
      calls.push({ name: 'drop_cairn', arguments: args });
    }

    // 7. check_off_route
    if (/\b(off[ -](route|trail|track|course|path)|off (the |my )(route|trail|track|course|path)|still on (the )?(route|trail|track|path)|am i (lost|on (the )?(right )?(route|trail|track|path)))\b/.test(t)) {
      calls.push({ name: 'check_off_route', arguments: {} });
    }

    // 8. get_location
    if (/\b(where am i|my (current )?(location|position|coordinates)|current location|gps (position|fix|coordinates)|what are my coordinates)\b/.test(t)) {
      calls.push({ name: 'get_location', arguments: {} });
    }
  } catch (_e) {
    // Regex engine problems should never take the app down.
  }

  return { calls };
}

/* ------------------------------------------------------------------ */
/* STT — Web Speech API                                                */
/* ------------------------------------------------------------------ */

/* The one live recognizer's cancel hook — lets the app kill the mic the moment
 * its voice UI closes (a recognizer otherwise keeps the mic hot until its own
 * timeout, ~9s in the background). */
let _activeListenCancel = null;

/**
 * Abort any in-flight listen: stops the recognizer (mic off) and clears its
 * safety timer. The pending startVoiceTurn()/listenOnce() promise resolves
 * { ok:false, reason:'cancelled' }. Safe to call any time; never throws.
 */
function cancelListen() {
  const c = _activeListenCancel;
  _activeListenCancel = null;
  if (c) { try { c(); } catch (_e) { /* ignore */ } }
}

/**
 * Capture a single utterance from the microphone.
 * Resolves { ok, transcript, reason }. Never rejects, never throws.
 */
function listenOnce(opts) {
  const options = opts || {};
  return new Promise((resolve) => {
    const Ctor = detectSpeechRecognition();
    if (!Ctor) {
      resolve({ ok: false, transcript: '', reason: 'voice unavailable on this browser' });
      return;
    }
    let rec = null;
    let settled = false;
    let timer = null;
    const done = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      _activeListenCancel = null;
      try { if (rec) rec.abort(); } catch (_e) { /* ignore */ }
      resolve(result);
    };
    // expose the abort path so the app can cut the mic on sheet close
    _activeListenCancel = () => done({ ok: false, transcript: '', reason: 'cancelled' });
    try {
      rec = new Ctor();
      rec.lang = options.lang || 'en-US';
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onresult = (e) => {
        try {
          const transcript =
            e && e.results && e.results[0] && e.results[0][0]
              ? String(e.results[0][0].transcript || '')
              : '';
          done(transcript
            ? { ok: true, transcript, reason: null }
            : { ok: false, transcript: '', reason: 'no speech recognized' });
        } catch (_e2) {
          done({ ok: false, transcript: '', reason: 'speech result error' });
        }
      };
      rec.onerror = (e) => {
        const code = e && e.error ? String(e.error) : 'unknown';
        // 'not-allowed'/'service-not-allowed' => mic permission denied.
        done({ ok: false, transcript: '', reason: 'speech error: ' + code });
      };
      rec.onend = () => {
        done({ ok: false, transcript: '', reason: 'no speech recognized' });
      };

      // Safety timeout so a hung recognizer can't wedge the voice turn.
      const ms = typeof options.timeoutMs === 'number' ? options.timeoutMs : 12000;
      timer = setTimeout(() => done({ ok: false, transcript: '', reason: 'listen timeout' }), ms);

      rec.start();
    } catch (_e) {
      done({ ok: false, transcript: '', reason: 'could not start microphone' });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * True when this browser can do the mic path (Web Speech API present).
 * Interpretation itself is ALWAYS available (rule fallback), so when this
 * returns false the app should show a text box wired to interpret(text)
 * and the message 'voice unavailable on this browser'.
 */
function isVoiceAvailable() {
  return !!detectSpeechRecognition();
}

/**
 * Text -> {"calls":[{"name":...,"arguments":{...}}]}.
 * Backend cascade: Gemini Nano (structured output) -> pluggable WebLLM hook
 * -> rule-based parser. Never throws; worst case returns {calls:[]}.
 */
async function interpret(text) {
  let result = null;
  try {
    result = await nanoInterpret(text);
  } catch (_e) { /* fall through */ }
  if (!result) {
    try {
      result = await pluggableInterpret(text);
    } catch (_e) { /* fall through */ }
  }
  if (!result) {
    try {
      result = ruleInterpret(text);
    } catch (_e) {
      result = { calls: [] };
    }
  }
  // MoM grounding: snap any trail-name slot to a real canonical name. No-op
  // until configureGrounding() is called; benefits every tier above uniformly.
  try { return groundCalls(result); } catch (_e) { return result; }
}

/**
 * One full voice turn: mic -> transcript -> interpret -> calls.
 * Resolves:
 *   { ok: true,  transcript, calls: [...], backend }
 *   { ok: false, transcript: '', calls: [], reason: 'voice unavailable on this browser' | ... }
 * Never rejects, never throws.
 */
async function startVoiceTurn(opts) {
  try {
    if (!isVoiceAvailable()) {
      return { ok: false, transcript: '', calls: [], reason: 'voice unavailable on this browser' };
    }
    const heard = await listenOnce(opts);
    if (!heard.ok) {
      return { ok: false, transcript: heard.transcript, calls: [], reason: heard.reason };
    }
    const result = await interpret(heard.transcript);
    return {
      ok: true,
      transcript: heard.transcript,
      calls: (result && result.calls) || [],
      backend: _nanoSession ? 'gemini-nano'
        : _pluggableBackend ? _pluggableBackend.name || 'pluggable'
        : 'rules',
      reason: null,
    };
  } catch (_e) {
    return { ok: false, transcript: '', calls: [], reason: 'voice turn failed' };
  }
}

/**
 * Optional: pre-create the Nano session (kicks off the model download when
 * state is 'downloadable'). Safe to call on app start; never throws.
 */
async function warmUp() {
  try { await getNanoSession(); } catch (_e) { /* ignore */ }
  return getStatus();
}

/** Capability snapshot for the UI. Never throws. */
async function getStatus() {
  let nano = 'unavailable';
  try { nano = await nanoAvailability(); } catch (_e) { /* ignore */ }
  return {
    voice: isVoiceAvailable(),                       // mic path (Web Speech API)
    nano,                                            // 'available'|'downloadable'|'downloading'|'unavailable'
    nanoDownloadProgress: _nanoDownloadProgress,     // 0..1 while downloading, else null
    webgpu: detectWebGPU(),                          // future WebLLM/Feedseed viability
    pluggableBackend: _pluggableBackend ? (_pluggableBackend.name || 'pluggable') : null,
    nanoEnabled: _nanoEnabled !== false,             // false when the app vetoed the Nano path
    interpreter: (nano === 'available' && _nanoEnabled !== false) ? 'gemini-nano'
      : _pluggableBackend ? (_pluggableBackend.name || 'pluggable')
      : 'typed-fallback',
    message: isVoiceAvailable() ? null : 'voice unavailable on this browser',
  };
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

export {
  isVoiceAvailable,
  interpret,
  startVoiceTurn,
  cancelListen,
  setNanoEnabled,
  warmUp,
  getStatus,
  registerInterpreterBackend,
  configureGrounding,
  groundCalls,
  retrieveCandidates,
  retrieveTopScore,
  ruleInterpret,
  TOOL_NAMES,
  CALLS_SCHEMA,
  SYSTEM_PROMPT,
  parseAndValidateCalls,
};

// Convenience global for non-module consumers (guarded).
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.EdgeAI = {
      isVoiceAvailable,
      interpret,
      startVoiceTurn,
      cancelListen,
      setNanoEnabled,
      warmUp,
      getStatus,
      registerInterpreterBackend,
      configureGrounding,
      groundCalls,
      TOOL_NAMES,
      CALLS_SCHEMA,
    };
  }
} catch (_e) { /* ignore */ }
