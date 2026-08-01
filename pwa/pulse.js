/* Trail Pulse — a living, crowdsourced trail-conditions layer for OpenCairn.
 *
 * Philosophy (matches app.js): honest, offline-first, serverless by default.
 *   - Reports live in localStorage per trail ('pulse:<trailId>'). No account.
 *   - If window.FIREWATCH_API is set, reports POST to
 *     <FIREWATCH_API>/trail/<id>/reports and syncPulse() merges the shared
 *     feed back in. Unset → fully local, and the UI says so ("this device").
 *   - Freshness is modelled, not faked: every summary carries a 0–1 recency
 *     score + a human label, decayed per condition kind (a closure stays
 *     relevant for weeks; "trail is clear" goes stale in days).
 *   - Trace recency folds in when a trace source exists (window.TrailTraces,
 *     or app.js's dropped cairns as a weak fallback) → "walked ~3h ago".
 *
 * FRESHNESS MODEL
 *   score(report) = 2 ^ ( -ageHours / halfLifeHours(kind) )
 *   Exponential half-life decay: a report at exactly one half-life old scores
 *   0.5. Per-kind half-lives (hours):
 *     closure      336  (2 weeks — closures persist; stale ones still matter)
 *     washout      168  (1 week — terrain damage doesn't heal fast)
 *     blowdown     120  (5 days — crews clear these, but slowly)
 *     ice           36   (1.5 days — melts/refreezes with the weather)
 *     water-source 96   (4 days — springs/creeks change with rain)
 *     clear        72   (3 days — "all good" is only news while it's fresh)
 *   Labels (on the score):
 *     >= 0.75 'fresh' · >= 0.45 'recent' · >= 0.20 'aging'
 *     >= 0.05 'stale' · else 'expired' (expired reports drop out of summaries)
 *   Pulse score for a trail = max over its non-expired reports, nudged up
 *   (+0.15, capped at 1) when a walk-trace is fresher than every report —
 *   someone walking it recently is itself evidence the intel is current.
 *
 * Public API (window.TrailPulse):
 *   addReport({trailId, kind, note, author}) → report | null
 *   getReports(trailId)                      → report[] (newest first)
 *   getPulse(trailId)                        → summary  (see below)
 *   freshness(atMs [, nowMs] [, kind])       → { score, label, ageMs, ageText }
 *   renderPulseBadge(summary)                → XSS-safe HTML string
 *   syncPulse(trailId)                       → Promise<report[]> (backend merge)
 *   KINDS                                    → the six valid kind strings
 *
 * summary = { trailId, score, label, line, walked, reports, counts, local }
 *   line   e.g. "walked ~3h ago · washout flagged at Boulder Field 2 days ago"
 *   walked { at, ageText, source } | null
 *   local  true when no backend is configured (device-only data)
 *
 * Guarded throughout: no throw escapes; every storage / network / hook touch
 * is wrapped. Pure vanilla JS, zero dependencies, safe to load before app.js.
 */
'use strict';

