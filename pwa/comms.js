/**
 * comms.js — OpenCairn PWA off-grid group comms over Web Bluetooth to a
 * Meshtastic LoRa node.
 *
 * CHROME/CHROMIUM ONLY. Web Bluetooth does not exist on Safari or Firefox,
 * so EVERYTHING here is feature-detected and guarded: on those browsers
 * isCommsAvailable() returns false, every public function resolves to an
 * honest { ok:false, reason } object, and nothing throws at load or call
 * time. The app should simply not show the mesh UI when
 * isCommsAvailable() is false.
 *
 * WHAT IS REAL vs WHAT IS STUBBED — read this before trusting it:
 *
 *   REAL — the whole BLE transport layer:
 *     * requestDevice() filtered on the published Meshtastic service UUID
 *     * GATT connect / service / characteristic acquisition (ToRadio,
 *       FromRadio incl. the pre-2.x legacy UUID, FromNum)
 *     * startNotifications() on FromNum + the drain loop (Meshtastic's
 *       contract: FromNum notifies, client reads FromRadio repeatedly
 *       until an empty read empties the queue)
 *     * the client-API handshake shape (write ToRadio{want_config_id},
 *       then drain the config stream until config_complete_id)
 *     * disconnect handling, listener plumbing, TTS/STT voice hooks
 *
 *   MINIMAL / UNVERIFIED — the protobuf codec (see TODO(protobuf) below):
 *     * A hand-rolled varint/tag reader-writer covering ONLY the subset
 *       needed here: ToRadio.want_config_id, ToRadio.packet with a
 *       decoded Data{TEXT_MESSAGE_APP}, and FromRadio decode of
 *       MeshPacket (text + position portnums), MyNodeInfo, NodeInfo/User.
 *     * Field numbers follow the public Meshtastic mesh.proto; they have
 *       NOT been verified against live hardware from this module.
 *     * No encryption handling: MeshPacket.encrypted payloads are skipped
 *       (the node itself decrypts known-channel traffic before handing it
 *       over BLE, so normal channel messages still arrive decoded).
 *     * No ACK/queue-status tracking, no admin messages, no channel or
 *       module config parsing (config records are skipped, not read).
 *
 * Voice-over-mesh: sendVoice() = edgeAI STT (Web Speech) -> compacted
 * transcript -> sendText(); incoming text is spoken with speechSynthesis
 * while voice mode is on. LoRa payloads are tiny, so transcripts are
 * whitespace-collapsed and hard-capped at ~200 UTF-8 bytes.
 *
 * Load like edgeAI.js:  <script type="module" src="./comms.js"></script>
 * Also attached (guarded) to globalThis.MeshComms for non-import callers.
 */

'use strict';

/* ------------------------------------------------------------------ */
/* Meshtastic BLE UUIDs (published, stable)                            */
/* ------------------------------------------------------------------ */

const MESH_SERVICE = '6ba1b218-15a8-461f-9fa8-5dcae273eafd';
const CH_TORADIO = 'f75c76d2-129e-4dad-a1dd-7866124401e7'; // write
const CH_FROMRADIO = '2c55e69e-4993-11ed-b878-0242ac120002'; // read (fw 2.x)
const CH_FROMRADIO_LEGACY = '8ba2bcc2-ee02-4a55-a531-c525c5e454d5'; // read (fw 1.x)
const CH_FROMNUM = 'ed9da18c-a800-4f66-a670-aa7547e34453'; // notify

const BROADCAST_ADDR = 0xffffffff;
const PORT_TEXT = 1; // PortNum.TEXT_MESSAGE_APP
const PORT_POSITION = 3; // PortNum.POSITION_APP
const MAX_TEXT_BYTES = 200; // LoRa payload budget (~237B minus headers)

/* ------------------------------------------------------------------ */
/* Feature detection                                                   */
/* ------------------------------------------------------------------ */

/** True only on browsers exposing Web Bluetooth (Chrome/Chromium/Edge). */
function isCommsAvailable() {
  try {
    return typeof navigator !== 'undefined' &&
      !!navigator.bluetooth &&
      typeof navigator.bluetooth.requestDevice === 'function';
  } catch (_e) {
    return false;
  }
}

function hasTTS() {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance === 'function';
  } catch (_e) {
    return false;
  }
}

