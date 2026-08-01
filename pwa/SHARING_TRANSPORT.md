# OpenCairn — Sharing Transport & Secure-Context Findings (Path C)

Owner: Path C (connective tissue). Scope: (1) WIRED transport, (2) cross-platform
INSTALL, (3) the SECURE-CONTEXT wall. Siblings own Path A (NodeMobile LAN seeder)
and Path B (`pwa/p2p/` browser WebRTC). This doc does not restate their transports;
it resolves the three cross-cutting concerns and grades every claim.

Evidence grades: **MEASURED** (ran it, have numbers) · **PROTOTYPED** (code written
+ statically verified, not run on target hardware) · **RESEARCHED** (documented
behavior, sourced) · **SPECULATIVE** (reasoned guess).

Environment note: this analysis ran on a headless Linux box with **no mobile browser
and no two-phone rig attached**. Nothing here about on-device browser runtime is
MEASURED. Where a sibling's committed code independently encodes the same constraint,
it is cited as corroboration, not as a measurement.

---

## 1. WIRED TRANSPORT ("wire to wire") — ranking + verdict

Goal: a USB-C cable between two phones yields a runnable offline app on the receiver.
Three mechanisms assessed.

### 1a. USB tethering / RNDIS (reuse the Path-A seeder over the wire)
**Verdict: DOES NOT WORK phone-to-phone on stock hardware. RESEARCHED.**

The attractive idea: USB-C cable → RNDIS makes a wired LAN → the Path-A seeder serves
HTTP over the wire instead of Wi-Fi, reusing everything. It fails on a driver-topology
fact, not a config gap:

- Android ships **only the CLIENT half of RNDIS**. A phone can be a USB *device*
  (tether *to* a PC, which holds the host-side driver) but **cannot be the USB
  *host*** for another phone. Connect two Androids with a C-to-C (or OTG) cable,
  enable USB tethering on one, and the other gets no interface — pinging fails.
  Working phone-to-phone USB LAN requires either root, a third-party bridge app, or
  a USB-Ethernet dongle on at least one end. (Arch/Gentoo wiki, XDA field reports.)
- **iOS is worse:** Apple explicitly states iPhone Personal Hotspot over USB is for a
  **Mac/PC only**; iOS-to-iOS must use Wi-Fi. There is no iPhone-to-iPhone USB LAN.
- Even if you forced a wired LAN, it inherits the **secure-context wall** (§3): the
  seeder serves `http://<usb-ip>`, which is not a secure origin, so the receiver still
  can't register a SW or use WebGPU from that origin. The wire changes the physical
  layer, not the origin problem.

So the "best wired option" premise is only true *conditionally*: RNDIS reuse is the
right architecture **iff** you can establish the L2 link, but stock phones can't
establish it, and the origin wall remains regardless.

### 1b. WebUSB direct (browser ↔ USB)
**Verdict: UNUSABLE for phone-to-phone. RESEARCHED.**

- **iOS: no WebUSB at all** (Safari/WebKit never implemented it; all iOS browsers are
  WebKit skins → zero support).
- **Android: WebUSB exists in Chrome/Edge/Opera/Samsung Internet** (since Chrome 61),
  but it is a **host→device** API. The browser must be the USB *host* talking to a
  peripheral that enumerates as a USB *device*. **Two phones both want to be host**,
  and a phone cannot present itself to a peer's browser as a WebUSB-visible device.
  There is no "WebUSB peer" mode. So even on the one platform that has the API, two
  phones can't use it to talk to each other.
- Also secure-context-gated and permission-prompt-gated per device.

### 1c. MTP / mass-storage FILE COPY sideload
**Verdict: CAN MOVE THE BUNDLE, CANNOT RUN THE APP. RESEARCHED (hard constraint).**

Native app exports the bundle to a folder → other phone copies via file manager →
opens `index.html`. The copy works; the run does not:

- Opening from **`file://` cannot register a Service Worker** (SW requires a secure
  *http(s)* origin or localhost; `file://` is neither). No SW ⇒ no offline app shell
  boot, no cache-first serving.
- `file://` also **blocks ES module imports** in most mobile browsers (opaque origin /
  CORS on module scripts) and **is not a secure context**, so **WebGPU is unavailable**
  — the Feedseed model cannot run.
- Net: a file-copied bundle is a dead static page. Fine for moving *data* onto a phone
  that already has the secured origin (e.g. drop the model file where the app can
  import it), useless as a way to *deliver a runnable app* to a fresh phone.

### Wired ranking (by robustness × reuse)
1. **USB tethering / RNDIS** — best *architecture* (reuses Path-A seeder wholesale),
   but **blocked on stock phones** (no host-side RNDIS; iOS forbids iOS↔iOS USB) and
   still origin-walled. Robustness today: **low**. Reuse if link existed: **high**.
2. **MTP / file-copy** — most *robust as a byte mover* (works on every OS, no drivers),
   but **cannot yield a runnable app** (`file://` kills SW/modules/WebGPU). Use only to
   ferry the *model* to an already-secured phone.
