/**
 * feedseedBackend.js — Tier-2 edge-AI backend: OUR fine-tuned Feedseed
 * (Gemma3-270M, vocab-trimmed) running IN THE BROWSER on WebGPU via
 * transformers.js (ONNX Runtime Web). This is the "download the full app,
 * including the model, from a URL — no store, no cloud" path.
 *
 * It registers itself into edgeAI's pluggable backend slot (tried AFTER Chrome
 * Nano, BEFORE the rule fallback). Until the user opts in and the ~90MB model is
 * cached, isAvailable() returns false and the edgeAI cascade simply skips it —
 * so this file is safe to import on every browser and never blocks load.
 *
 * Design contract (honest):
 *  - Runtime + weights are SELF-HOSTED (CSP/offline): no CDN, no remote models.
 *      vendor/transformers/  -> transformers.js dist + ort-*.wasm
 *      models/feedseed-web/  -> ONNX weights (q4) + tokenizer (from the box)
 *  - The model produces the tool-call STRUCTURE; the trail-NAME slot is grounded
 *    by retrieval (edgeAI.groundCalls / retrieval_decode.mjs), so a name can
 *    never be hallucinated — the browser twin of MoM's grammar enum.
 *  - Nothing auto-downloads. download() is user-gated (a button on flagship
 *    tier). First call fetches + caches; every later visit loads from cache,
 *    fully offline.
 */

'use strict';

import {
  registerInterpreterBackend,
  parseAndValidateCalls,
  groundCalls,
  retrieveCandidates,
  retrieveTopScore,
  ruleInterpret,
  TOOL_NAMES,
} from './edgeAI.js';
import { Grammar, buildFcGrammar, makeGrammarProcessor } from './grammarDecode.mjs';

/* ------------------------------------------------------------------ */
/* Feedseed's OWN system prompt — the EXACT schema it was SFT'd on.     */
/* NOTE: this differs from edgeAI's Nano prompt (arg keys: `waypoint`   */
/* not `name`, `next`/`previous` not `skip_*`, service/threshold_m/note */
/* extras). The model emits the TRAINING schema; normalizeFeedseedCalls */
/* below remaps it to the app's schema before validation/execution.     */
/* ------------------------------------------------------------------ */
const FEEDSEED_SYSTEM_PROMPT =
  "You are the on-device voice command layer for a hiking app. Convert the " +
  "user's spoken request into tool calls. Reply ONLY with JSON of the form " +
  '{"calls":[{"name":<tool>,"arguments":{...}}]}. Available tools: ' +
  'dial_emergency(service:sos|ranger|contact, message?), ' +
  'control_music(action:play|pause|next|previous|stop|volume_up|volume_down, volume?), ' +
  'query_waypoint(name), list_waypoints(), drop_cairn(label?, note?), ' +
  'distance_to_waypoint(waypoint, unit:km|mi|m?), check_off_route(threshold_m?), ' +
  'get_location(). A request only counts if it EXPLICITLY asks for one of these ' +
  'actions. Do NOT invent a command. If the user is just talking, making small ' +
  'talk, greeting, venting, describing the weather or scenery, thinking out loud, ' +
  'or asking for anything these tools do not cover, you MUST reply with exactly ' +
  '{"calls":[]} and call nothing. When unsure about a non-emergency, prefer ' +
  '{"calls":[]}. You MUST fire dial_emergency(service:sos) whenever the user ' +
  'reports an injury or is hurt, bleeding, broke something, fell, is in danger or ' +
  'stranded, or asks for help, SOS, rescue, or an ambulance — for someone else ' +
  'too. Do NOT fire dial_emergency for chit-chat, weather, scenery, or just being ' +
  'tired. Examples that call NOTHING: "what a beautiful day", "i\'m so tired", ' +
  '"what\'s the weather tomorrow", "i love these mountains".';

/* ------------------------------------------------------------------ */
/* Config — where the self-hosted runtime + model live                 */
/* ------------------------------------------------------------------ */

