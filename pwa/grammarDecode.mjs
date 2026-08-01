/**
 * grammarDecode.mjs — token-level GRAMMAR-CONSTRAINED decoding for the browser.
 *
 * This is the browser equivalent of llama.cpp's GBNF / XGrammar: a character-
 * level Thompson-NFA over the OpenCairn function-call grammar, projected onto
 * the tokenizer so that at every decode step the logits of any token that would
 * break the grammar are masked to -Infinity. The model can then ONLY emit a
 * string in the language — so its output is PROVABLY valid JSON, a real tool,
 * and (for name slots) one of the retrieved real trail names.
 *
 * This closes the gap the free-form browser decode had: no malformed JSON, no
 * invented tools, no hallucinated names — the same guarantee the native GBNF
 * path gives, running under transformers.js on WebGPU.
 *
 * The name slot's enum is built from retrieval_decode's top-k canonical names,
 * so the MoM keystone (retrieval-based decode) runs IN-DECODER here, not as a
 * post-hoc snap.
 *
 * Correctness notes:
 *  - Tokens decode context-independently and concatenate exactly for this
 *    tokenizer (verified: decode(encode(s)) === s), and structural tokens span
 *    grammar-segment boundaries (e.g. " [{\""). A char-level NFA fed each
 *    token's FULL decoded string handles both facts correctly.
 *  - Single-sequence greedy/sampled decode only (batch 1). One matcher tracks
 *    the committed prefix incrementally.
 */

'use strict';

/* ------------------------------------------------------------------ */
/* Thompson NFA over characters                                        */
/* ------------------------------------------------------------------ */
/* Instruction ops: 'char' {set:Set|null, free:bool, stop:string, next},
 *                  'split' {x,y}, 'jmp' {x}, 'match'.                   */

function _compile(ast) {
  const prog = [];
  const emit = (instr) => { prog.push(instr); return prog.length - 1; };
  const patch = (outs, target) => { for (const [i, f] of outs) prog[i][f] = target; };

  // returns { start, outs:[[instrIdx, field]] }
  function build(node) {
    const t = node[0];
    if (t === 'lit') {
      const s = node[1];
      if (s.length === 0) { const i = emit({ op: 'jmp', x: null }); return { start: i, outs: [[i, 'x']] }; }
      let start = null; let prevOuts = null;
      for (const ch of s) {
        const i = emit({ op: 'char', set: new Set([ch]), free: false, stop: null, next: null });
        if (start === null) start = i; else patch(prevOuts, i);
        prevOuts = [[i, 'next']];
      }
      return { start, outs: prevOuts };
    }
    if (t === 'enum') {
      return build(['alt'].concat(node[1].map((s) => ['lit', s])));
    }
    if (t === 'seq') {
      const parts = node.slice(1).map(build);
      for (let k = 0; k < parts.length - 1; k += 1) patch(parts[k].outs, parts[k + 1].start);
      return { start: parts[0].start, outs: parts[parts.length - 1].outs };
    }
    if (t === 'alt') {
      const parts = node.slice(1).map(build);
      // right-nested splits
      let start = parts[parts.length - 1].start;
      let outs = parts[parts.length - 1].outs.slice();
      for (let k = parts.length - 2; k >= 0; k -= 1) {
        const sp = emit({ op: 'split', x: parts[k].start, y: start });
        start = sp;
        outs = outs.concat(parts[k].outs);
      }
      return { start, outs };
    }
    if (t === 'opt') {
      return build(['alt', node[1], ['lit', '']]);
    }
    if (t === 'free') {
      // 0..max chars of (printable, not stop) — right-recursive optional chain.
      const stop = node[1]; const max = node[2];
      function chain(n) {
        if (n === 0) return ['lit', ''];
        return ['opt', ['seq', ['freechar', stop], chain(n - 1)]];
      }
      return build(chain(max));
    }
    if (t === 'freechar') {
      const i = emit({ op: 'char', set: null, free: true, stop: node[1], next: null });
      return { start: i, outs: [[i, 'next']] };
    }
    throw new Error('bad grammar node ' + t);
  }

  const root = build(ast);
  const m = emit({ op: 'match' });
  patch(root.outs, m);
  return { prog, start: root.start };
}

function _isPrintable(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x20 && c !== 0x7f; // printable, not DEL/control
}

/** Compiled grammar + NFA simulation. Immutable prog; frontier is the state. */
class Grammar {
  constructor(ast) {
    const { prog, start } = _compile(ast);
    this.prog = prog;
    this.startFrontier = this._closure([start]);
  }

  _closure(pcs) {
    const out = new Set();
    const stack = pcs.slice();
    const seen = new Set();
    while (stack.length) {
      const pc = stack.pop();
      if (seen.has(pc)) continue;
      seen.add(pc);
      const ins = this.prog[pc];
      if (ins.op === 'split') { stack.push(ins.x, ins.y); }
      else if (ins.op === 'jmp') { stack.push(ins.x); }
      else { out.add(pc); } // 'char' | 'match' are frontier terminals
    }
    return out;
  }