3. **WebUSB** — **worst**: iOS none, Android host-only, no phone-to-phone peer mode.

**Overall wired verdict:** there is **no robust stock-phone wired path that produces a
runnable offline app on the receiver.** Wi-Fi (Path A hotspot / Path B WebRTC-over-LAN)
remains the transport; the wire adds nothing a fresh phone can use, and none of the
three wired mechanisms dissolves the secure-context wall (§3). The wire's *only* honest
role is moving the **model bytes** to a phone that has **already** secured the origin.

---

## 2. CROSS-PLATFORM INSTALL — module + per-OS truth

### Files delivered
- `pwa/install/install.js` — dependency-free ES module (also attaches
  `window.OCInstall` for classic-script use). Captures `beforeinstallprompt`
  (Chromium), drives `prompt()`/`userChoice`, detects iOS Safari vs iOS in-app
  webview, detects standalone/installed, detects secure context, and exposes:
  - `strategy()` → `installed|prompt|ios-manual|ios-webview|insecure|menu-manual`
  - `promptInstall()`, `attachButton(btn,opts)`, `onChange(fn)`, `getState()`
  - `diagnose()` → async per-check readout + verdict (SW, cache, model, WebGPU, manifest).
- `pwa/install/install.html` — self-contained "Install &amp; Secure-Context Doctor":
  one-tap install button on Android, manual guidance on iOS, live diagnostics table +
  plain-language verdict. **Grade: PROTOTYPED** (syntax-verified with `node --check`;
  not exercised on physical Android/iOS from this environment).

Note: the main app (`app.js` ~L1693) already had inline `beforeinstallprompt`
handling. The new module is a clean, reusable, testable factoring of the same logic
plus the diagnostics probe; it does not fight the existing handler (both listen; last
prompt captured wins — for a reconstructed page you'd load one or the other).

### Manifest check (`pwa/manifest.webmanifest`) — installable on both? YES.
- `name` + `short_name` ✓ · `start_url` ✓ · `display: standalone` ✓ ·
  `icons` include 192 **and** 512 `any` + maskable ✓ · `id`, `scope`, `theme_color`,
  `background_color` ✓. Meets Chromium's installability metadata bar.
- iOS uses `apple-mobile-web-app-capable` + `apple-touch-icon` (present in
  `index.html`) plus the manifest's `display: standalone`.
- **Grade: PROTOTYPED** (manifest statically satisfies documented criteria; the actual
  install prompt on Android additionally needs a registered SW with a fetch handler
  served over https — see below — which the app has).

### Per-OS installability truth (of a RECEIVED / reconstructed PWA)
| OS | Installable? | Condition | Grade |
|----|-------------|-----------|-------|
| **Android / Chromium** | **Yes**, one-tap via `beforeinstallprompt` | served from **https** origin + registered SW w/ fetch handler + manifest. On `http://<ip>` the event never fires → **not installable**. | RESEARCHED |
| **iOS Safari** | **Yes**, manual only | user does **Share → Add to Home Screen**; Safari **never** fires `beforeinstallprompt`. Needs the page loaded in real Safari (not an in-app webview) over https. | RESEARCHED |
| **iOS in-app browser** (IG/FB/Gmail webview) | **No** | WKWebview can't A2HS; must reopen in Safari. | RESEARCHED |
| **Any OS on `http://<LAN/USB-IP>`** | **No** | insecure origin → no SW, no install, no WebGPU. | RESEARCHED |

**Bottom line:** the app is installable on both Android and iOS **only when the page is
served from a secure origin.** Installability is not blocked by the manifest or the
module — it is blocked, on every OS, by the same secure-context wall. That is the crux,
next.

---

## 3. THE SECURE-CONTEXT WALL — the definitive answer

### The rule
Service Workers, WebGPU, and persistent Cache Storage all require a **secure context**:
`https://…` **or** `http://localhost` / `127.0.0.1` / `[::1]`. Everything else —
including `http://<LAN-IP>`, `http://<USB-IP>`, and `file://` — is **not** secure and is
**permanently barred** from those APIs. (MDN Secure Contexts; W3C SW spec.)

### Q: Can a LAN/USB `http://<ip>` origin EVER register a SW or run WebGPU?
**No — not over plain http, ever.** RESEARCHED. Avenues examined:

- **Self-signed cert over https on mobile:** technically a secure *scheme*, but Chrome
  (desktop and Android) **refuses SW registration on an untrusted cert** and throws the
  full-page cert interstitial. To make it trusted you must **install the seeder's CA
  into the device's user trust store** (Android: Settings → Security → Install
  certificate; iOS: install profile **and** flip "Full Trust" in About → Certificate
  Trust Settings). That is a multi-step, scary, per-device manual operation, and on
  modern Android many apps/Chrome features distrust user-added CAs anyway. **UX cost:
  prohibitive for "hand my phone to a stranger on a trail."** It is not a viable
  bootstrap path. (Chromium issue 40423989; dev-HTTPS guides.)
- **`--unsafely-treat-insecure-origin-as-secure` / "insecure origins treated as
  secure" flag:** desktop-Chrome dev flag only; **not exposed on mobile** and not a
  field option.