function edgeAI() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.EdgeAI) ? globalThis.EdgeAI : null;
  } catch (_e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* TODO(protobuf): minimal hand-rolled codec — the honest stub layer.  */
/*                                                                     */
/* This is NOT the official @meshtastic protobuf stack. It implements  */
/* raw varint/tag wire format for the handful of fields used below.    */
/* Upgrading = vendor the generated meshtastic protobufs (mesh.proto,  */
/* portnums.proto) and replace encodeWantConfig/encodeTextPacket and   */
/* the decode* functions with real generated (de)serializers — the BLE */
/* plumbing on either side stays exactly as-is, because over BLE the   */
/* characteristic payloads ARE bare ToRadio/FromRadio protobufs (no    */
/* 0x94 0xc3 stream framing; that wrapper is serial/TCP only).         */
/* ------------------------------------------------------------------ */

/** Cursor-based protobuf wire reader over a Uint8Array. Never throws out. */
function pbReader(u8) {
  let i = 0;
  const r = {
    eof() { return i >= u8.length; },
    varint() {
      let x = 0, s = 0, b = 0;
      do {
        if (i >= u8.length) return x;
        b = u8[i++];
        x += (b & 0x7f) * Math.pow(2, s);
        s += 7;
      } while ((b & 0x80) && s < 64);
      return x;
    },
    /* Precise low 32 bits of a varint. Needed for negative int32 fields:
     * protobuf encodes them as 10-byte 64-bit two's complement, and plain
     * float accumulation loses the low bits up at 2^64. */
    varint32() {
      let lo = 0, s = 0, b = 0;
      do {
        if (i >= u8.length) return lo >>> 0;
        b = u8[i++];
        if (s < 32) lo = (lo | ((b & 0x7f) << s)) >>> 0;
        s += 7;
      } while ((b & 0x80) && s < 70);
      return lo >>> 0;
    },
    tag() {
      const v = r.varint();
      return { field: Math.floor(v / 8), wire: v & 7 };
    },
    bytes() {
      const n = r.varint();
      const end = Math.min(i + n, u8.length);
      const out = u8.subarray(i, end);
      i = end;
      return out;
    },
    fixed32() {
      if (i + 4 > u8.length) { i = u8.length; return 0; }
      const v = (u8[i] | (u8[i + 1] << 8) | (u8[i + 2] << 16) | (u8[i + 3] << 24)) >>> 0;
      i += 4;
      return v;
    },
    sfixed32() {
      const v = r.fixed32();
      return v > 0x7fffffff ? v - 0x100000000 : v;
    },
    skip(wire) {
      if (wire === 0) r.varint();
      else if (wire === 1) i += 8;
      else if (wire === 2) { const n = r.varint(); i += n; }
      else if (wire === 5) i += 4;
      else i = u8.length; // unknown wire type — bail on this message
    },
  };
  return r;
}

/** Tiny protobuf wire writer. */
function pbWriter() {
  const b = [];
  const varint = (n) => {
    n = Math.max(0, Math.floor(n));
    while (n > 127) { b.push((n % 128) | 0x80); n = Math.floor(n / 128); }
    b.push(n);
  };
  return {
    varintField(field, n) { varint(field * 8 + 0); varint(n); },
    bytesField(field, u8) { varint(field * 8 + 2); varint(u8.length); for (let k = 0; k < u8.length; k++) b.push(u8[k]); },
    fixed32Field(field, n) {
      varint(field * 8 + 5);
      b.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
    },
    out() { return new Uint8Array(b); },
  };
}

/** ToRadio { want_config_id = 3 } — the client-API handshake opener. */
function encodeWantConfig(nonce) {
  const w = pbWriter();
  w.varintField(3, nonce >>> 0);
  return w.out();
}

/**
 * ToRadio { packet = 1: MeshPacket { to=2 fixed32, channel=3, decoded=4:
 * Data { portnum=1, payload=2 }, id=6 fixed32 } } — broadcast text.
 */
function encodeTextPacket(textBytes) {
  const data = pbWriter();
  data.varintField(1, PORT_TEXT);
  data.bytesField(2, textBytes);

  const pkt = pbWriter();
  pkt.fixed32Field(2, BROADCAST_ADDR); // to
  pkt.varintField(3, 0); // channel: primary
  pkt.bytesField(4, data.out()); // decoded Data
  pkt.fixed32Field(6, (Math.random() * 0xfffffffe + 1) >>> 0); // packet id

  const toRadio = pbWriter();
  toRadio.bytesField(1, pkt.out());
  return toRadio.out();
}

/** Position { latitude_i=1 sfixed32 (deg*1e-7), longitude_i=2, altitude=3, time=4 fixed32 } */
function decodePosition(u8) {
  const r = pbReader(u8);
  const p = { lat: null, lon: null, alt: null, time: null };
  while (!r.eof()) {
    const t = r.tag();
    if (t.field === 1 && t.wire === 5) p.lat = r.sfixed32() / 1e7;
    else if (t.field === 2 && t.wire === 5) p.lon = r.sfixed32() / 1e7;
    else if (t.field === 3 && t.wire === 0) {
      const a = r.varint32(); // int32: negative comes as 64-bit varint, take low 32
      p.alt = a > 0x7fffffff ? a - 0x100000000 : a;
    } else if (t.field === 4 && t.wire === 5) p.time = r.fixed32();
    else r.skip(t.wire);
  }
  return (p.lat != null && p.lon != null) ? p : null;
}

/** User { id=1, long_name=2, short_name=3 } */
function decodeUser(u8) {
  const r = pbReader(u8);
  const td = new TextDecoder();
  const u = { id: '', longName: '', shortName: '' };
  while (!r.eof()) {
    const t = r.tag();
    if (t.field === 1 && t.wire === 2) u.id = td.decode(r.bytes());
    else if (t.field === 2 && t.wire === 2) u.longName = td.decode(r.bytes());
    else if (t.field === 3 && t.wire === 2) u.shortName = td.decode(r.bytes());
    else r.skip(t.wire);
  }
  return u;
}

/** NodeInfo { num=1, user=2, position=3 } */
function decodeNodeInfo(u8) {
  const r = pbReader(u8);
  const n = { num: null, user: null, position: null };
  while (!r.eof()) {
    const t = r.tag();
    if (t.field === 1 && t.wire === 0) n.num = r.varint();
    else if (t.field === 2 && t.wire === 2) n.user = decodeUser(r.bytes());
    else if (t.field === 3 && t.wire === 2) n.position = decodePosition(r.bytes());
    else r.skip(t.wire);
  }
  return n.num != null ? n : null;
}

/** MeshPacket { from=1 fixed32, to=2 fixed32, channel=3, decoded=4, encrypted=5, id=6, rx_time=7 } */
function decodeMeshPacket(u8) {
  const r = pbReader(u8);
  const p = { from: null, to: null, channel: 0, data: null, encrypted: false, rxTime: null };
  while (!r.eof()) {
    const t = r.tag();
    if (t.field === 1 && t.wire === 5) p.from = r.fixed32();
    else if (t.field === 2 && t.wire === 5) p.to = r.fixed32();
    else if (t.field === 3 && t.wire === 0) p.channel = r.varint();
    else if (t.field === 4 && t.wire === 2) p.data = r.bytes();
    else if (t.field === 5 && t.wire === 2) { p.encrypted = true; r.bytes(); } // can't decrypt here — skip
    else if (t.field === 7 && t.wire === 5) p.rxTime = r.fixed32();
    else r.skip(t.wire);
  }
  return p;
}

/** Data { portnum=1, payload=2 } */
function decodeData(u8) {
  const r = pbReader(u8);
  const d = { portnum: null, payload: null };
  while (!r.eof()) {
    const t = r.tag();
    if (t.field === 1 && t.wire === 0) d.portnum = r.varint();
    else if (t.field === 2 && t.wire === 2) d.payload = r.bytes();
    else r.skip(t.wire);
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Connection state + listener plumbing                                */
/* ------------------------------------------------------------------ */

let _device = null;
let _toRadio = null;
let _fromRadio = null;
let _fromNum = null;
let _connected = false;
let _configComplete = false;
let _configNonce = 0;
let _myNodeNum = null;
let _voiceMode = false;
let _draining = false;
let _drainAgain = false;
const _nodes = new Map(); // nodeNum -> { num, user, position }

const _msgCbs = new Set();
const _posCbs = new Set();
const _statusCbs = new Set();

function emit(set, payload) {
  for (const cb of set) { try { cb(payload); } catch (_e) { /* listener bugs never break the link */ } }
}
function emitStatus(state, detail) {
  emit(_statusCbs, { state, detail: detail || null, connected: _connected });
}

function nameOf(num) {
  const n = _nodes.get(num);
  if (n && n.user && (n.user.shortName || n.user.longName)) return n.user.shortName || n.user.longName;
  return num == null ? 'mesh' : '!' + (num >>> 0).toString(16);
}

/* ------------------------------------------------------------------ */
/* Incoming pipeline                                                   */
/* ------------------------------------------------------------------ */

function handleFromRadio(u8) {
  // FromRadio { packet=2, my_info=3, node_info=4, config_complete_id=7 } —
  // config(5)/moduleConfig(9)/channel(10)/etc. are skipped (see TODO(protobuf)).
  const r = pbReader(u8);
  while (!r.eof()) {
    const t = r.tag();
    if (t.field === 2 && t.wire === 2) handleMeshPacket(r.bytes());
    else if (t.field === 3 && t.wire === 2) handleMyInfo(r.bytes());
    else if (t.field === 4 && t.wire === 2) handleNodeInfo(r.bytes());
    else if (t.field === 7 && t.wire === 0) {
      const id = r.varint();
      if (!_configComplete && (id === _configNonce || _configNonce === 0)) {
        _configComplete = true;
        emitStatus('ready', { nodes: _nodes.size });
      }
    } else r.skip(t.wire);
  }
}

function handleMyInfo(u8) {
  // MyNodeInfo { my_node_num = 1 }
  const r = pbReader(u8);
  while (!r.eof()) {
    const t = r.tag();
    if (t.field === 1 && t.wire === 0) _myNodeNum = r.varint();
    else r.skip(t.wire);
  }
}

function handleNodeInfo(u8) {
  const n = decodeNodeInfo(u8);
  if (!n) return;
  _nodes.set(n.num, n);
  if (n.position && n.num !== _myNodeNum) {
    emit(_posCbs, {
      num: n.num, name: nameOf(n.num),
      lat: n.position.lat, lon: n.position.lon,
      alt: n.position.alt, time: n.position.time, source: 'nodeinfo',
    });
  }
}

function handleMeshPacket(u8) {
  const pkt = decodeMeshPacket(u8);
  if (!pkt || pkt.data == null) return; // encrypted-only or empty — nothing we can do
  if (_myNodeNum != null && pkt.from === _myNodeNum) return; // our own echo
  const data = decodeData(pkt.data);
  if (!data || data.payload == null) return;

  if (data.portnum === PORT_TEXT) {
    let text = '';
    try { text = new TextDecoder().decode(data.payload); } catch (_e) { return; }
    if (!text) return;
    const msg = { from: pkt.from, fromName: nameOf(pkt.from), text, rxTime: pkt.rxTime, channel: pkt.channel };
    emit(_msgCbs, msg);
    if (_voiceMode) speakText(msg.fromName + ' says: ' + text);
  } else if (data.portnum === PORT_POSITION) {
    const p = decodePosition(data.payload);
    if (!p) return;
    const node = _nodes.get(pkt.from);
    if (node) node.position = p;
    emit(_posCbs, {
      num: pkt.from, name: nameOf(pkt.from),
      lat: p.lat, lon: p.lon, alt: p.alt, time: p.time || pkt.rxTime, source: 'live',
    });
  }
  // other portnums (telemetry, routing, nodeinfo-app...) fall through silently
}

/**
 * Drain the radio's outbound queue: read FromRadio until an empty read.
 * Serialized — a FromNum notification during a drain schedules one more pass.
 */
async function drain() {
  if (!_fromRadio) return;
  if (_draining) { _drainAgain = true; return; }
  _draining = true;
  try {
    do {
      _drainAgain = false;
      for (let guard = 0; guard < 200; guard++) {
        let dv = null;
        try { dv = await _fromRadio.readValue(); } catch (_e) { break; }
        if (!dv || dv.byteLength === 0) break;
        try {
          handleFromRadio(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength));
        } catch (_e) { /* one bad packet must not stall the queue */ }
      }
    } while (_drainAgain);
  } finally {
    _draining = false;
  }
}

/* ------------------------------------------------------------------ */
/* Connect / disconnect                                                */
/* ------------------------------------------------------------------ */

function teardown() {
  _connected = false;
  _configComplete = false;
  _toRadio = null; _fromRadio = null; _fromNum = null;
  _myNodeNum = null;
  _draining = false; _drainAgain = false;
}

function onGattDisconnected() {
  const was = _connected;
  teardown();
  if (was) emitStatus('disconnected');
}

/**
 * Chooser -> GATT connect -> characteristics -> notify -> handshake.
 * Must run from a user gesture (Web Bluetooth requirement).
 * Resolves { ok, reason?, deviceName? } — never rejects, never throws.
 */
async function connectMesh() {
  if (!isCommsAvailable()) {
    return { ok: false, reason: 'Web Bluetooth unavailable on this browser (Chrome/Chromium only)' };
  }
  if (_connected) return { ok: true, deviceName: (_device && _device.name) || 'Meshtastic' };
  try {
    _device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [MESH_SERVICE] }],
    });
    try { _device.addEventListener('gattserverdisconnected', onGattDisconnected); } catch (_e) { /* ignore */ }

    const server = await _device.gatt.connect();
    const svc = await server.getPrimaryService(MESH_SERVICE);
    _toRadio = await svc.getCharacteristic(CH_TORADIO);
    try {
      _fromRadio = await svc.getCharacteristic(CH_FROMRADIO);
    } catch (_e) {
      _fromRadio = await svc.getCharacteristic(CH_FROMRADIO_LEGACY); // pre-2.x firmware
    }
    _fromNum = await svc.getCharacteristic(CH_FROMNUM);

    await _fromNum.startNotifications();
    _fromNum.addEventListener('characteristicvaluechanged', () => { drain(); });

    _connected = true;
    emitStatus('connected', { deviceName: _device.name || 'Meshtastic' });

    // Client-API handshake: ask for config, then drain the config stream
    // (MyNodeInfo, NodeInfos, config records we skip, config_complete_id).
    _configNonce = (Math.floor(Math.random() * 0xfffffffe) + 1) >>> 0;
    await writeToRadio(encodeWantConfig(_configNonce));
    await drain();

    return { ok: true, deviceName: _device.name || 'Meshtastic' };
  } catch (e) {
    teardown();
    const name = e && e.name ? String(e.name) : '';
    const reason = name === 'NotFoundError' ? 'no device chosen'
      : name === 'SecurityError' ? 'blocked — Web Bluetooth needs HTTPS + a user gesture'
      : 'connect failed: ' + (e && e.message ? e.message : 'unknown error');
    emitStatus('error', { reason });
    return { ok: false, reason };
  }
}