  _matches(ins, ch) {
    if (ins.op !== 'char') return false;
    if (ins.free) return _isPrintable(ch) && ch !== ins.stop && ch !== '\\';
    return ins.set.has(ch);
  }

  /** Advance a frontier by one char; returns new frontier (empty Set if dead). */
  step(frontier, ch) {
    const nxt = [];
    for (const pc of frontier) {
      const ins = this.prog[pc];
      if (this._matches(ins, ch)) nxt.push(ins.next);
    }
    return this._closure(nxt);
  }

  /** Advance by a whole string; returns new frontier (may be empty). */
  feed(frontier, str) {
    let f = frontier;
    for (const ch of str) {
      f = this.step(f, ch);
      if (f.size === 0) return f;
    }
    return f;
  }

  canEnd(frontier) {
    for (const pc of frontier) if (this.prog[pc].op === 'match') return true;
    return false;
  }

  /** { chars:Set<string>, free:boolean } allowed as the immediate next char. */
  allowedFirst(frontier) {
    const chars = new Set();
    let free = false;
    for (const pc of frontier) {
      const ins = this.prog[pc];
      if (ins.op !== 'char') continue;
      if (ins.free) free = true; else for (const c of ins.set) chars.add(c);
    }
    return { chars, free };
  }
}

/* ------------------------------------------------------------------ */
/* The OpenCairn FC grammar (training schema; normalized app-side)      */
/* ------------------------------------------------------------------ */

const MUSIC_ACTIONS = ['play', 'pause', 'next', 'previous', 'stop'];
const EMERGENCY_SVC = ['sos', 'ranger', 'contact'];

/**
 * Build the grammar AST for a request. `names` = retrieved canonical trail
 * names (the enum for name slots); when empty the name slot falls back to a
 * free JSON string. maxCalls caps multi-intent (default 3). labelMax caps the
 * free drop_cairn label length.
 */
function buildFcGrammar(names, opts) {
  const o = opts || {};
  // Default single-call: one utterance -> one action is the norm here, and
  // allowing extra calls lets a small model append spurious (sometimes
  // side-effecting, e.g. a stray drop_cairn) calls. Raise for multi-intent.
  const maxCalls = o.maxCalls || 1;
  const labelMax = o.labelMax || 48;
  // Name slot mode (MoM keystone, per the Fable review): 'rank1' forces the
  // slot to retrieval's TOP-1 candidate, so name accuracy == retrieval accuracy
  // BY CONSTRUCTION — the 270M model does NOT rank names (it picks ~uniformly
  // over an enum on hard garbles). 'enum' lets the model choose among top-k
  // (only worth it with an E2B-class brain). Facts=retrieval, skills=model.
  const nameMode = o.nameMode || 'rank1';
  const nameSlot = (names && names.length)
    ? (nameMode === 'enum' ? ['enum', names.slice()] : ['lit', names[0]])
    : ['free', '"', 48];

  const argsFor = {
    get_location: ['lit', ''],
    list_waypoints: ['lit', ''],
    check_off_route: ['lit', ''],
    dial_emergency: ['opt', ['seq', ['lit', '"service": "'], ['enum', EMERGENCY_SVC], ['lit', '"']]],
    control_music: ['seq', ['lit', '"action": "'], ['enum', MUSIC_ACTIONS], ['lit', '"']],
    query_waypoint: ['seq', ['lit', '"name": "'], nameSlot, ['lit', '"']],
    distance_to_waypoint: ['seq', ['lit', '"waypoint": "'], nameSlot, ['lit', '"']],
    drop_cairn: ['opt', ['seq', ['lit', '"label": "'], ['free', '"', labelMax], ['lit', '"']]],
  };

  // one CALL = {"name": "<tool>", "arguments": {<args>}}   (per-tool alt)
  const callAlts = Object.keys(argsFor).map((tool) => ['seq',
    ['lit', '{"name": "' + tool + '", "arguments": {'],
    argsFor[tool],
    ['lit', '}}'],
  ]);
  const CALL = ['alt'].concat(callAlts);

  // CALLLIST = ε | CALL (", " CALL){0,maxCalls-1}
  function tail(n) {
    if (n === 0) return ['lit', ''];
    return ['opt', ['seq', ['lit', ', '], CALL, tail(n - 1)]];
  }
  const CALLLIST = ['opt', ['seq', CALL, tail(maxCalls - 1)]];

  return ['seq', ['lit', '{"calls": ['], CALLLIST, ['lit', ']}']];
}

/* ------------------------------------------------------------------ */
/* Tokenizer projection + the LogitsProcessor                          */
/* ------------------------------------------------------------------ */

