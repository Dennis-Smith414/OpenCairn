/* OpenCairn P2P — shared protocol + signaling helpers (Path B).
 * ------------------------------------------------------------------
 * PURE-BROWSER phone→phone transfer of the whole cached PWA + the 131MB
 * on-device model over a WebRTC DataChannel, signaled by QR only.
 *
 * This module is transport-agnostic glue shared by seeder.js and
 * receiver.js. It does NOT open cameras or peer connections itself.
 *
 * HONESTY (read before believing the demo):
 *  - We configure `iceServers: []` — NO STUN, NO TURN. The only ICE
 *    candidates gathered are HOST candidates (the phone's own LAN IP,
 *    possibly masked as an mDNS `*.local` name). That means the two
 *    phones MUST already share an L2 network (one phone's OS Personal
 *    Hotspot, both joined to it). A browser CANNOT create that network.
 *    See VERDICT in demo.html.
 *  - We use NON-TRICKLE ICE: we wait for iceGatheringState==='complete'
 *    so the *entire* SDP (offer/answer + all host candidates) is inside
 *    one localDescription blob. That single blob is what goes into the
 *    QR frames. No side channel for late candidates — there is none.
 * ------------------------------------------------------------------ */

export const PROTO = 'ocp2p/1';

/* --- caches we read on the seeder / write on the receiver --------- */
/* Keep SHELL_CACHE in lockstep with sw.js `const VERSION`. If they drift,
 * the reconstructed app's SW will look in the wrong cache and refetch
 * from the (unreachable, offline) network → blank app. */
export const SHELL_CACHE = 'opencairn-shell-v6';
/* transformers.js runtime + the 26 MB ONNX-Runtime wasm live HERE (see sw.js
 * handler 2b), NOT in the shell cache and NOT in transformers-cache. Miss it
 * and the reconstructed app has weights it cannot execute. */
export const AI_CACHE = 'opencairn-ai-v6';
export const MODEL_CACHE = 'transformers-cache';   // model weights + tokenizer
/* The three caches that make the AI PWA runnable. Tile/geocode caches are
 * user-specific and optional — deliberately skipped. */
export const TRANSFER_CACHES = [SHELL_CACHE, AI_CACHE, MODEL_CACHE];

/* DataChannel tuning (see throughput note in demo.html). 16 KiB is the
 * universally-safe SCTP message size; bigger messages silently fail on
 * some stacks. Backpressure watermarks keep the send buffer bounded so
 * a phone doesn't OOM buffering 360MB it hasn't flushed to the wire. */
export const CHUNK_SIZE = 16 * 1024;            // 16 KiB per DataChannel message
export const BUFFER_HIGH = 8 * 1024 * 1024;     // pause send above 8 MiB queued
export const BUFFER_LOW  = 1 * 1024 * 1024;     // resume when drained below 1 MiB

/* --- QR framing -------------------------------------------------- */
/* A dense QR reliably photographed by a phone holds far less than its
 * theoretical max. We cap the PAYLOAD per frame and animate multiple
 * frames. Header: "ocp2p|<kind>|<id>|<i>|<n>|" then base64 payload. */
export const QR_PAYLOAD_BYTES = 700;   // conservative, scans on a mediocre camera

/* ---- gzip via CompressionStream, with a raw fallback ------------ */
async function _streamToU8(stream) {
  const reader = stream.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value); total += value.length;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function gzip(str) {
  const bytes = new TextEncoder().encode(str);
  if (typeof CompressionStream === 'undefined') return { raw: true, bytes };
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter(); w.write(bytes); w.close();
  return { raw: false, bytes: await _streamToU8(cs.readable) };
}