/** Politely drop the link. Safe to call any time. */
function disconnectMesh() {
  try {
    if (_device && _device.gatt && _device.gatt.connected) _device.gatt.disconnect();
  } catch (_e) { /* ignore */ }
  onGattDisconnected();
}

function isConnected() { return _connected; }

async function writeToRadio(u8) {
  if (!_toRadio) throw new Error('not connected');
  if (typeof _toRadio.writeValueWithResponse === 'function') {
    await _toRadio.writeValueWithResponse(u8);
  } else {
    await _toRadio.writeValue(u8);
  }
}

/* ------------------------------------------------------------------ */
/* Outgoing text                                                       */
/* ------------------------------------------------------------------ */

/** Collapse whitespace + hard-cap at MAX_TEXT_BYTES of UTF-8. */
function compactText(s) {
  let t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const te = new TextEncoder();
  while (t && te.encode(t).length > MAX_TEXT_BYTES) {
    t = t.slice(0, -1);
  }
  return t;
}

/**
 * Broadcast a text message on the primary channel.
 * Resolves { ok, sent?, reason? } — never throws.
 */
async function sendText(msg) {
  if (!isCommsAvailable()) return { ok: false, reason: 'Web Bluetooth unavailable on this browser' };
  if (!_connected || !_toRadio) return { ok: false, reason: 'not connected — call connectMesh() first' };
  const text = compactText(msg);
  if (!text) return { ok: false, reason: 'empty message' };
  try {
    await writeToRadio(encodeTextPacket(new TextEncoder().encode(text)));
    return { ok: true, sent: text };
  } catch (e) {
    return { ok: false, reason: 'send failed: ' + (e && e.message ? e.message : 'unknown error') };
  }
}

