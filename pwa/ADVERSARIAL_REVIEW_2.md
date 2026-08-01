# ADVERSARIAL REVIEW 2 — OPENCARN PWA

## P0 CRASH / SECURITY
### 1. Active Microphone and Recording Leaked in Background after Voice Assistant Pane Closed
* **File:Line:** [edgeAI.js:428](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/edgeAI.js#L428) (`listenOnce`) / [app.js:847](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L847) (`ptt.onclick`)
* **Failing Input / Repro:** Open the voice assistant drawer (`#/voice`), tap the mic button to start SpeechRecognition (red browser recording dot appears), and immediately tap the "×" close button or scrim.
* **Quantified Metric:** 100% microphone exposure. The active SpeechRecognition instance is never aborted, keeping the microphone active for up to 9,000ms in the background after the UI panel is closed.
* **One-Line Fix:** Expose a cancellation method from `EdgeAI` (wrapping `rec.abort()`) and call it inside `closeSheet()` in `app.js`.

---

## P1 FUNCTIONAL
### 2. Uncaught TypeError / Crash when Map Engine is Undefined or Fails to Initialize
* **File:Line:** [app.js:635](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L635) (`routeDetail`), [app.js:652](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L652) (`waypointView`), [app.js:671](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L671) (`onclick`), [app.js:732](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L732) (`onclick`)
* **Failing Input / Repro:** Simulate a map initialization failure (e.g. block `maplibregl` or throw in `initMap`), then navigate to `#/waypoint/10-w0` or search a place and select a result, or click the "Offline" button on a route detail page.
* **Quantified Metric:** 100% failure rate (TypeError: Cannot read properties of undefined (reading 'flyTo' / 'fitBounds')).
* **One-Line Fix:** Add `if (!map) return;` guards before calling `map.flyTo` and `map.fitBounds`.

### 3. Closed Bottom Sheet Interactive Elements Remain in Keyboard-Tab Order and Accessibility Tree
* **File:Line:** [styles.css:142](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/styles.css#L142) (`.sheet`)
* **Failing Input / Repro:** Close the bottom sheet. Press the `Tab` key repeatedly on the keyboard. Focus shifts to hidden elements inside the closed off-screen container.
* **Quantified Metric:** ~15+ off-screen interactive elements remain active in the accessibility tree when the panel is closed.
* **One-Line Fix:** Add `visibility: hidden;` to `.sheet` when it lacks the `.open` class, and toggle it to `visible` during transitions.

### 4. GPU capabilities/Chrome Nano Probes Block Map Initialization and Initial Paint
* **File:Line:** [webProfile.js:108](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/webProfile.js#L108) (`probeWebGPU`) / [app.js:1329](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/app.js#L1329) (`boot`)
* **Failing Input / Repro:** Run in a virtualized or degraded hardware environment where `navigator.gpu.requestAdapter()` hangs indefinitely.
* **Quantified Metric:** Latency of 2,000ms delay on initial rendering (map container is blank during the probe block).
* **One-Line Fix:** Reduce `withTimeout` to `200ms` in `webProfile.js` or initialize the map container asynchronously.

### 5. Gemini Nano LLM Model Download Bypasses Resource/Data-Saver Guard on Lite Tier
* **File:Line:** [edgeAI.js:507](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/edgeAI.js#L507) (`interpret`) / [edgeAI.js:239](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/edgeAI.js#L239) (`nanoInterpret`)
* **Failing Input / Repro:** Open app on a low-resource device (with Data Saver active), navigate to `#/voice` (typed fallback), and input any query.
* **Quantified Metric:** Initiates a 1.0+ GB model download over data-constrained connections.
* **One-Line Fix:** Gate the `nanoInterpret()` invocation inside `interpret()` with a check for `State.profile.features.chromeNano`.

### 6. Unbounded Static Shell Cache Leak of Same-Origin Dynamic Assets
* **File:Line:** [sw.js:137](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/sw.js#L137) (`fetch` handler)
* **Failing Input / Repro:** Host the PWA on an origin that serves dynamic GET endpoints (e.g. `/api/status`) and query them.
* **Quantified Metric:** 100% of same-origin network misses are saved into `SHELL_CACHE`, caching dynamic endpoints forever and wasting storage.
* **One-Line Fix:** Cache requests inside the same-origin handler only if their relative path is present in the `SHELL` array.

---

## P2 QUALITY
### 7. Unhandled Promise Rejection in Service Worker on Cache Put Failures
* **File:Line:** [sw.js:110](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/sw.js#L110), [sw.js:126](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/sw.js#L126), [sw.js:145](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/sw.js#L145) (`c.put`)
* **Failing Input / Repro:** Run the PWA when the browser storage quota is exhausted.
* **Quantified Metric:** 100% of writes to Cache Storage on quota limits trigger uncaught promise rejections.
* **One-Line Fix:** Append `.catch(() => {})` to all `c.put(...)` invocations.

### 8. Tap Target Sizing Below Minimum Accessible Guidelines on Mobile Viewports
* **File:Line:** [styles.css:76](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/styles.css#L76) (`.btn.icon`)
* **Failing Input / Repro:** Resize the viewport width below 560px and look at top bar controls.
* **Quantified Metric:** Tap targets are reduced to 42px * 42px (below standard WCAG 44px/Android 48px).
* **One-Line Fix:** Retain `width: 44px; height: 44px` in the mobile media query.

### 9. Lost Cache Trimming / LRU Execution due to Service Worker Deactivation during Timeout
* **File:Line:** [sw.js:71](file:///tmp/claude-1000/-home-osprey/8a236735-d746-4c4b-8724-bbd27542a9e5/scratchpad/pwa_full/sw.js#L71) (`scheduleTrim`)
* **Failing Input / Repro:** Pan map to request many tiles, then close tab. The browser terminates the service worker.
* **Quantified Metric:** 8,000ms delay. The scheduled timeout is aborted prior to execution, leaking tile cache size beyond the `TILE_LIMIT` of 1,600.
* **One-Line Fix:** Reduce the trim delay to `1000ms` or perform the trim immediately on a background task queue.

---

## VERDICT
* **COUNTS:** P0: 1 | P1: 5 | P2: 3
* **VERDICT:** DO-NOT-SHIP
