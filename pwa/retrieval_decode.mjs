/**
 * retrieval_decode.mjs — the JS twin of MoM's retrieval-based decode.
 *
 * PARITY CONTRACT: this is the line-for-line port of
 *   OpenCairn/MoM/impl/retrieval_decode/python/retrieval_decode/{normalize,phonetic,fuzzy,retrieve,grammar,interface}.py
 * Weights, blend order, and tie-breaks are part of the contract — a query +
 * name list must produce the SAME ranking (and byte-identical grammar) on both
 * sides. If you change scoring here, change the Python and re-run golden_parity.
 *
 * This is the grounding layer that makes a spoken/typed trail name resolve to a
 * REAL canonical name instead of a hallucinated one:
 *
 *   retrieve(query, names)  -> top-k real names for a (ASR-garbled) query
 *   snap(rawName, cands)    -> pick the real name a free-form model output meant
 *   plan(query, names, ...) -> { candidates, top1, grammar, prompt }  (native FC)
 *
 * The browser edge-AI (transformers.js Feedseed) has no in-decoder GBNF, so it
 * uses retrieval as AUTHORITATIVE for the name slot (the Python's "rank1"
 * stance): the model picks the tool + structure, and the emitted name is SNAPPED
 * to a retrieved canonical string. Result: the name can never be invented — the
 * same no-hallucination guarantee the GBNF enum gives the native path.
 */

'use strict';

/* ------------------------------------------------------------------ */
/* normalize.py                                                        */
/* ------------------------------------------------------------------ */

const _WORD = /[a-z0-9]+/g;
const _NONALPHA = /[^a-z]+/g;

const STOPWORDS = new Set(
  ['trail', 'trailhead', 'loop', 'path', 'route', 'way', 'road', 'rd', 'tr']
);

const NUMWORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12',
};

/** Lowercase word tokens, number words mapped to digits. */
function tokens(s) {
  const out = [];
  const m = String(s).toLowerCase().match(_WORD);
  if (!m) return out;
  for (const t of m) out.push(Object.prototype.hasOwnProperty.call(NUMWORDS, t) ? NUMWORDS[t] : t);
  return out;
}

/** Lowercase, number-word-mapped, non-alphanumerics stripped (space-insensitive form). */
function squash(s) {
  return tokens(s).join('');
}

/** Lowercase and strip every non-alphabetic char (phonetic-key input form). */
function alpha(s) {
  return String(s).toLowerCase().replace(_NONALPHA, '');
}

/** Tokens minus stopwords; falls back to all tokens if nothing remains. */
function contentTokens(s) {
  const toks = tokens(s);
  const kept = toks.filter((t) => !STOPWORDS.has(t));
  return kept.length ? kept : toks;
}

/* ------------------------------------------------------------------ */
/* phonetic.py                                                         */
/* ------------------------------------------------------------------ */

const _VOWELS = 'aeiou';
const _DOUBLES = /(.)\1+/g;