(function () {
  /* ----------------------------- constants ----------------------------- */
  var KINDS = ['washout', 'blowdown', 'ice', 'water-source', 'clear', 'closure'];

  // per-kind half-life in hours (see FRESHNESS MODEL above)
  var HALF_LIFE_H = {
    'closure': 336,
    'washout': 168,
    'blowdown': 120,
    'ice': 36,
    'water-source': 96,
    'clear': 72,
  };
  var DEFAULT_HALF_LIFE_H = 96;

  // label thresholds, checked top-down
  var LABELS = [
    [0.75, 'fresh'],
    [0.45, 'recent'],
    [0.20, 'aging'],
    [0.05, 'stale'],
  ];
  var EXPIRED = 'expired';

  // display metadata per kind (glyphs match app.js's TYPE table spirit)
  var KIND_META = {
    'washout':      { glyph: '!', word: 'washout',      tone: 'warn' },
    'blowdown':     { glyph: '✕', word: 'blowdown',     tone: 'warn' },
    'ice':          { glyph: '❄', word: 'ice',          tone: 'warn' },
    'water-source': { glyph: '~', word: 'water source', tone: 'info' },
    'clear':        { glyph: '✓', word: 'clear',        tone: 'good' },
    'closure':      { glyph: '⛔', word: 'closure',     tone: 'bad'  },
  };

  var NOTE_MAX = 280;   // keep reports tweet-sized; UI stays honest & compact
  var AUTHOR_MAX = 40;
  var MAX_STORED = 50;  // per-trail cap so localStorage never bloats

  /* ----------------------------- tiny utils ----------------------------- */
  // Own copies — pulse.js must not depend on app.js load order.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lsGet(k, d) {
    try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }
  function now() { return Date.now(); }
  function apiBase() {
    try {
      var b = (typeof window !== 'undefined') ? window.FIREWATCH_API : null;
      if (typeof b === 'string' && /^https?:\/\//.test(b)) return b.replace(/\/+$/, '');
    } catch (e) {}
    return null;
  }
  function storeKey(trailId) { return 'pulse:' + String(trailId); }

  /* "~3h ago" style humanizer — coarse on purpose (trail intel, not a stopwatch) */
  function agoText(ageMs) {
    if (!isFinite(ageMs) || ageMs < 0) ageMs = 0;
    var m = ageMs / 60000;
    if (m < 2) return 'just now';
    if (m < 60) return '~' + Math.round(m) + 'm ago';
    var h = m / 60;
    if (h < 48) return '~' + Math.round(h) + 'h ago';
    var d = h / 24;
    if (d < 14) return Math.round(d) + ' days ago';
    var w = d / 7;
    if (w < 9) return Math.round(w) + ' weeks ago';
    return Math.round(d / 30) + ' months ago';
  }

  /* ----------------------------- freshness ----------------------------- */
  /* freshness(atMs [, nowMs] [, kind]) → { score, label, ageMs, ageText }
   * Exponential half-life decay, per-kind. Bad timestamps → expired, not NaN. */
  function freshness(atMs, nowMs, kind) {
    var t = Number(atMs);
    var n = (nowMs == null) ? now() : Number(nowMs);
    if (!isFinite(t) || !isFinite(n) || t <= 0) {
      return { score: 0, label: EXPIRED, ageMs: Infinity, ageText: 'unknown' };
    }
    var ageMs = Math.max(0, n - t); // clock-skewed future reports read as "just now"
    var halfLifeH = HALF_LIFE_H[kind] || DEFAULT_HALF_LIFE_H;
    var score = Math.pow(2, -(ageMs / 3600000) / halfLifeH);
    score = Math.max(0, Math.min(1, score));
    var label = EXPIRED;
    for (var i = 0; i < LABELS.length; i++) {
      if (score >= LABELS[i][0]) { label = LABELS[i][1]; break; }
    }
    return { score: score, label: label, ageMs: ageMs, ageText: agoText(ageMs) };
  }

  /* ----------------------------- store ----------------------------- */
  function normalizeReport(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var kind = String(raw.kind || '');
    if (KINDS.indexOf(kind) === -1) return null;
    var trailId = raw.trailId;
    if (trailId == null || trailId === '') return null;
    var at = Number(raw.at);
    if (!isFinite(at) || at <= 0) at = now();
    return {
      id: raw.id ? String(raw.id).slice(0, 48)
                 : 'p' + at.toString(36) + Math.random().toString(36).slice(2, 7),
      trailId: (typeof trailId === 'number') ? trailId : String(trailId),
      kind: kind,
      note: String(raw.note == null ? '' : raw.note).trim().slice(0, NOTE_MAX),
      at: at,
      author: String(raw.author == null ? '' : raw.author).trim().slice(0, AUTHOR_MAX),
    };
  }

  function getReports(trailId) {
    var list = lsGet(storeKey(trailId), []);
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = normalizeReport(list[i]);
      if (r) out.push(r);
    }
    out.sort(function (a, b) { return b.at - a.at; });
    return out;
  }

  function saveReports(trailId, list) {
    list.sort(function (a, b) { return b.at - a.at; });
    return lsSet(storeKey(trailId), list.slice(0, MAX_STORED));
  }

  /* addReport({trailId, kind, note, author}) → stored report or null.
   * Always lands locally first; backend POST (if configured) is fire-and-forget
   * so a dead network never loses a report or blocks the UI. */
  function addReport(input) {
    var r = normalizeReport(input);
    if (!r) return null;
    // default author from app.js's saved handle when the caller gave none
    if (!r.author) {
      var h = lsGet('handle', '');
      if (typeof h === 'string' && h) r.author = h.slice(0, AUTHOR_MAX);
    }
    var list = getReports(r.trailId);
    list.push(r);
    saveReports(r.trailId, list);

    var base = apiBase();
    if (base && typeof fetch === 'function') {
      try {
        fetch(base + '/trail/' + encodeURIComponent(String(r.trailId)) + '/reports', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(r),
        }).catch(function () { /* offline / backend down — local copy stands */ });
      } catch (e) { /* fetch itself unavailable — stay local */ }
    }
    return r;
  }

  /* syncPulse(trailId) → Promise<report[]>: pull the shared feed and merge
   * (dedupe by id, else by kind+at). No backend → resolves with local list. */
  function syncPulse(trailId) {
    var local = getReports(trailId);
    var base = apiBase();
    if (!base || typeof fetch !== 'function') return Promise.resolve(local);
    return fetch(base + '/trail/' + encodeURIComponent(String(trailId)) + '/reports')
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (j) {
        var remote = j && Array.isArray(j.reports) ? j.reports : (Array.isArray(j) ? j : []);
        var seen = {};
        var merged = [];
        function fold(r) {
          var n = normalizeReport(r && !r.trailId ? Object.assign({}, r, { trailId: trailId }) : r);
          if (!n) return;
          var key = n.id + '|' + n.kind + '|' + n.at;
          if (seen[key] || seen[n.id]) return;
          seen[key] = true; seen[n.id] = true;
          merged.push(n);
        }
        local.forEach(fold);
        remote.forEach(fold);
        saveReports(trailId, merged);
        return getReports(trailId);
      })
      .catch(function () { return local; }); // degrade silently to local
  }

  /* ----------------------------- trace recency ----------------------------- */
  /* Optional hook: when did someone last WALK this trail?
   *   1) window.TrailTraces.lastWalked(trailId) → ms epoch (future trace layer)
   *   2) weak fallback: app.js's dropped cairns ('cairns' in LS) — a cairn
   *      dropped recently is evidence of a recent walk (unattributed to the
   *      trail, so only used as a hint and labelled 'cairn').
   * Returns { at, ageText, source: 'traces'|'cairn' } | null. Never throws. */
  function traceRecency(trailId) {
    try {
      if (typeof window !== 'undefined' && window.TrailTraces &&
          typeof window.TrailTraces.lastWalked === 'function') {
        var t = Number(window.TrailTraces.lastWalked(trailId));
        if (isFinite(t) && t > 0) return { at: t, ageText: agoText(now() - t), source: 'traces' };
      }
    } catch (e) {}
    try {
      var cairns = lsGet('cairns', []);
      if (Array.isArray(cairns) && cairns.length) {
        var latest = 0;
        for (var i = 0; i < cairns.length; i++) {
          var at = Number(cairns[i] && cairns[i].at);
          if (isFinite(at) && at > latest) latest = at;
        }
        // only meaningful as a walk-hint while reasonably fresh (48h)
        if (latest > 0 && now() - latest < 48 * 3600000) {
          return { at: latest, ageText: agoText(now() - latest), source: 'cairn' };
        }
      }
    } catch (e) {}
    return null;
  }

  /* ----------------------------- pulse summary ----------------------------- */
  /* getPulse(trailId) → freshness-scored summary of the trail's condition. */
  function getPulse(trailId) {
    var reports = getReports(trailId);
    var walked = traceRecency(trailId);
    var nowMs = now();

    var live = [];      // non-expired reports, each annotated with freshness
    var counts = {};    // kind → live count
    var best = 0;       // trail-level score = max live report score
    for (var i = 0; i < reports.length; i++) {
      var r = reports[i];
      var f = freshness(r.at, nowMs, r.kind);
      if (f.label === EXPIRED) continue;
      live.push({ report: r, freshness: f });
      counts[r.kind] = (counts[r.kind] || 0) + 1;
      if (f.score > best) best = f.score;
    }

    // trace nudge: a walk fresher than every report bumps confidence a notch
    if (walked && (!live.length || walked.at > live[0].report.at)) {
      best = Math.min(1, best + 0.15);
    }

    var label = EXPIRED;
    if (live.length || walked) {
      label = 'stale';
      for (var j = 0; j < LABELS.length; j++) {
        if (best >= LABELS[j][0]) { label = LABELS[j][1]; break; }
      }
    }

    // human line: "walked ~3h ago · washout flagged at Boulder Field 2 days ago"
    var bits = [];
    if (walked) bits.push('walked ' + walked.ageText);
    if (live.length) {
      var top = live[0]; // newest live report (getReports sorts newest-first)
      var meta = KIND_META[top.report.kind] || { word: top.report.kind };
      var verb = (top.report.kind === 'clear') ? 'reported'
               : (top.report.kind === 'water-source') ? 'noted'
               : 'flagged';
      bits.push(meta.word + ' ' + verb +
        (top.report.note ? ' at ' + top.report.note : '') +
        ' ' + top.freshness.ageText);
      if (live.length > 1) bits.push((live.length - 1) + ' more report' + (live.length > 2 ? 's' : ''));
    }
    if (!bits.length) bits.push('no recent reports');

    return {
      trailId: (typeof trailId === 'number') ? trailId : String(trailId),
      score: Math.round(best * 1000) / 1000,
      label: label,
      line: bits.join(' · '),
      walked: walked,
      reports: live,
      counts: counts,
      local: !apiBase(),
    };
  }

  /* ----------------------------- render ----------------------------- */
  /* renderPulseBadge(summary) → HTML string for the route-detail sheet.
   * EVERY user-originated string (notes, authors — already folded into
   * summary.line — plus per-report note/author below) passes through esc().
   * Styling hooks only (pulse-badge / pulse-dot / pulse-line / pulse-rep),
   * no inline handlers, no javascript: URLs — safe to innerHTML. */
  function renderPulseBadge(summary) {
    if (!summary || typeof summary !== 'object') return '';
    var label = esc(summary.label || EXPIRED);
    var score = Number(summary.score);
    if (!isFinite(score)) score = 0;
    score = Math.max(0, Math.min(1, score));
    var pct = Math.round(score * 100);

    var worst = null; // pick the badge tone from the most severe live kind
    var order = ['closure', 'washout', 'blowdown', 'ice', 'water-source', 'clear'];
    var counts = summary.counts || {};
    for (var i = 0; i < order.length; i++) {
      if (counts[order[i]]) { worst = order[i]; break; }
    }
    var tone = worst ? (KIND_META[worst] || {}).tone || 'info'
             : (summary.walked ? 'good' : 'none');

    var html =
      '<div class="pulse-badge pulse-' + esc(tone) + '" data-freshness="' + label + '">' +
        '<span class="pulse-dot" style="opacity:' + (0.35 + score * 0.65).toFixed(2) + '"' +
          ' title="freshness ' + pct + '%"></span>' +
        '<span class="pulse-line">' + esc(summary.line || 'no recent reports') + '</span>' +
        '<span class="pulse-meta tiny">' + label + ' · ' + pct + '%' +
          (summary.local ? ' · this device' : ' · shared') + '</span>' +
      '</div>';

    // expandable detail rows (max 5) — note + author + age, all escaped
    var reps = Array.isArray(summary.reports) ? summary.reports.slice(0, 5) : [];
    if (reps.length) {
      html += '<div class="pulse-reps">';
      for (var k = 0; k < reps.length; k++) {
        var r = reps[k].report || {};
        var f = reps[k].freshness || {};
        var meta = KIND_META[r.kind] || { glyph: '•', word: String(r.kind || '?') };
        html +=
          '<div class="pulse-rep pulse-rep-' + esc((KIND_META[r.kind] || {}).tone || 'info') + '">' +
            '<span class="pulse-glyph" aria-hidden="true">' + esc(meta.glyph) + '</span>' +
            '<span class="pulse-word">' + esc(meta.word) + '</span>' +
            (r.note ? '<span class="pulse-note">' + esc(r.note) + '</span>' : '') +
            '<span class="pulse-when tiny">' + esc(f.ageText || '') +
              (r.author ? ' · ' + esc(r.author) : '') + '</span>' +
          '</div>';
      }
      html += '</div>';
    }
    return html;
  }

  /* ----------------------------- export ----------------------------- */
  var api = {
    KINDS: KINDS.slice(),
    addReport: addReport,
    getReports: getReports,
    getPulse: getPulse,
    freshness: freshness,
    renderPulseBadge: renderPulseBadge,
    syncPulse: syncPulse,
  };
  if (typeof window !== 'undefined') window.TrailPulse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // tests
})();