/* ------------------------------------------------------------------ */
/* Listeners                                                           */
/* ------------------------------------------------------------------ */

/** cb({ from, fromName, text, rxTime, channel }). Returns unsubscribe fn. */
function onMessage(cb) {
  if (typeof cb === 'function') _msgCbs.add(cb);
  return () => _msgCbs.delete(cb);
}

/** cb({ num, name, lat, lon, alt, time, source }) — peer positions for the map. */
function onPosition(cb) {
  if (typeof cb === 'function') _posCbs.add(cb);
  return () => _posCbs.delete(cb);
}

/** cb({ state:'connected'|'ready'|'disconnected'|'error', detail, connected }). */
function onStatus(cb) {
  if (typeof cb === 'function') _statusCbs.add(cb);
  return () => _statusCbs.delete(cb);
}

/** Known mesh peers (from NodeInfo + live positions). */
function getPeers() {
  const out = [];
  for (const n of _nodes.values()) {
    if (n.num === _myNodeNum) continue;
    out.push({
      num: n.num,
      name: nameOf(n.num),
      lat: n.position ? n.position.lat : null,
      lon: n.position ? n.position.lon : null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* VOICE-OVER-MESH                                                     */
/* ------------------------------------------------------------------ */

function speakText(text) {
  if (!hasTTS()) return false;
  try {
    const u = new window.SpeechSynthesisUtterance(String(text));
    u.rate = 1.05;
    // Don't let a chatty mesh pile up an unbounded speech queue.
    if (window.speechSynthesis.pending) window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  } catch (_e) {
    return false;
  }
}

/** Toggle speaking incoming mesh text aloud. Auto-enabled by sendVoice(). */
function setVoiceMode(on) { _voiceMode = !!on; return _voiceMode; }
function getVoiceMode() { return _voiceMode; }

/**
 * One voice-over-mesh turn:
 *   mic (edgeAI Web Speech STT) -> compacted transcript -> sendText broadcast.
 * Uses EdgeAI.startVoiceTurn() for the capture plumbing (it also runs the
 * intent interpreter; we only take the transcript here). Enables voice mode
 * so replies from the mesh are spoken via TTS.
 * Resolves { ok, transcript?, reason? } — never throws.
 */
async function sendVoice() {
  if (!isCommsAvailable()) return { ok: false, reason: 'Web Bluetooth unavailable on this browser' };
  if (!_connected) return { ok: false, reason: 'not connected — call connectMesh() first' };
  const EA = edgeAI();
  if (!EA || typeof EA.startVoiceTurn !== 'function') {
    return { ok: false, reason: 'edge AI module unavailable' };
  }
  try {
    if (typeof EA.isVoiceAvailable === 'function' && !EA.isVoiceAvailable()) {
      return { ok: false, reason: 'voice unavailable on this browser' };
    }
    const turn = await EA.startVoiceTurn({ timeoutMs: 9000 });
    if (!turn || !turn.ok || !turn.transcript) {
      return { ok: false, reason: (turn && turn.reason) || 'no speech recognized' };
    }
    const text = compactText(turn.transcript);
    const sent = await sendText(text);
    if (sent.ok) {
      _voiceMode = true; // start speaking replies aloud
      return { ok: true, transcript: sent.sent };
    }
    return { ok: false, transcript: text, reason: sent.reason };
  } catch (_e) {
    return { ok: false, reason: 'voice turn failed' };
  }
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

export {
  isCommsAvailable,
  connectMesh,
  disconnectMesh,
  isConnected,
  sendText,
  sendVoice,
  onMessage,
  onPosition,
  onStatus,
  getPeers,
  setVoiceMode,
  getVoiceMode,
};

// Convenience global for non-module consumers (guarded), same pattern as EdgeAI.
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.MeshComms = {
      isCommsAvailable,
      connectMesh,
      disconnectMesh,
      isConnected,
      sendText,
      sendVoice,
      onMessage,
      onPosition,
      onStatus,
      getPeers,
      setVoiceMode,
      getVoiceMode,
    };
  }
} catch (_e) { /* ignore */ }