export async function gunzip(bytes, raw) {
  if (raw || typeof DecompressionStream === 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter(); w.write(bytes); w.close();
  return new TextDecoder().decode(await _streamToU8(ds.readable));
}

/* base64 <-> Uint8Array (no data: prefix) */
export function u8ToB64(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  }
  return btoa(s);
}
export function b64ToU8(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

/* Compress an SDP string and split into QR frame strings.
 * kind: 'O' (offer) or 'A' (answer). id: short session id. */
export async function sdpToFrames(sdp, kind, id) {
  const { raw, bytes } = await gzip(sdp);
  // 1-char flag so the decoder knows whether to gunzip.
  const flagged = new Uint8Array(bytes.length + 1);
  flagged[0] = raw ? 0x30 /*'0'*/ : 0x31 /*'1'*/;
  flagged.set(bytes, 1);
  const b64 = u8ToB64(flagged);
  const frames = [];
  const n = Math.ceil(b64.length / QR_PAYLOAD_BYTES) || 1;
  for (let i = 0; i < n; i++) {
    const slice = b64.slice(i * QR_PAYLOAD_BYTES, (i + 1) * QR_PAYLOAD_BYTES);
    frames.push(`ocp2p|${kind}|${id}|${i}|${n}|${slice}`);
  }
  return frames;
}

/* Accumulate scanned frames; returns the reassembled SDP string once
 * every frame of a session is seen, else null. Stateful collector. */
export function makeFrameCollector() {
  const sessions = new Map(); // id -> {kind,n,parts:[]}
  return {
    /** feed one decoded QR text. returns {kind,id,sdp} when complete. */
    async feed(text) {
      if (typeof text !== 'string' || !text.startsWith('ocp2p|')) return null;
      const head = text.split('|', 5);
      if (head.length < 5) return null;
      const [, kind, id, iStr, nStr] = head;
      const i = +iStr, n = +nStr;
      const payload = text.slice(head.join('|').length + 1);
      let s = sessions.get(id);
      if (!s) { s = { kind, n, parts: new Array(n) }; sessions.set(id, s); }
      if (s.parts[i] === undefined) s.parts[i] = payload;
      if (s.parts.filter((x) => x !== undefined).length !== s.n) return null;
      const b64 = s.parts.join('');
      const flagged = b64ToU8(b64);
      const raw = flagged[0] === 0x30;
      const sdp = await gunzip(flagged.subarray(1), raw);
      sessions.delete(id);
      return { kind: s.kind, id, sdp };
    },
    progress(id) {
      const s = sessions.get(id);
      if (!s) return { have: 0, need: 0 };
      return { have: s.parts.filter((x) => x !== undefined).length, need: s.n };
    },
  };
}

/* short random session id */
export function newId() {
  return Math.random().toString(36).slice(2, 7);
}

/* Build an RTCPeerConnection with NO STUN/TURN (host candidates only). */
export function newPeer() {
  return new RTCPeerConnection({ iceServers: [] });
}

/* Resolve once ICE gathering is complete → localDescription holds the
 * full non-trickle SDP. Guarded by a timeout because some stacks never
 * fire 'complete' on a pure LAN (mDNS resolver stalls). */
export function waitIceComplete(pc, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    const t = setTimeout(finish, timeoutMs);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); finish(); }
    });
    // Belt & suspenders: an empty-string candidate also signals end-of-gather.
    pc.addEventListener('icecandidate', (e) => {
      if (!e.candidate) { clearTimeout(t); finish(); }
    });
  });
}

/* ---- QR render (uses the app's self-hosted global `qrcode`) ------ */
export function drawQR(canvas, text, cssSize = 260, ecc = 'L') {
  if (typeof qrcode === 'undefined') throw new Error('qrcode lib missing');
  const qr = qrcode(0, ecc);
  qr.addData(text); qr.make();
  const n = qr.getModuleCount();
  const dpr = Math.min(Math.max(self.devicePixelRatio || 1, 1), 3);
  const size = Math.round(cssSize * dpr);
  canvas.width = canvas.height = size;
  canvas.style.width = canvas.style.height = cssSize + 'px';
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  const quiet = 3, cell = size / (n + quiet * 2);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) {
      ctx.fillRect(Math.floor((c + quiet) * cell), Math.floor((r + quiet) * cell),
                   Math.ceil(cell), Math.ceil(cell));
    }
  }
  return n;
}

/* ---- QR scan: BarcodeDetector if present, else jsQR --------------
 * Returns a controller with start(onText)/stop(). Caller supplies a
 * <video> and a hidden <canvas>. */
export function makeScanner(video, canvas) {
  let raf = 0, stream = null, detector = null, running = false;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  async function start(onText) {
    running = true;
    if ('BarcodeDetector' in self) {
      try {
        const fmts = await self.BarcodeDetector.getSupportedFormats();
        if (fmts.includes('qr_code')) detector = new self.BarcodeDetector({ formats: ['qr_code'] });
      } catch (_e) { detector = null; }
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true'); // iOS: don't go fullscreen
    await video.play();

    const tick = async () => {
      if (!running) return;
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let text = null;
        try {
          if (detector) {
            const codes = await detector.detect(canvas);
            if (codes && codes.length) text = codes[0].rawValue;
          } else if (typeof jsQR !== 'undefined') {
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
            if (r) text = r.data;
          }
        } catch (_e) { /* frame decode hiccup — keep going */ }
        if (text) onText(text);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  return { start, stop };
}
