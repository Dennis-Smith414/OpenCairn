# OpenCairn Adversarial Review

This document contains a security, crash, performance, and accessibility audit of the OpenCairn full PWA codebase.

## Executive Summary

- **Verdict:** **SHIP-WITH-FIXES**
- **Severity Counts:**
  - **P0 (Critical Security/Crash):** 1
  - **P1 (High Impact / Functional Crash / Deploy Blocker):** 3
  - **P2 (Medium Impact / Accessibility / Minor Bug):** 2

---

## Findings & Remediation Plans

### P0: DOM-Based XSS via Hike Invitation Deep-Link

* **File & Line Evidence:** [app.js:L474](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L474) (`fmtWhen`) and [app.js:L1091-1093](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L1091-L1093) (`joinCard` innerHTML injection)
* **Impact:** Critical. A malicious actor can craft a deep-link with a base64-encoded payload containing arbitrary HTML/JavaScript inside the date field (e.g. `#/hike=...`). When parsed by `joinCard`, the invalid date is returned unescaped by `fmtWhen` and directly injected into the sheet's `.innerHTML`, executing malicious code in the context of the user's browser.
* **Remediation Plan:** Ensure `fmtWhen` always returns HTML-escaped output using the defined `esc` helper.

```diff
-function fmtWhen(iso) { try { return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return iso; } }
+function fmtWhen(iso) {
+  try {
+    const d = new Date(iso);
+    if (isNaN(d.getTime())) throw new Error();
+    return esc(d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
+  } catch {
+    return esc(iso);
+  }
+}
```

---

### P1: Application Crash on Calendar Export of Invalid Date

* **File & Line Evidence:** [app.js:L475](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L475) (`icsStamp`) and [app.js:L1115-1123](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L1115-L1123) (calendar export handlers)
* **Impact:** High. If a deep-link is opened with an invalid date string, `const start = new Date(when);` evaluates to `Invalid Date`. When the user clicks the "Calendar" or "Google Calendar" export buttons, the handler triggers `icsStamp(start)` which attempts to call `start.toISOString()`. This throws an unhandled `RangeError: Invalid time value` and crashes the application context.
* **Remediation Plan:** Guard the `icsStamp` function to return an empty string or handle invalid dates gracefully.

```diff
-function icsStamp(d) { return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'; }
+function icsStamp(d) {
+  try {
+    if (!d || isNaN(d.getTime())) return '';
+    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
+  } catch {
+    return '';
+  }
+}
```

---

### P1: Uncaught TypeErrors in Router When Map Engine Fails to Load

* **File & Line Evidence:** [app.js:L348-350](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L348-L350), [app.js:L364](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L364), [app.js:L367](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L367) (`selectRoute`), and [app.js:L640](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L640) (`waypointView`)
* **Impact:** High. If MapLibre GL (`maplibregl` script) fails to load, `boot()` catches it and returns early, leaving the `map` variable `undefined`. However, the hash router remains fully active. If a deep link is parsed (e.g. `#/route/12`), the app calls `selectRoute()` which directly executes `map.getLayer(...)` and `map.fitBounds()`. This throws `TypeError: Cannot read properties of undefined (reading 'getLayer')`, locking the UI and preventing the user from using the rest of the application (e.g. browsing the text-based routes list).
* **Remediation Plan:** Add defensive checks to `selectRoute`, `waypointView`, and other sheet click handlers to prevent invoking map functions when `map` is undefined.

```diff
 function selectRoute(id, { zoom = true } = {}) {
   State.selectedId = id;
+  if (!map) return;
   if (map.getLayer('trails-sel')) map.setFilter('trails-sel', ['==', ['get', 'id'], id]);
```

---

### P1: TypeError Crash on Voice-Dropped Cairn Labels

* **File & Line Evidence:** [app.js:L873](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L873)
* **Impact:** High/Medium. If the AI model (Gemini Nano) returns a structured response where `label` is not a string (e.g., a number like `101` or a nested object), `(args.label || '')` evaluates to that non-string entity. The subsequent call to `.trim()` throws `TypeError: ...trim is not a function`. Although caught by `executeCalls`, the action silently fails and logs "That action failed." to the user.
* **Remediation Plan:** Cast `args.label` to string before trimming.

```diff
-      const c = { id: 'c' + Date.now(), label: (args.label || '').trim() || 'Cairn', coord: State.userPos.slice(), at: Date.now() };
+      const label = (args.label == null ? '' : String(args.label)).trim();
+      const c = { id: 'c' + Date.now(), label: label || 'Cairn', coord: State.userPos.slice(), at: Date.now() };
```

---

### P2: Low Contrast for Accent Color in Light Theme (A11y/WCAG)

* **File & Line Evidence:** [styles.css:L4](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/styles.css#L4) and [styles.css:L37](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/styles.css#L37)
* **Impact:** Medium. The accent color `--accent` in the light theme is `#0e83a3` (cyan). Against `--bg` (`#f4f1e8`) and `--surface` (`#fbf9f2`), this has a contrast ratio of only **4.08:1**, failing the WCAG AA requirement of **4.5:1** for body text. This affects readability of links and small UI interactive texts.
* **Remediation Plan:** Darken the light theme accent color to `#0c718d`, raising the contrast ratio to **4.95:1** to satisfy accessibility guidelines.

```diff
 :root{
-  --accent:#0e83a3; --accent-ink:#fff;
+  --accent:#0c718d; --accent-ink:#fff;
```

---

### P2: Web Speech API Timeout Timer Leak

* **File & Line Evidence:** [edgeAI.js:L430-475](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/edgeAI.js#L430-L475)
* **Impact:** Low. In `listenOnce()`, a timeout is scheduled to abort the speech recognizer if it hangs. However, if the listener finishes successfully via `onresult` or errors out via `onerror`, the scheduled timeout is never cleared. The timer continues running until it fires and calls `done()`, producing minor overhead and redundant cleanup attempts.
* **Remediation Plan:** Store the timer ID and clear the timeout upon execution closure.

```diff
     let rec = null;
     let settled = false;
+    let timer = null;
     const done = (result) => {
       if (settled) return;
       settled = true;
+      if (timer) clearTimeout(timer);
       try { if (rec) rec.abort(); } catch (_e) { /* ignore */ }
       resolve(result);
     };
...
       // Safety timeout so a hung recognizer can't wedge the voice turn.
       const ms = typeof options.timeoutMs === 'number' ? options.timeoutMs : 12000;
-      setTimeout(() => done({ ok: false, transcript: '', reason: 'listen timeout' }), ms);
+      timer = setTimeout(() => done({ ok: false, transcript: '', reason: 'listen timeout' }), ms);
```