const CFG = {
  libUrl: new URL('./vendor/transformers/transformers.min.js', import.meta.url).href,
  wasmPath: new URL('./vendor/transformers/', import.meta.url).href,
  modelBase: new URL('./models/', import.meta.url).href, // env.localModelPath
  modelId: 'feedseed-web',                               // folder under modelBase
  // Ship fp16 (no weight quant), NOT 4-bit. MEASURED on the box: for this 270M
  // model, 4-bit weight quant (q4/q4f16) collapses tool-selection to ~16% on the
  // A/B set (a tiny model has too little redundancy for 4-bit), while fp16 tracks
  // the native model (~96%). The size cost (310MB vs 131MB) is worth it; a wrong
  // tool (or false emergency) is far more expensive than a larger download. If a
  // device's WebGPU stack can't load fp16, the edgeAI cascade falls through to
  // the deterministic rule parser rather than a broken 4-bit model.
  dtypes: ['fp16'],
  maxNewTokens: 160,
  cacheName: 'transformers-cache',                       // transformers.js browser cache
  approxBytes: 310 * 1024 * 1024,                        // fp16 — for UI copy
  // Negative gate: min retrieval top-1 score (0..1) for an utterance to count as
  // carrying a trail-name signal WHEN the rule parser found nothing. The phonetic
  // retrieval scorer is noisy (generic chit-chat floats to ~0.55-0.68 against the
  // long trail index), so this bar sits ABOVE that noise floor: a spoken real
  // trail name lands ~0.75+, chit-chat below. Empirical backstop, not a
  // classifier — the rule parser is the primary signal; this only rescues
  // name-only utterances the rule parser misses (e.g. "what is snow lake").
  negGateMinScore: 0.72,
};

/** Allow the host app to override paths/dtype before first download(). */
function configure(patch) { if (patch) Object.assign(CFG, patch); }

/* ------------------------------------------------------------------ */
/* State machine                                                       */
/* ------------------------------------------------------------------ */

let _state = 'idle';   // 'idle'|'unsupported'|'downloading'|'ready'|'error'
let _progress = 0;     // 0..1 during download
let _generator = null; // the transformers.js pipeline
let _lib = null;       // the imported transformers module
let _enabled = true;   // app veto (lite tier / Data Saver)
let _loadPromise = null;
let _lastError = null;
let _activeDtype = null; // which dtype actually loaded (q4f16 | q4)
let _LP = null;          // transformers.js LogitsProcessor class
let _LPList = null;      // transformers.js LogitsProcessorList class
let _eosIds = [];        // terminating token ids (<eos>, <end_of_turn>, config)
let _vocabSize = 0;      // for the grammar token table
let _grammarOK = false;  // did the grammar runtime capture succeed?

function setEnabled(v) { _enabled = !!v; }

function webgpuSupported() {
  try { return typeof navigator !== 'undefined' && !!navigator.gpu; } catch (_e) { return false; }
}

/** Snapshot for the UI. Never throws. */
function getState() {
  return {
    state: webgpuSupported() ? _state : 'unsupported',
    progress: _progress,
    ready: _state === 'ready',
    enabled: _enabled,
    webgpu: webgpuSupported(),
    approxBytes: CFG.approxBytes,
    dtype: _activeDtype || CFG.dtypes[0],
    grammar: _grammarOK,
    error: _lastError,
  };
}

/**
 * Has the model already been downloaded (cached) this browser? Best-effort probe
 * of the transformers.js Cache Storage bucket — lets the app show "Ready,
 * offline" without re-fetching. Returns false on any uncertainty.
 */