- **`file://`:** not secure; also blocks modules. Dead.
- **Localhost:** secure, but a *peer's* IP is never your localhost. Dead for P2P.

There is **no browser API to mint a trusted https origin locally on an offline device.**

### Q: The likely resolution — validate it
**Claim:** the receiver must have obtained the app's code from a secure origin **once**
(e.g. one visit to `https://hawktalk.ai/pwademo`, cached by its SW). Thereafter,
phone-to-phone transfers need only move the **model (data)**; the code runs from the
already-secured cached origin.

**Validated TRUE against the actual code. Grade: RESEARCHED + code-confirmed
(PROTOTYPED validation via `pwa/install/install.js#diagnose()`, not device-MEASURED):**

- `sw.js` precaches the whole shell (`index.html`, `app.js`, `feedseedBackend.js`,
  vendored libs, trails) into `opencairn-shell-v6` on first secure visit. The **model
  is deliberately NOT precached** — `feedseedBackend.js` downloads it on opt-in into
  transformers.js's own `transformers-cache` bucket (CFG `cacheName:'transformers-cache'`,
  `approxBytes: 131MB` q4f16).
- **Secure context survives going offline.** Secure context is a property of the
  **origin**, not of network reachability. An installed/cached PWA opened with no
  internet is still served (by its SW) from `https://hawktalk.ai/pwademo` →
  `self.isSecureContext === true`. So a device that visited once, then goes offline
  forever, **keeps a runnable installed PWA** and **retains** SW + WebGPU + Cache
  Storage rights.
- **Receiving ONLY the model over P2P works.** Path B's `pwa/p2p/receiver.js`
  reconstructs by writing bytes back into the **same origin's** Cache Storage under the
  same URLs (`transformers-cache`), guarded by `if (!self.isSecureContext) throw`. On a
  device that already holds the secure origin, that write lands where
  `feedseedBackend.js` reads it, and the model runs on WebGPU — **zero internet**.
  Path B's `protocol.js` already scopes transfers to `TRANSFER_CACHES =
  [SHELL_CACHE, MODEL_CACHE]` for exactly this. This is **independent confirmation**
  from the sibling: two separately-built modules encode the same wall the same way.
- Over the wire (§1c), the same holds: a file-copied or seeder-pushed **model** dropped
  into `transformers-cache` on an already-secured phone runs; a file-copied **app** does
  not.

`diagnose()` reifies this as the **"ARMED"** state: *secure origin + shell cached +
manifest, model absent* → "receive the 131 MB weights from a peer, then it runs
offline."

### Q: Can a phone that has NEVER touched a secure origin be bootstrapped by a peer alone?
**No. Stated plainly, this is the load-bearing finding. RESEARCHED.**

A fresh phone, offline, that has never loaded the https origin, **cannot be turned into
a runnable offline AI app by a peer alone.** Every delivery channel a peer controls —
Wi-Fi `http://<ip>`, USB `http://<ip>`, `file://` copy — is an insecure origin, and no
insecure origin can register a SW or use WebGPU, and there is no local API to conjure a
trusted https origin. The peer can hand over **every byte** (shell + 131 MB model) and
the receiver still cannot execute it as an installed offline app.

**What this reshapes about the "outside civilization" story:**
- **First acquisition needs https exactly once**, somewhere with a secure origin — a
  visit to `hawktalk.ai/pwademo` (or a localhost/trusted-https kiosk). This is a
  one-time, connected (or trusted-cert) event.
- **Propagation is fully offline thereafter.** Once N phones have each done that one
  secure visit, they form a mesh that can top up / repair / re-deliver the **model**
  to each other with zero internet, forever. The *code* never needs to move again on
  a phone that has it; only the *data* propagates.
- The honest tagline is therefore **"secure once, spread offline"** — not "a virgin
  phone in the wilderness gets the AI from a neighbor." The latter is false on the
  open web platform. (The only ways to beat it are off-web: a native app store /
  sideloaded APK — Path A's native shell — or a device-trusted CA, both of which are
  a different distribution channel than "a browser peer.")

---

## Consolidated verdicts
- **Wired:** no stock-phone wire delivers a runnable app; RNDIS is right in theory but
  blocked (client-only on Android, forbidden iOS↔iOS) and still origin-walled; WebUSB
  is host-only/none-on-iOS; file-copy moves bytes but `file://` can't run the app. The
  wire's only real job is ferrying the **model** to an already-secured phone.
- **Install:** module + doctor shipped in `pwa/install/`; manifest satisfies both OSes;
  the app is installable on Android (one-tap) and iOS (manual Share→A2HS) **when served
  from a secure origin**, and installable on **neither** from `http://<ip>` or `file://`.
- **Secure context:** absolute. https-or-localhost only; self-signed needs a
  device-trusted CA (prohibitive UX); **first code acquisition needs https once**,
  after which **the model — and only the model — propagates offline** into
  `transformers-cache` on any phone that already holds the secured origin. A
  never-secured phone cannot be bootstrapped by a peer alone.
