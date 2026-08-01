/* OpenCairn P2P — SEEDER (the phone that HAS the app + model).
 * ------------------------------------------------------------------
 * Reads THIS origin's own Cache Storage (app shell + the transformers.js
 * model cache), enumerates it into a manifest, and streams the bytes to
 * a peer over a WebRTC DataChannel with real backpressure handling.
 *
 * Signaling is QR-only and NON-TRICKLE:
 *   1. seeder.createOffer() -> gather host ICE -> emit offer QR frames
 *   2. seeder shows offer frames; receiver scans them
 *   3. receiver builds answer QR frames; seeder scans them (2-way scan)
 *   4. DataChannel opens on the shared LAN -> stream begins
 *
 * Emits progress via the onEvent callback so the demo UI can render it.
 * ------------------------------------------------------------------ */

import {
  PROTO, TRANSFER_CACHES, CHUNK_SIZE, BUFFER_HIGH, BUFFER_LOW,
  newPeer, waitIceComplete, sdpToFrames, makeFrameCollector, newId,
} from './protocol.js';

/* Enumerate the transferable caches into a manifest of file records.
 * Each record: {cache, url, ct, size}. We read sizes up front so the
 * receiver can show a real progress bar and know when each file ends. */
export async function buildManifest() {
  const files = [];
  let totalBytes = 0;
  for (const cacheName of TRANSFER_CACHES) {
    let cache;
    try { cache = await caches.open(cacheName); } catch { continue; }
    const reqs = await cache.keys();
    for (const req of reqs) {
      const res = await cache.match(req);
      if (!res) continue;
      // Clone to read size without consuming the cached body.
      const buf = await res.clone().arrayBuffer();
      const rec = {
        cache: cacheName,
        url: req.url,
        ct: res.headers.get('content-type') || 'application/octet-stream',
        size: buf.byteLength,
      };
      files.push(rec);
      totalBytes += rec.size;
    }
  }
  return { proto: PROTO, files, totalBytes, count: files.length };
}

/* Stream one cached file to `emit` in <=CHUNK_SIZE pieces WITHOUT buffering
 * the whole file (a 131MB arrayBuffer() spike would matter on a phone).
 * Falls back to a single arrayBuffer read if the body isn't a stream. */
async function streamFileBytes(rec, emit) {
  const cache = await caches.open(rec.cache);
  const res = await cache.match(rec.url);
  if (!res) throw new Error('vanished from cache: ' + rec.url);
  if (!res.body || typeof res.body.getReader !== 'function') {
    const u8 = new Uint8Array(await res.arrayBuffer());
    for (let off = 0; off < u8.length; off += CHUNK_SIZE) await emit(u8.subarray(off, off + CHUNK_SIZE));
    return;
  }
  const reader = res.body.getReader();
  let carry = new Uint8Array(0);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    // Coalesce/split reader chunks to exactly CHUNK_SIZE messages.
    let merged = value;
    if (carry.length) { merged = new Uint8Array(carry.length + value.length); merged.set(carry); merged.set(value, carry.length); carry = new Uint8Array(0); }
    let off = 0;
    for (; off + CHUNK_SIZE <= merged.length; off += CHUNK_SIZE) await emit(merged.subarray(off, off + CHUNK_SIZE));
    if (off < merged.length) carry = merged.slice(off);
  }
  if (carry.length) await emit(carry);
}

/* Await room in the send buffer (backpressure). */
function drain(dc) {
  if (dc.bufferedAmount <= BUFFER_HIGH) return Promise.resolve();
  return new Promise((resolve) => {
    const onLow = () => { dc.removeEventListener('bufferedamountlow', onLow); resolve(); };
    dc.addEventListener('bufferedamountlow', onLow);
  });
}

export function createSeeder(onEvent = () => {}) {
  const id = newId();
  const pc = newPeer();
  const dc = pc.createDataChannel('oc-bundle', { ordered: true });
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = BUFFER_LOW;

  let manifest = null;
  let cancelled = false;

  pc.addEventListener('connectionstatechange', () =>
    onEvent({ type: 'pcstate', state: pc.connectionState }));

  /* Stream every file after the channel opens. */
  dc.addEventListener('open', async () => {
    onEvent({ type: 'channel-open' });
    try {
      if (!manifest) manifest = await buildManifest();
      dc.send(JSON.stringify({ t: 'manifest', ...manifest }));

      let sent = 0;
      const t0 = performance.now();
      for (let i = 0; i < manifest.files.length; i++) {
        if (cancelled) return;
        const rec = manifest.files[i];
        dc.send(JSON.stringify({ t: 'file-begin', i, url: rec.url, cache: rec.cache, ct: rec.ct, size: rec.size }));
        let msgCount = 0;
        await streamFileBytes(rec, async (chunk) => {
          if (cancelled) return;
          await drain(dc);
          // slice() copies so send() owns a stable buffer independent of the reader
          dc.send(chunk.slice());
          sent += chunk.length;
          if ((++msgCount % 64) === 0) {
            const secs = (performance.now() - t0) / 1000;
            onEvent({ type: 'progress', sent, total: manifest.totalBytes,
                      mbps: secs > 0 ? (sent * 8 / 1e6 / secs) : 0, file: rec.url });
          }
        });
        dc.send(JSON.stringify({ t: 'file-end', i }));
      }
      dc.send(JSON.stringify({ t: 'done' }));
      const secs = (performance.now() - t0) / 1000;
      onEvent({ type: 'complete', sent, secs, mbps: sent * 8 / 1e6 / secs });
    } catch (e) {
      onEvent({ type: 'error', where: 'stream', message: String(e && e.message || e) });
    }
  });

  return {
    id,
    /** Step 1: build the offer + gather host ICE. Returns offer QR frames. */
    async makeOfferFrames() {
      manifest = await buildManifest();
      onEvent({ type: 'manifest', ...manifest });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceComplete(pc);
      onEvent({ type: 'ice', state: pc.iceGatheringState,
                sdpBytes: pc.localDescription.sdp.length });
      return sdpToFrames(pc.localDescription.sdp, 'O', id);
    },
    /** Step 3: feed scanned answer QR frames. Returns true once applied. */
    makeAnswerCollector() {
      const col = makeFrameCollector();
      return async (qrText) => {
        const done = await col.feed(qrText);
        if (!done || done.kind !== 'A') return { done: false, progress: col.progress(id) };
        await pc.setRemoteDescription({ type: 'answer', sdp: done.sdp });
        onEvent({ type: 'answer-applied' });
        return { done: true };
      };
    },
    cancel() { cancelled = true; try { dc.close(); pc.close(); } catch (_e) {} },
    _pc: pc, _dc: dc,
  };
}