async function isDownloaded() {
  if (_state === 'ready') return true;
  try {
    if (typeof caches === 'undefined') return false;
    const cache = await caches.open(CFG.cacheName);
    const keys = await cache.keys();
    const needle = CFG.modelId + '/onnx/';
    return keys.some((req) => {
      try { return req.url.indexOf(CFG.modelId) !== -1 && req.url.indexOf('.onnx') !== -1; }
      catch (_e) { return false; }
    }) && keys.some((req) => { try { return req.url.indexOf(needle) !== -1; } catch (_e) { return true; } });
  } catch (_e) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Load / download                                                     */
/* ------------------------------------------------------------------ */

async function _importLib() {
  if (_lib) return _lib;
  // Dynamic import so the (multi-hundred-KB) runtime is fetched only on opt-in.
  const mod = await import(/* @vite-ignore */ CFG.libUrl);
  const t = mod && (mod.env ? mod : mod.default);
  if (!t || !t.pipeline || !t.env) throw new Error('transformers.js not found at ' + CFG.libUrl);
  // Self-hosted, offline, CSP-safe configuration.
  t.env.allowRemoteModels = false;
  t.env.allowLocalModels = true;
  t.env.localModelPath = CFG.modelBase;
  t.env.useBrowserCache = true;
  try { t.env.backends.onnx.wasm.wasmPaths = CFG.wasmPath; } catch (_e) { /* ignore */ }
  try { t.env.backends.onnx.wasm.proxy = false; } catch (_e) { /* ignore */ }
  // Single-threaded: multi-thread ORT needs SharedArrayBuffer => COOP/COEP
  // cross-origin isolation, which the PWA host may not send. WebGPU does the
  // heavy compute anyway; the wasm is just glue/fallback. One thread = no
  // isolation requirement, loads on any static host.
  try { t.env.backends.onnx.wasm.numThreads = 1; } catch (_e) { /* ignore */ }
  _lib = t;
  return t;
}

/**
 * Download (first call) or reattach (later calls) the Feedseed pipeline.
 * onProgress(0..1) fires during the initial fetch. Idempotent — concurrent
 * callers share one load. Resolves true on success, false on failure (the
 * cascade then just skips this tier). Never throws.
 */
async function download(onProgress) {
  if (_state === 'ready') return true;
  if (!webgpuSupported()) { _state = 'unsupported'; return false; }
  if (_loadPromise) return _loadPromise;

  _state = 'downloading';
  _progress = 0;
  _lastError = null;

  _loadPromise = (async () => {
    try {
      const t = await _importLib();
      const progress_callback = (p) => {
        try {
          if (p && p.status === 'progress' && typeof p.progress === 'number') {
            _progress = Math.max(0, Math.min(1, p.progress / 100));
            if (onProgress) onProgress(_progress, p);
          } else if (p && p.status === 'done') {
            if (onProgress) onProgress(_progress, p);
          }
        } catch (_e) { /* ignore */ }
      };
      // Try each dtype in the fallback chain: small WebGPU-optimized q4f16
      // first, then the more portable q4 if a device's WebGPU stack rejects
      // fp16. First success wins.
      let lastErr = null;
      for (const dtype of CFG.dtypes) {
        try {
          _generator = await t.pipeline('text-generation', CFG.modelId, {
            device: 'webgpu',
            dtype,
            progress_callback,
          });
          _activeDtype = dtype;
          _captureGrammarRuntime(t);
          _state = 'ready';
          _progress = 1;
          return true;
        } catch (err) {
          lastErr = err;
          _generator = null;
        }
      }
      throw (lastErr || new Error('no usable dtype'));
    } catch (e) {
      _lastError = (e && e.message) ? e.message : String(e);
      _state = 'error';
      _generator = null;
      return false;
    } finally {
      _loadPromise = null;
    }
  })();

  return _loadPromise;
}

/** Free the WebGPU pipeline (e.g. on low-memory). Keeps the cached weights. */
async function unload() {
  try { if (_generator && typeof _generator.dispose === 'function') await _generator.dispose(); } catch (_e) { /* ignore */ }
  _generator = null;
  if (_state === 'ready') _state = 'idle';
}

/* ------------------------------------------------------------------ */
/* Inference                                                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Grammar-constrained decoding (the browser's GBNF)                    */
/* ------------------------------------------------------------------ */

/** After a successful load, grab the LogitsProcessor classes + eos ids +
 *  vocab size so interpret() can constrain decoding to the FC grammar. */
function _captureGrammarRuntime(t) {
  try {
    _LP = t.LogitsProcessor || null;
    _LPList = t.LogitsProcessorList || null;
    const tok = _generator && _generator.tokenizer;
    const cfg = (_generator && _generator.model && _generator.model.config) || {};
    const gcfg = (_generator && _generator.model && _generator.model.generation_config) || {};
    _vocabSize = cfg.vocab_size || 48000;
    const eos = new Set();
    for (const name of ['<eos>', '<end_of_turn>']) {
      try { const e = tok.encode(name, { add_special_tokens: false }); if (e && e.length === 1) eos.add(e[0]); } catch (_e) { /* ignore */ }
    }
    for (const e of [].concat(gcfg.eos_token_id != null ? gcfg.eos_token_id : (cfg.eos_token_id != null ? cfg.eos_token_id : []))) {
      if (e != null) eos.add(e);
    }
    _eosIds = [...eos];
    _grammarOK = !!(_LP && _LPList && tok && _eosIds.length);
  } catch (_e) {
    _grammarOK = false;
  }
}

/** Build a fresh LogitsProcessorList constraining decode to the FC grammar,
 *  with the name-slot enum = retrieval candidates for `text`. Returns null to
 *  fall back to free decode (then the guardrails below do the clean-up). */
function _buildGrammarProcessors(text) {
  if (!_grammarOK) return null;
  try {
    const names = retrieveCandidates(text, 8);           // MoM enum, in-decoder
    const grammar = new Grammar(buildFcGrammar(names));   // free-string name slot if names empty
    const proc = makeGrammarProcessor(_LP, _generator.tokenizer, grammar, _eosIds, _vocabSize);
    const list = new _LPList();
    list.push(proc);
    return list;
  } catch (_e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Output guardrails — belt & suspenders. With the grammar lock the raw */
/* output is already valid app-adjacent JSON; without it (fallback),    */
/* free-form 4-bit decode can emit malformed JSON, training-schema arg  */
/* keys, or spurious calls. These layers clean it up either way.        */
/* ------------------------------------------------------------------ */

const _MUSIC_ACTIONS = new Set(['play', 'pause', 'stop', 'skip_next', 'skip_previous', 'volume_up', 'volume_down']);

/** Remap ONE call from Feedseed's training schema to the app's schema.
 *  Returns a clean {name, arguments} or null to drop the call. */
function _normalizeCall(call) {
  if (!call || TOOL_NAMES.indexOf(call.name) === -1) return null;
  const a = (call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)) ? call.arguments : {};
  switch (call.name) {
    case 'distance_to_waypoint': {
      const nm = a.name || a.waypoint || a.destination;      // training key is `waypoint`
      if (!nm || typeof nm !== 'string' || !nm.trim()) return null; // no target => hallucination, drop
      return { name: call.name, arguments: { name: String(nm).trim() } };
    }
    case 'query_waypoint': {
      const nm = a.name || a.waypoint;
      if (!nm || typeof nm !== 'string' || !nm.trim()) return null;
      return { name: call.name, arguments: { name: String(nm).trim() } };
    }
    case 'drop_cairn': {
      const out = {};
      const label = a.label != null ? a.label : a.note;
      if (label != null && String(label).trim()) out.label = String(label).trim();
      return { name: call.name, arguments: out };
    }
    case 'control_music': {
      let act = a.action;
      if (act === 'next') act = 'skip_next';
      else if (act === 'previous' || act === 'prev') act = 'skip_previous';
      if (!_MUSIC_ACTIONS.has(act)) return null;             // unknown action => drop
      return { name: call.name, arguments: { action: act } };
    }
    // These take no args in the app schema — strip training extras.
    case 'dial_emergency':
    case 'check_off_route':
    case 'get_location':
    case 'list_waypoints':
      return { name: call.name, arguments: {} };
    default:
      return null;
  }
}

/** Tolerant extraction of {calls:[...]} from possibly-malformed model text.
 *  First a strict JSON parse of the first object; on failure, a regex salvage
 *  that scavenges valid `"name":"<tool>"`(+ optional arguments) pairs. */
function _looseParseCalls(raw) {
  const strict = parseAndValidateCalls(raw); // handles first-{...}-block + validation
  if (strict && strict.calls.length) return strict;
  const text = String(raw == null ? '' : raw);
  const calls = [];
  // scan for  "name" : "tool"  then the nearest following  "arguments" : { ... }
  const nameRe = /"name"\s*:\s*"([a-z_]+)"/g;
  let m;
  while ((m = nameRe.exec(text)) !== null) {
    const tool = m[1];
    if (TOOL_NAMES.indexOf(tool) === -1) continue;
    let args = {};
    const rest = text.slice(m.index + m[0].length);
    const am = rest.match(/"arguments"\s*:\s*(\{[^{}]*\})/);
    if (am) { try { args = JSON.parse(am[1]); } catch (_e) { args = {}; } }
    calls.push({ name: tool, arguments: args });
  }
  // If strict gave an empty (valid) result, prefer that (a real negative);
  // otherwise return whatever we salvaged.
  if (strict && !calls.length) return strict;
  return { calls };
}

/** Full clean-up: loose-parse -> per-call normalize -> drop nulls -> dedup. */
function normalizeFeedseedCalls(raw) {
  const parsed = _looseParseCalls(raw);
  const seen = new Set();
  const calls = [];
  for (const c of parsed.calls) {
    const n = _normalizeCall(c);
    if (!n) continue;
    const key = n.name + '|' + JSON.stringify(n.arguments);
    if (seen.has(key)) continue;                 // drop duplicate spurious calls
    seen.add(key);
    calls.push(n);
  }
  // Suppress a redundant query_waypoint(X) when distance_to_waypoint(X) is also
  // present — the free-form decode often emits both for one "how far to X".
  const distNames = new Set(calls.filter((c) => c.name === 'distance_to_waypoint').map((c) => c.arguments.name));
  const pruned = calls.filter((c) => !(c.name === 'query_waypoint' && distNames.has(c.arguments.name)));
  return { calls: pruned };
}

/* ------------------------------------------------------------------ */
/* Negative gate — the false-command / false-emergency backstop.        */
/* A 4-bit browser decode of a 270M model sometimes hallucinates a       */
/* command on pure chit-chat ("what a beautiful day" -> dial_emergency). */
/* Two cheap, deterministic edge signals decide if the utterance carries */
/* ANY command intent at all:                                            */
/*   (a) the rule parser (edgeAI.ruleInterpret) finds a typed intent, or */
/*   (b) retrieval top-1 score >= negGateMinScore (a real trail name).   */
/* If NEITHER fires, we override the model with {"calls":[]}. This only   */
/* ever SUPPRESSES output — it never invents a call — so it cannot hurt   */
/* structure/name accuracy, only kill false positives on negatives.      */
/* ------------------------------------------------------------------ */
const _EMERGENCY_LEXICON =
  /\b(sos|s\.?o\.?s|emergency|911|112|999|mayday|distress|rescue|help me|call for help|injur|hurt|bleed|broke|broken|fell|falling|ankle|leg|arm|unconscious|not breathing|heart attack|stroke|stranded|trapped|lost and)\b/i;

/**
 * Negative gate. Given the utterance and the model's cleaned calls, decide what
 * (if anything) is allowed to fire. SUPPRESS-ONLY: it can drop calls, never add
 * or alter one — so it cannot regress structure or name accuracy, only kill
 * false positives. Two layers:
 *   (1) global negative gate — if the utterance carries NO command signal at all
 *       (rule parser empty AND retrieval below the noise floor) it is
 *       chit-chat/venting/weather; drop every call -> {"calls":[]}.
 *   (2) emergency guard — the highest-stakes false positive. A model-emitted
 *       dial_emergency is only allowed through if the deterministic rule parser
 *       ALSO flagged an emergency OR clear emergency lexicon is present.
 * Returns a (possibly shorter) array of calls.
 */
function _gateCalls(text, calls) {
  if (!Array.isArray(calls) || !calls.length) return calls || [];
  const t = String(text == null ? '' : text);
  let ruleNames = new Set();
  try {
    const r = ruleInterpret(t);
    if (r && Array.isArray(r.calls)) ruleNames = new Set(r.calls.map((c) => c.name));
  } catch (_e) { /* ignore */ }
  let retrHit = false;
  try { retrHit = retrieveTopScore(t) >= CFG.negGateMinScore; } catch (_e) { retrHit = false; }
  const hasSignal = ruleNames.size > 0 || retrHit;
  // (1) no signal at all -> chit-chat -> suppress everything.
  if (!hasSignal) return [];
  // (2) emergency guard.
  const emergOk = ruleNames.has('dial_emergency') || _EMERGENCY_LEXICON.test(t);
  return calls.filter((c) => c.name !== 'dial_emergency' || emergOk);
}

/** Pull the assistant's text out of transformers.js's varied return shapes. */
function _extractText(out) {
  try {
    const first = Array.isArray(out) ? out[0] : out;
    const gt = first && first.generated_text;
    if (typeof gt === 'string') return gt;
    if (Array.isArray(gt)) {
      // chat form: [{role,content}...] — take the last assistant turn.
      for (let i = gt.length - 1; i >= 0; i -= 1) {
        if (gt[i] && gt[i].role === 'assistant' && typeof gt[i].content === 'string') return gt[i].content;
      }
      const last = gt[gt.length - 1];
      if (last && typeof last.content === 'string') return last.content;
    }
    if (typeof out === 'string') return out;
  } catch (_e) { /* ignore */ }
  return '';
}

/**
 * interpret(text) -> {"calls":[...]} | null.
 * Runs Feedseed on WebGPU, validates the tool calls, and GROUNDS trail-name
 * slots via retrieval (so the name is always a real trail). Returns null to let
 * the edgeAI cascade fall through when the model isn't ready or produced nothing
 * usable. Never throws.
 */
async function interpret(text) {
  if (_state !== 'ready' || !_generator) return null;
  const t = String(text == null ? '' : text).trim();
  if (!t) return { calls: [] };
  try {
    const messages = [
      { role: 'system', content: FEEDSEED_SYSTEM_PROMPT },
      { role: 'user', content: t },
    ];
    // Grammar-constrained decode: the model can ONLY emit valid FC JSON with a
    // real tool and a real (retrieved) trail name — the browser's GBNF.
    const genOpts = {
      max_new_tokens: CFG.maxNewTokens,
      do_sample: false,
      temperature: 0,
      return_full_text: false,
    };
    const lpl = _buildGrammarProcessors(t);
    if (lpl) genOpts.logits_processor = lpl;
    const out = await _generator(messages, genOpts);
    const raw = _extractText(out);
    // Clean the free-form (grammarless) output: salvage JSON, remap the
    // training schema to the app schema, drop hallucinated/duplicate calls.
    const cleaned = normalizeFeedseedCalls(raw);
    // NEGATIVE GATE (suppress-only): drop hallucinated commands on chit-chat and
    // block a false dial_emergency that lacks any emergency signal.
    cleaned.calls = _gateCalls(t, cleaned.calls);
    // Empty result -> return null so the edgeAI cascade tries the rule parser
    // (which may catch a command the free-form decode garbled). A NON-empty
    // result is grounded (real trail names) and used.
    if (!cleaned.calls.length) return null;
    try { return groundCalls(cleaned); } catch (_e) { return cleaned; }
  } catch (e) {
    _lastError = (e && e.message) ? e.message : String(e);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Register into the edgeAI cascade                                    */
/* ------------------------------------------------------------------ */

const backend = {
  name: 'feedseed-webgpu',
  isAvailable: async () => _enabled && webgpuSupported() && _state === 'ready' && !!_generator,
  interpret,
};

let _registered = false;
function register() {
  if (_registered) return true;
  _registered = registerInterpreterBackend(backend);
  return _registered;
}

// Auto-register on import (safe: isAvailable() gates on _state === 'ready', so
// the backend stays dormant until the user downloads the model).
try { register(); } catch (_e) { /* ignore */ }

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

const FeedseedBackend = {
  configure,
  download,
  unload,
  isDownloaded,
  getState,
  setEnabled,
  register,
  webgpuSupported,
  name: 'feedseed-webgpu',
};

export {
  configure,
  download,
  unload,
  isDownloaded,
  getState,
  setEnabled,
  register,
  webgpuSupported,
  normalizeFeedseedCalls,
  _gateCalls,
  FEEDSEED_SYSTEM_PROMPT,
  FeedseedBackend,
};

try {
  if (typeof globalThis !== 'undefined') globalThis.FeedseedBackend = FeedseedBackend;
} catch (_e) { /* ignore */ }

export default FeedseedBackend;
