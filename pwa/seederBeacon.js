/**
 * seederBeacon.js — advertise / discover a nearby Path-A SEEDER over the
 * existing off-grid LoRa mesh (comms.js → Meshtastic).
 *
 * THE TIE-IN
 *   The SEEDER itself is the NATIVE app hosting the LAN HTTP server
 *   (NodeMobile/.../seeder/seeder-server.js). But the seeder OPERATOR already
 *   has the full PWA + (usually) a paired Meshtastic node, so THEIR PWA can
 *   shout "I'm seeding the app — here's the hotspot" across the LoRa mesh.
 *   Any hiker in LoRa range who still has a working PWA + node sees the beacon
 *   and can walk over, join the hotspot (QR/captive portal), and pull a fresh
 *   copy to a phone that lost the app or to a brand-new group member.
 *
 *   This does NOT bootstrap someone with NOTHING (no app, no node) — that's the
 *   QR's job, in person. It bootstraps DISCOVERY: "a seeder exists, ~here, on
 *   this SSID," so people don't have to be shoulder-to-shoulder to find out.
 *
 * TRANSPORT REALITY (honest)
 *   LoRa text payloads are hard-capped at ~200 UTF-8 bytes (comms.js
 *   MAX_TEXT_BYTES) and are SLOW/low-duty-cycle. So the beacon is a single
 *   compact line, sent infrequently (default every 60s), never a firehose.
 *   The Wi-Fi PASSWORD is deliberately NOT put on the mesh by default (LoRa is
 *   unencrypted on the default channel) — the password travels by QR/captive
 *   portal, in person. The beacon carries SSID + origin + a human hint only.
 *
 * Load like the other modules:  <script type="module" src="./seederBeacon.js"></script>
 * Also attached (guarded) to globalThis.SeederBeacon.
 */

'use strict';

const PREFIX = 'OCSEED1|'; // versioned magic so we can ignore normal chat + future formats
const DEFAULT_INTERVAL_MS = 60000;

function mesh() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.MeshComms) ? globalThis.MeshComms : null;
  } catch (_e) { return null; }
}

/** True only if the mesh transport is present AND connected. */
function canBeacon() {
  const m = mesh();
  return !!(m && m.isCommsAvailable && m.isCommsAvailable() && m.isConnected && m.isConnected());
}

/**
 * Encode a seeder advert into one compact mesh line.
 * Fields are '|' separated, values are minimal. Kept well under 200 bytes.
 * @param {{ssid:string, origin?:string, note?:string}} info
 */
function encodeBeacon(info) {
  const ssid = String(info.ssid || '').replace(/\|/g, '/');
  // origin like "http://192.168.49.1:8080" — strip the scheme to save bytes.
  let host = String(info.origin || '').replace(/^https?:\/\//, '').replace(/\|/g, '/');
  const note = String(info.note || '').replace(/\|/g, '/');
  let line = PREFIX + 's=' + ssid + '|h=' + host + (note ? '|n=' + note : '');
  // Hard trim to the LoRa budget (comms.js will also compact, but keep it honest here).
  const te = new TextEncoder();
  while (te.encode(line).length > 190 && note && line.indexOf('|n=') !== -1) {
    line = line.slice(0, line.lastIndexOf('|n=')); // drop the note first
  }
  while (te.encode(line).length > 190) line = line.slice(0, -1);
  return line;
}

/** Parse a received mesh text; returns the advert object or null if not ours. */
function parseBeacon(text) {
  const s = String(text || '');
  if (s.indexOf(PREFIX) !== 0) return null;
  const body = s.slice(PREFIX.length);
  const out = { ssid: '', origin: '', note: '' };
  for (const part of body.split('|')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq), v = part.slice(eq + 1);
    if (k === 's') out.ssid = v;
    else if (k === 'h') out.origin = v ? ('http://' + v) : '';
    else if (k === 'n') out.note = v;
  }
  return out.ssid ? out : null;
}

/* ------------------------------------------------------------------ */
/* Advertise (seeder operator side)                                    */
/* ------------------------------------------------------------------ */

let _timer = null;
let _current = null;

/**
 * Start periodically broadcasting the seeder advert on the mesh.
 * @param {{ssid:string, origin?:string, note?:string, intervalMs?:number}} info
 * @returns {{ok:boolean, reason?:string}}
 */
function startAdvertising(info) {
  const m = mesh();
  if (!m) return { ok: false, reason: 'mesh transport not loaded' };
  if (!info || !info.ssid) return { ok: false, reason: 'ssid required' };
  _current = info;
  const interval = info.intervalMs || DEFAULT_INTERVAL_MS;
  const tick = async () => {
    if (!canBeacon() || !_current) return; // silently skip while disconnected
    try { await m.sendText(encodeBeacon(_current)); } catch (_e) { /* never throw from a timer */ }
  };
  stopAdvertising();
  tick(); // fire one immediately
  _timer = setInterval(tick, interval);
  return { ok: true };
}

function stopAdvertising() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _current = null;
}

function isAdvertising() { return !!_timer; }

/* ------------------------------------------------------------------ */
/* Discover (receiver side)                                            */
/* ------------------------------------------------------------------ */

/**
 * Subscribe to seeder beacons heard on the mesh.
 * cb({ ssid, origin, note, from, fromName, rxTime }). Returns unsubscribe fn.
 * No-op (returns a no-op unsub) if the mesh transport isn't available.
 */
function onSeederNearby(cb) {
  const m = mesh();
  if (!m || !m.onMessage || typeof cb !== 'function') return () => {};
  return m.onMessage((msg) => {
    const adv = parseBeacon(msg && msg.text);
    if (!adv) return;
    cb({ ...adv, from: msg.from, fromName: msg.fromName, rxTime: msg.rxTime });
  });
}

const SeederBeacon = {
  PREFIX,
  canBeacon,
  encodeBeacon,
  parseBeacon,
  startAdvertising,
  stopAdvertising,
  isAdvertising,
  onSeederNearby,
};

try {
  if (typeof globalThis !== 'undefined') globalThis.SeederBeacon = SeederBeacon;
} catch (_e) { /* ignore */ }

export {
  PREFIX,
  canBeacon,
  encodeBeacon,
  parseBeacon,
  startAdvertising,
  stopAdvertising,
  isAdvertising,
  onSeederNearby,
};
export default SeederBeacon;