/** Metaphone-style phonetic key. Deterministic, ASCII-only, pure. */
function phokey(input) {
  let s = alpha(input).replace(_DOUBLES, '$1');
  if (!s) return '';
  for (const [pre, rep] of [['kn', 'n'], ['gn', 'n'], ['pn', 'n'], ['wr', 'r'], ['ps', 's'], ['wh', 'w']]) {
    if (s.startsWith(pre)) { s = rep + s.slice(2); break; }
  }
  if (s.startsWith('x')) s = 's' + s.slice(1);

  const out = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    const nx = i + 1 < n ? s[i + 1] : '';
    const nx2 = i + 2 < n ? s[i + 2] : '';
    if (_VOWELS.includes(c)) {
      if (i === 0) out.push('a');
      i += 1;
    } else if (c === 'b') {
      if (!(i === n - 1 && i > 0 && s[i - 1] === 'm')) out.push('b');
      i += 1;
    } else if (c === 'c') {
      if (nx === 'h') { out.push('x'); i += 2; }
      else if ('eiy'.includes(nx)) { out.push('s'); i += 1; }
      else if (nx === 'k') { out.push('k'); i += 2; }
      else { out.push('k'); i += 1; }
    } else if (c === 'd') {
      if (nx === 'g' && 'eiy'.includes(nx2)) { out.push('j'); i += 2; }
      else { out.push('t'); i += 1; }
    } else if (c === 'f') {
      out.push('f'); i += 1;
    } else if (c === 'g') {
      if (nx === 'h') { if (i === 0) out.push('k'); i += 2; }
      else if (nx === 'n') { out.push('n'); i += 2; }
      else if ('eiy'.includes(nx)) { out.push('j'); i += 1; }
      else { out.push('k'); i += 1; }
    } else if (c === 'h') {
      if (i === 0) out.push('h');
      i += 1;
    } else if (c === 'j') {
      out.push('j'); i += 1;
    } else if ('klmnr'.includes(c)) {
      out.push(c); i += 1;
    } else if (c === 'p') {
      if (nx === 'h') { out.push('f'); i += 2; }
      else { out.push('p'); i += 1; }
    } else if (c === 'q') {
      out.push('k'); i += 1;
    } else if (c === 's') {
      if (nx === 'h') { out.push('x'); i += 2; }
      else if (nx === 'i' && 'oa'.includes(nx2)) { out.push('x'); i += 1; }
      else { out.push('s'); i += 1; }
    } else if (c === 't') {
      if (nx === 'h') { out.push('0'); i += 2; }
      else if (nx === 'i' && 'oa'.includes(nx2)) { out.push('x'); i += 1; }
      else { out.push('t'); i += 1; }
    } else if (c === 'v') {
      out.push('f'); i += 1;
    } else if (c === 'w') {
      if (_VOWELS.includes(nx)) out.push('w');
      i += 1;
    } else if (c === 'x') {
      out.push('k'); out.push('s'); i += 1;
    } else if (c === 'y') {
      if (_VOWELS.includes(nx)) out.push('y');
      i += 1;
    } else if (c === 'z') {
      out.push('s'); i += 1;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

const _SOUNDEX = {
  b: '1', f: '1', p: '1', v: '1',
  c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
  d: '3', t: '3',
  l: '4',
  m: '5', n: '5',
  r: '6',
};

/** Classic American Soundex (4 chars). */
function soundexish(input) {
  const s = alpha(input);
  if (!s) return '';
  const first = s[0];
  let prev = _SOUNDEX[first] || '';
  const digits = [];
  for (let idx = 1; idx < s.length; idx += 1) {
    const c = s[idx];
    if (c === 'h' || c === 'w') continue;
    const d = _SOUNDEX[c] || '';
    if (d && d !== prev) digits.push(d);
    prev = d;
    if (digits.length >= 3) break;
  }
  return (first + digits.join('') + '000').slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* fuzzy.py                                                            */
/* ------------------------------------------------------------------ */

/** Indel (LCS-style) edit distance: insertions + deletions only. */
function indelDistance(a, b) {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = [];
  for (let j = 0; j <= lb; j += 1) prev.push(j);
  for (let i = 1; i <= la; i += 1) {
    const cur = new Array(lb + 1);
    cur[0] = i;
    const ca = a[i - 1];
    for (let j = 1; j <= lb; j += 1) {
      if (ca === b[j - 1]) cur[j] = prev[j - 1];
      else cur[j] = 1 + (prev[j] < cur[j - 1] ? prev[j] : cur[j - 1]);
    }
    prev = cur;
  }
  return prev[lb];
}

/** Indel-normalized similarity in [0, 1]. ratio('','') === 1.0. */
function ratio(a, b) {
  const la = a.length;
  const lb = b.length;
  if (la + lb === 0) return 1.0;
  return 1.0 - indelDistance(a, b) / (la + lb);
}

function _sortedTokens(s) { return tokens(s).slice().sort(); }

function tokenSortSim(a, b) {
  return ratio(_sortedTokens(a).join(' '), _sortedTokens(b).join(' '));
}

function tokenSetSim(a, b) {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (!sa.size || !sb.size) return 0.0;
  const inter = [...sa].filter((x) => sb.has(x)).sort();
  const da = [...sa].filter((x) => !sb.has(x)).sort();
  const db = [...sb].filter((x) => !sa.has(x)).sort();
  const si = inter.join(' ');
  const s1 = inter.concat(da).join(' ');
  const s2 = inter.concat(db).join(' ');
  let best = ratio(s1, s2);
  if (si) {
    const r1 = ratio(si, s1);
    if (r1 > best) best = r1;
    const r2 = ratio(si, s2);
    if (r2 > best) best = r2;
  }
  return best;
}

function partialSim(a, b) {
  if (a.length > b.length) { const t = a; a = b; b = t; }
  if (!a) return 0.0;
  const la = a.length;
  let best = 0.0;
  for (let st = 0; st <= b.length - la; st += 1) {
    const r = ratio(a, b.slice(st, st + la));
    if (r > best) best = r;
    if (best === 1.0) break;
  }
  return best;
}

/** 0..1 surface similarity between a (garbled) query and a candidate name. */
function fuzzyScore(q, name) {
  const qt = tokens(q);
  const nt = tokens(name);
  const tsort = tokenSortSim(q, name);
  const sq = ratio(squash(q), squash(name));
  let lenr;
  if (qt.length && nt.length) {
    const lo = Math.min(qt.length, nt.length);
    const hi = Math.max(qt.length, nt.length);
    lenr = lo / hi;
  } else {
    lenr = 1.0;
  }
  const tset = tokenSetSim(q, name) * lenr;
  const part = partialSim(squash(q), squash(name)) * lenr;
  let best = tsort;
  for (const v of [sq, tset, part]) if (v > best) best = v;
  return best;
}

/* ------------------------------------------------------------------ */
/* retrieve.py                                                         */
/* ------------------------------------------------------------------ */

const W_PHON = 0.6;
const W_FUZZ = 0.4;
const W_GPS = 0.15;
const GPS_HALF_KM = 30.0;

function phoneticScore(q, name) {
  const whole = ratio(phokey(squash(q)), phokey(squash(name)));
  const qc = contentTokens(q);
  const nc = contentTokens(name);
  if (!qc.length || !nc.length) return whole;
  let tot = 0.0;
  for (const ntk of nc) {
    const nkey = phokey(ntk);
    const nsdx = soundexish(ntk);
    let best = 0.0;
    for (const qtk of qc) {
      let m;
      if (nkey) m = ratio(phokey(qtk), nkey);
      else m = qtk === ntk ? 1.0 : 0.0;
      const s = (nsdx && soundexish(qtk) === nsdx) ? 1.0 : 0.0;
      const v = 0.7 * m + 0.3 * s;
      if (v > best) best = v;
    }
    tot += best;
  }
  const tok = tot / nc.length;
  return 0.45 * whole + 0.55 * tok;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371.0;
  const rad = (d) => (d * Math.PI) / 180;
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const dp = rad(lat2 - lat1);
  const dl = rad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function scoreRecord(q, rec, gps) {
  const ph = phoneticScore(q, rec.name);
  const fz = fuzzyScore(q, rec.name);
  let prox = 0.0;
  if (gps && rec.lat != null && rec.lon != null) {
    const d = haversineKm(gps[0], gps[1], rec.lat, rec.lon);
    prox = 1.0 / (1.0 + d / GPS_HALF_KM);
  }
  return { combined: W_PHON * ph + W_FUZZ * fz + W_GPS * prox, ph, fz, prox };
}

/**
 * Top-k candidate records for a query, deduplicated by canonical name.
 * names: [{name, region?, lat?, lon?}]. Returns candidates sorted by
 * (score desc, name asc).
 */
function retrieve(query, names, opts) {
  const { k = 8, gps = null, region = null } = opts || {};
  let pool = names;
  if (region != null) {
    const filtered = names.filter((r) => r.region === region);
    pool = filtered.length ? filtered : names;
  }
  const best = new Map();
  for (const rec of pool) {
    const nm = rec.name;
    const { combined, ph, fz, prox } = scoreRecord(query, rec, gps);
    const cur = best.get(nm);
    if (cur === undefined || combined > cur.combined) {
      best.set(nm, { combined, ph, fz, prox, rec });
    }
  }
  const ranked = [...best.entries()].sort((x, y) => {
    if (y[1].combined !== x[1].combined) return y[1].combined - x[1].combined;
    return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0;
  });
  const out = [];
  for (const [nm, v] of ranked.slice(0, k)) {
    out.push({
      name: nm,
      region: v.rec.region ?? null,
      score: v.combined,
      phonetic: v.ph,
      fuzzy: v.fz,
      gps: v.prox,
      lat: v.rec.lat ?? null,
      lon: v.rec.lon ?? null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* grammar.py                                                          */
/* ------------------------------------------------------------------ */

function _esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function _check(names) {
  if (!names || !names.length) throw new Error('gbnf builder needs at least one candidate name');
  for (const n of names) {
    if (n.indexOf('\n') !== -1 || n.indexOf('\r') !== -1) {
      throw new Error('candidate names must be single-line: ' + JSON.stringify(n));
    }
  }
}

/** Grammar: optional leading whitespace, then exactly one candidate name. */
function gbnfEnum(names) {
  _check(names);
  const alts = names.map((n) => '"' + _esc(n) + '"').join(' | ');
  return 'root ::= ws nm\nws ::= [ \\t\\n]*\nnm ::= ' + alts + '\n';
}

/** Grammar admitting only retrieval's rank-1 name (model-independent). */
function gbnfRank1(name) {
  _check([name]);
  return 'root ::= ws "' + _esc(name) + '"\nws ::= [ \\t\\n]*\n';
}

/** Grammar for a JSON function call whose waypoint slot is the enum. */
function gbnfFc(names, func = 'set_waypoint') {
  _check(names);
  _check([func]);
  const jesc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const alts = names.map((n) => '"' + _esc(jesc(n)) + '"').join(' | ');
  const head = _esc('{"name":"' + jesc(func) + '","arguments":{"waypoint":"');
  const tail = _esc('"}}');
  return 'root ::= "' + head + '" nm "' + tail + '"\nnm ::= ' + alts + '\n';
}

/* ------------------------------------------------------------------ */
/* interface.py                                                        */
/* ------------------------------------------------------------------ */

const MODES = ['enum', 'rank1', 'fc'];

const _PROMPT = (query, topnames) =>
  'A hiker said a trail name; speech recognition heard: "' + query + '".\n' +
  'Choose the ONE official trail name it best matches from this list:\n' +
  topnames.map((n) => '- ' + n).join('\n') + '\n' +
  'Answer:';

/**
 * Build a decode plan: retrieved candidates + grammar (+ selection prompt).
 * mode: "enum" | "rank1" | "fc". Mirrors interface.plan().
 */
function plan(query, names, opts) {
  const { k = 8, gps = null, region = null, mode = 'enum', fcName = 'set_waypoint' } = opts || {};
  if (MODES.indexOf(mode) === -1) throw new Error('mode must be one of ' + MODES.join(','));
  const cands = retrieve(query, names, { k, gps, region });
  if (!cands.length) throw new Error('empty name list: nothing to retrieve from');
  const topnames = cands.map((c) => c.name);
  const top1 = topnames[0];
  let grammar;
  if (mode === 'enum') grammar = gbnfEnum(topnames);
  else if (mode === 'rank1') grammar = gbnfRank1(top1);
  else grammar = gbnfFc(topnames, fcName);
  const prompt = (mode === 'enum' || mode === 'fc') ? _PROMPT(query, topnames) : null;
  return {
    version: 1,
    query,
    k,
    mode,
    region,
    gps: gps ? [gps[0], gps[1]] : null,
    candidates: cands,
    top1,
    grammar,
    prompt,
  };
}

/* ------------------------------------------------------------------ */
/* Browser grounding helper (the "rank1 stance" for grammarless edge)  */
/* ------------------------------------------------------------------ */

/**
 * snap(rawName, candidates) -> the real canonical name a free-form model output
 * meant. `candidates` is retrieve()'s output (already scored vs the ORIGINAL
 * query). We re-rank those few candidates by how well each matches the model's
 * raw string, and return the best — so the emitted name is ALWAYS a retrieved
 * real name, never an invented/misspelled one. Returns null if no candidates.
 *
 * Blends the model's own vote (its raw string vs each candidate) with
 * retrieval's original score, so a confident correct model still wins ties but
 * a hallucinated string can only ever collapse onto a real neighbour.
 */
function snap(rawName, candidates, opts) {
  if (!candidates || !candidates.length) return null;
  const raw = String(rawName == null ? '' : rawName).trim();
  if (!raw) return candidates[0]; // nothing to match -> retrieval top-1
  const alpha3 = (opts && typeof opts.retrievalWeight === 'number') ? opts.retrievalWeight : 0.35;
  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    const surface = Math.max(fuzzyScore(raw, c.name), phoneticScore(raw, c.name));
    const blended = (1 - alpha3) * surface + alpha3 * (c.score || 0);
    if (blended > bestScore || (blended === bestScore && best && c.name < best.name)) {
      bestScore = blended;
      best = c;
    }
  }
  return best;
}

/**
 * namesFromTrails(trails) -> [{name, region, lat, lon}] name records built from
 * the PWA's trails.min.json. Accepts common shapes: a FeatureCollection, an
 * array of {name, region?, lat?, lon?, coordinates?/geometry?}, etc. Best-effort
 * and defensive — anything without a usable name is skipped.
 */
function namesFromTrails(trails) {
  const feats = Array.isArray(trails) ? trails
    : (trails && Array.isArray(trails.features)) ? trails.features
    : (trails && Array.isArray(trails.trails)) ? trails.trails
    : [];
  const out = [];
  for (const f of feats) {
    if (!f) continue;
    const props = f.properties || f;
    const name = props.name || props.trail || props.title;
    if (!name || typeof name !== 'string') continue;
    let lat = props.lat ?? props.latitude ?? null;
    let lon = props.lon ?? props.lng ?? props.longitude ?? null;
    if ((lat == null || lon == null) && f.geometry && Array.isArray(f.geometry.coordinates)) {
      const pt = _firstCoord(f.geometry.coordinates);
      if (pt) { lon = pt[0]; lat = pt[1]; }
    }
    if ((lat == null || lon == null) && Array.isArray(props.coordinates)) {
      const pt = _firstCoord(props.coordinates);
      if (pt) { lon = pt[0]; lat = pt[1]; }
    }
    out.push({
      name: name.trim(),
      region: props.region || props.area || null,
      lat: typeof lat === 'number' ? lat : null,
      lon: typeof lon === 'number' ? lon : null,
    });
  }
  return out;
}

function _firstCoord(coords) {
  let c = coords;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') return c;
  return null;
}

export {
  // normalize
  squash, alpha, tokens, contentTokens, STOPWORDS, NUMWORDS,
  // phonetic
  phokey, soundexish,
  // fuzzy
  indelDistance, ratio, tokenSortSim, tokenSetSim, partialSim, fuzzyScore,
  // retrieve
  phoneticScore, haversineKm, retrieve,
  // grammar
  gbnfEnum, gbnfRank1, gbnfFc,
  // interface + browser grounding
  plan, snap, namesFromTrails, MODES,
};