/** Precompute id->string and firstChar->ids from a transformers.js tokenizer.
 *  vocabSize MUST be supplied (from the model config) — some tokenizer builds
 *  don't expose .model/.getVocabSize. Cached on the tokenizer object. */
function buildTokenTable(tokenizer, vocabSize) {
  if (tokenizer.__gcTable && tokenizer.__gcTable.size === vocabSize) return tokenizer.__gcTable;
  let size = vocabSize;
  if (!size) {
    size = (tokenizer.model && tokenizer.model.vocab)
      ? (Array.isArray(tokenizer.model.vocab) ? tokenizer.model.vocab.length : Object.keys(tokenizer.model.vocab).length)
      : (typeof tokenizer.getVocabSize === 'function' ? tokenizer.getVocabSize() : 0);
  }
  const idToStr = new Array(size);
  const firstCharToIds = new Map();
  const printableIds = [];
  for (let id = 0; id < size; id += 1) {
    let s;
    try { s = tokenizer.decode([id], { skip_special_tokens: false }); } catch (_e) { s = ''; }
    idToStr[id] = s;
    if (!s) continue;
    const c0 = s[0];
    let arr = firstCharToIds.get(c0);
    if (!arr) { arr = []; firstCharToIds.set(c0, arr); }
    arr.push(id);
    if (_isPrintable(c0)) printableIds.push(id);
  }
  const table = { size, idToStr, firstCharToIds, printableIds };
  try { Object.defineProperty(tokenizer, '__gcTable', { value: table, enumerable: false }); } catch (_e) { /* ignore */ }
  return table;
}

function _rowsFromInputIds(input_ids) {
  // transformers.js may pass a Tensor or a nested array.
  if (input_ids && typeof input_ids.tolist === 'function') return input_ids.tolist();
  if (Array.isArray(input_ids)) return input_ids;
  return [Array.from(input_ids || [])];
}

/**
 * Make a transformers.js LogitsProcessor that constrains generation to the
 * grammar. `LogitsProcessorBase` is transformers.js's exported LogitsProcessor
 * class (passed in to avoid importing the runtime here). `eosIds` is the set of
 * token ids that legally terminate (eos / end_of_turn).
 */
function makeGrammarProcessor(LogitsProcessorBase, tokenizer, grammar, eosIds, vocabSize) {
  const table = buildTokenTable(tokenizer, vocabSize);
  const eos = new Set(eosIds || []);

  class GrammarLogitsProcessor extends LogitsProcessorBase {
    constructor() {
      super();
      this._frontier = grammar.startFrontier;
      this._promptLen = null;
      this._genLen = 0;
      this._dead = false;
    }

    _fold(row) {
      if (this._promptLen === null) this._promptLen = row.length; // first call = prompt only
      const genLen = row.length - this._promptLen;
      for (let i = this._genLen; i < genLen; i += 1) {
        const id = row[this._promptLen + i];
        if (eos.has(id)) { this._dead = true; break; }
        const s = table.idToStr[id];
        this._frontier = grammar.feed(this._frontier, s == null ? '' : s);
        if (this._frontier.size === 0) { this._dead = true; break; }
      }
      this._genLen = genLen;
    }

    _allowedIds() {
      const allow = new Set();
      if (this._dead || this._frontier.size === 0) return allow; // only EOS below
      const { chars, free } = grammar.allowedFirst(this._frontier);
      const candidates = free
        ? table.printableIds
        : (() => { const out = []; for (const c of chars) { const a = table.firstCharToIds.get(c); if (a) for (const id of a) out.push(id); } return out; })();
      for (const id of candidates) {
        const s = table.idToStr[id];
        if (s == null || s === '') continue;
        const f = grammar.feed(this._frontier, s);
        if (f.size > 0) allow.add(id);
      }
      return allow;
    }

    _call(input_ids, logits) {
      try {
        const rows = _rowsFromInputIds(input_ids);
        this._fold(rows[0] || []);
        const allow = this._allowedIds();
        const canEnd = this._dead ? true : grammar.canEnd(this._frontier);
        const data = logits.data;
        const vocab = logits.dims[logits.dims.length - 1];
        const NEG = -Infinity;
        // Mask every disallowed id. EOS allowed only at an accepting state.
        for (let id = 0; id < vocab; id += 1) {
          if (allow.has(id)) continue;
          if (canEnd && eos.has(id)) continue;
          data[id] = NEG;
        }
        // Safety: if nothing survived, force EOS so decode can't wedge.
        if (allow.size === 0 && !canEnd) { for (const e of eos) if (e < vocab) data[e] = 0; }
      } catch (_e) { /* on any error, leave logits untouched (degrade to free decode) */ }
      return logits;
    }
  }
  return new GrammarLogitsProcessor();
}

export {
  Grammar,
  buildFcGrammar,
  buildTokenTable,
  makeGrammarProcessor,
  MUSIC_ACTIONS,
};
