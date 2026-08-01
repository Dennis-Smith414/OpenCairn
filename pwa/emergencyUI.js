/**
 * emergencyUI.js — the emergency screen. Self-contained, inline-styled (renders
 * even if styles.css failed), no model / no network dependency.
 *
 * Primary-call priority (who the big button dials):
 *   1. a custom "call first" contact (e.g. a kid's parent), if set
 *   2. GPS-auto: the correct country's emergency number for where you are
 *   3. the default (112, GSM-universal)
 * Redundant paths, any of which places the call:
 *   • the big PRIMARY button   • tap a national number   • say a number/"help"
 *   • volume up-up-down-down-up-up -> 911   • the glowing SOS button
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  var E = function () { return window.Emergency || null; };
  var T = function () { return window.EmergencyTrigger || null; };
  var LSget = function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  var LSset = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  var ENABLED = function () { return LSget('emergencyEnabled', true); };
  var CUSTOM = function () { return String(LSget('emergencyPrimary', '') || '').replace(/[^\d*#+]/g, ''); };
  var GPSAUTO = function () { return LSget('emergencyGPS', false); };
  var DEFNUM = function () { return LSget('emergencyNumber', (E() && E().DEFAULT_NUMBER) || '112'); };

  var css = '' +
  '#em-sos{position:fixed;left:14px;bottom:14px;z-index:2147483000;width:60px;height:60px;border-radius:50%;' +
    'background:#c62828;color:#fff;border:3px solid #fff;font:800 15px/1 system-ui,sans-serif;letter-spacing:.06em;' +
    'cursor:pointer;display:flex;align-items:center;justify-content:center;animation:em-glow 2s infinite}' +
  '@keyframes em-glow{0%,100%{box-shadow:0 0 0 0 rgba(229,57,53,.7),0 3px 14px rgba(0,0,0,.5)}' +
    '50%{box-shadow:0 0 20px 7px rgba(229,57,53,.55),0 3px 14px rgba(0,0,0,.5)}}' +
  '#em-sos:active{transform:scale(.94)}' +
  '#em-ov{position:fixed;inset:0;z-index:2147483001;background:#0b0002;color:#fff;display:none;flex-direction:column;' +
    'padding:16px;font-family:system-ui,-apple-system,sans-serif;overflow:auto}' +
  '#em-ov.show{display:flex}' +
  '.em-h{font-weight:900;letter-spacing:.12em;color:#ff5a5a;font-size:clamp(1.3rem,6vw,2rem);text-align:center;margin:2px 0}' +
  '.em-sub{text-align:center;color:#f4cccc;font-size:.9rem;margin-bottom:10px}' +
  '#em-primary{background:#c1121f;border:3px solid #ff5a5a;border-radius:18px;color:#fff;padding:22px 12px;' +
    'font-weight:900;cursor:pointer;text-align:center;margin-bottom:14px;box-shadow:0 0 22px rgba(229,57,53,.4)}' +
  '#em-primary b{display:block;font-size:2.3rem;line-height:1.05}' +
  '#em-primary span{font-size:.85rem;font-weight:700;color:#ffd7d7}' +
  '#em-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
  '.em-num{background:#151515;border:2px solid #444;border-radius:14px;color:#fff;padding:15px 8px;font-weight:900;cursor:pointer;text-align:center}' +
  '.em-num b{display:block;font-size:1.7rem;line-height:1}.em-num span{font-size:.68rem;color:#bbb;font-weight:600}' +
  '#em-say{margin-top:14px;background:#8e0000;color:#fff;border:none;border-radius:16px;padding:18px;font-weight:900;font-size:1.05rem;cursor:pointer}' +
  '#em-say.listening{animation:em-glow 1s infinite}' +
  '#em-status{text-align:center;min-height:20px;margin-top:10px;font-size:1rem;color:#ffd}' +
  '#em-hint{text-align:center;color:#888;font-size:.78rem;margin-top:14px}' +
  '#em-x{position:absolute;top:12px;right:14px;background:none;border:1px solid #555;color:#ccc;border-radius:999px;padding:6px 12px;font-size:.85rem;cursor:pointer}' +
  '#em-gear{position:absolute;top:12px;left:14px;background:none;border:none;color:#888;font-size:1.25rem;cursor:pointer}' +
  '#em-set{display:none;margin-top:14px;background:#111;border:1px solid #333;border-radius:12px;padding:14px;font-size:.9rem}' +
  '#em-set.show{display:block}#em-set label{display:flex;align-items:center;gap:10px;padding:8px 0}' +
  '#em-set input[type=text]{background:#000;border:1px solid #444;color:#fff;border-radius:8px;padding:8px;width:120px;font-size:1rem}' +
  '#em-set .em-man{background:#c62828;color:#fff;border:none;border-radius:10px;padding:12px 16px;font-weight:800;cursor:pointer;width:100%;margin-top:6px}';

  function inject() {
    if (document.getElementById('em-style')) return;
    var st = document.createElement('style'); st.id = 'em-style'; st.textContent = css; document.head.appendChild(st);
    var sos = document.createElement('button'); sos.id = 'em-sos'; sos.type = 'button'; sos.setAttribute('aria-label', 'Emergency'); sos.textContent = 'SOS'; sos.onclick = open;
    document.body.appendChild(sos);
    var ov = document.createElement('div'); ov.id = 'em-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Emergency');
    ov.innerHTML =
      '<button id="em-gear" aria-label="Emergency settings">⚙</button><button id="em-x" type="button">✕ close</button>' +
      '<div class="em-h">EMERGENCY</div><div class="em-sub">Volume: up up down down up up = 911</div>' +
      '<button id="em-primary" type="button"><b>—</b><span>—</span></button>' +
      '<div id="em-grid"></div>' +
      '<button id="em-say" type="button">🎙️ SAY A NUMBER OR “HELP”</button>' +
      '<div id="em-status"></div><div id="em-set"></div>' +
      '<div id="em-hint">Opens your dialer with the number ready. Auto-dial is the native app.</div>';
    document.body.appendChild(ov);
    document.getElementById('em-x').onclick = close;
    document.getElementById('em-say').onclick = listen;
    document.getElementById('em-primary').onclick = function () { var n = document.getElementById('em-primary').getAttribute('data-num'); if (n) dial(n, 'primary'); };
    document.getElementById('em-gear').onclick = function () { var s = document.getElementById('em-set'); s.classList.toggle('show'); if (s.classList.contains('show')) renderSettings(); };
    applyEnabled();
  }

  function speak(m) { try { if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(m); window.speechSynthesis.speak(u); } } catch (e) {} }
  function status(m) { var s = document.getElementById('em-status'); if (s) s.textContent = m || ''; }

  function setPrimary(number, label) {
    var b = document.getElementById('em-primary'); if (!b) return;
    b.setAttribute('data-num', number || '');
    b.querySelector('b').textContent = number ? ('CALL ' + number) : '—';
    b.querySelector('span').textContent = label || '';
  }

  function resolvePrimary() {
    var e = E();
    var custom = CUSTOM();
    if (custom) { setPrimary(custom, 'your emergency contact'); return; }        // kid -> parent first
    if (GPSAUTO() && e && e.emergencyNumberFromGPS) {
      setPrimary(DEFNUM(), 'locating you…');
      e.emergencyNumberFromGPS(4000).then(function (r) { setPrimary(r.number, r.region + ' · auto'); });
      return;
    }
    setPrimary(DEFNUM(), 'default (112 works on most networks)');
  }

  function buildGrid() {
    var e = E(); if (!e) return; var g = document.getElementById('em-grid'); if (!g) return;
    g.innerHTML = e.EMERGENCY_NUMBERS.map(function (x) { return '<button class="em-num" data-num="' + x.num + '"><b>' + x.num + '</b><span>' + x.label + '</span></button>'; }).join('');
    Array.prototype.forEach.call(g.querySelectorAll('.em-num'), function (b) { b.onclick = function () { dial(b.getAttribute('data-num'), 'button'); }; });
  }

  function open() {
    if (!ENABLED()) { LSset('emergencyEnabled', true); applyEnabled(); }        // opening implies wanting it on
    var ov = document.getElementById('em-ov'); if (!ov) return;
    buildGrid(); resolvePrimary(); ov.classList.add('show');
    if (T()) T().setArmed(true);
    status(''); speak('Emergency. Tap the big button to call, or say a number. To call 9 1 1, press volume up up down down up up.');
  }
  function close() { var ov = document.getElementById('em-ov'); if (ov) ov.classList.remove('show'); if (T()) T().setArmed(false); try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} }

  function dial(number, how) { var e = E(); if (!e) return; status('Dialing ' + number + '…'); speak('Dialing ' + String(number).split('').join(' ')); e.dialNumber(number); }

  function listen() {
    var e = E(); if (!e) return;
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) { status('Voice not available — tap a number.'); return; }
    var btn = document.getElementById('em-say'); var rec;
    try { rec = new Rec(); } catch (err) { status('Voice failed — tap a number.'); return; }
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
    btn.classList.add('listening'); status('Listening…'); var done = false;
    rec.onresult = function (ev) { done = true; var txt = (ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
      var r = e.interpretEmergency(txt, { mode: 'armed', defaultNumber: document.getElementById('em-primary').getAttribute('data-num') || DEFNUM() });
      btn.classList.remove('listening');
      if (r.action === 'dial') dial(r.number, 'voice'); else { status('Heard “' + txt + '” — say a number again, or tap one.'); speak('I did not catch a number. Say it again, or tap a number.'); } };
    rec.onerror = function () { btn.classList.remove('listening'); status('Didn’t catch that — tap a number.'); };
    rec.onend = function () { if (!done) btn.classList.remove('listening'); };
    try { rec.start(); } catch (err) { btn.classList.remove('listening'); status('Tap a number.'); }
  }

  function renderSettings() {
    var s = document.getElementById('em-set'); if (!s) return;
    s.innerHTML =
      '<label><input type="checkbox" id="em-en"> Emergency SOS enabled</label>' +
      '<label>Call first <input type="text" id="em-cust" placeholder="parent / contact" value="' + CUSTOM() + '" inputmode="tel"></label>' +
      '<div style="color:#888;font-size:.78rem;margin:-4px 0 6px 0">Set a number to call before services — e.g. a kid calls a parent first.</div>' +
      '<label><input type="checkbox" id="em-gps"> Auto-pick country by GPS (else 112)</label>' +
      '<label>Default <input type="text" id="em-def" value="' + DEFNUM() + '" inputmode="numeric"></label>' +
      '<button type="button" id="em-man" class="em-man">☎ CALL 911 NOW</button>';
    var en = document.getElementById('em-en'); en.checked = ENABLED(); en.onchange = function () { LSset('emergencyEnabled', en.checked); applyEnabled(); };
    var cust = document.getElementById('em-cust'); cust.onchange = function () { LSset('emergencyPrimary', String(cust.value).replace(/[^\d*#+]/g, '')); resolvePrimary(); };
    var gps = document.getElementById('em-gps'); gps.checked = GPSAUTO(); gps.onchange = function () { LSset('emergencyGPS', gps.checked); resolvePrimary(); };
    var def = document.getElementById('em-def'); def.onchange = function () { var v = String(def.value).replace(/[^\d*#+]/g, ''); if (v) { LSset('emergencyNumber', v); resolvePrimary(); } };
    document.getElementById('em-man').onclick = function () { dial('911', 'manual'); };
  }

  function applyEnabled() { var sos = document.getElementById('em-sos'); if (sos) sos.style.display = ENABLED() ? 'flex' : 'none'; }

  function init() {
    inject();
    if (T()) T().start({ onActivate: open, on911: function () { dial('911', 'volume'); }, bindTestKeys: /[?&]emtest=1/.test(location.search) });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.EmergencyUI = { open: open, close: close };
})();
