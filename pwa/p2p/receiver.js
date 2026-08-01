/* OpenCairn P2P — RECEIVER (the phone that WANTS the app + model).
 * ------------------------------------------------------------------
 * Scans the seeder's offer QR frames, answers over WebRTC (host ICE,
 * no STUN), receives the manifest + streamed bytes on the DataChannel,
 * and RECONSTRUCTS a runnable offline PWA by writing every file back
 * into THIS origin's Cache Storage under the SAME cache names, then
 * registers ./sw.js.
 *
 * >>> THE LOAD-BEARING CAVEAT (do not gloss over) <<<
 * This only produces a runnable, installable PWA when the receiver page
 * is ALREADY SERVED FROM THE PWA'S ORIGIN over a secure context
 * (https://hawktalk.ai/pwademo or http://localhost). Writing into
 * Cache Storage and registering a Service Worker are ORIGIN-SCOPED and
 * require isSecureContext === true. A first-time hiker who has NEVER
 * loaded that origin, sitting offline with no server to bootstrap it,
 * CANNOT get here — there is no browser API to mint the origin locally.
 * See demo.html VERDICT. What DOES work: a receiver who has the origin
 * (e.g. previously installed the shell, or is on localhost) topping up
 * or repairing their cache — including receiving the 131MB model —
 * from a peer with zero internet.
 * ------------------------------------------------------------------ */

import {
  newPeer, waitIceComplete, sdpToFrames, makeFrameCollector, newId,
} from './protocol.js';

export function createReceiver(onEvent = () => {}) {
  const id = newId();
  const pc = newPeer();

  // Reassembly state
  let manifest = null;
  let cur = null;            // {i,url,cache,ct,size, parts:[], got:0}
  let received = 0;
  const written = [];        // {url, cache, size}
  let t0 = 0;

  pc.addEventListener('connectionstatechange', () =>
    onEvent({ type: 'pcstate', state: pc.connectionState }));

  async function flushFileToCache(f) {
    if (!self.isSecureContext) {
      // Honest hard-stop: we can still hold the bytes in memory, but we
      // cannot persist them where the app would read them.
      throw new Error('insecure context: cannot write Cache Storage / register SW');
    }
    const blob = new Blob(f.parts, { type: f.ct });
    const res = new Response(blob, {
      headers: {
        'content-type': f.ct,
        'content-length': String(f.size),
        // Mark provenance so we can tell reconstructed entries apart.
        'x-oc-p2p': '1',
      },
    });
    const cache = await caches.open(f.cache);
    await cache.put(new Request(f.url), res);
    written.push({ url: f.url, cache: f.cache, size: f.size });
  }

  async function onControl(msg) {
    if (msg.t === 'manifest') {
      manifest = msg;
      t0 = performance.now();
      onEvent({ type: 'manifest', count: msg.count, totalBytes: msg.totalBytes });
    } else if (msg.t === 'file-begin') {
      cur = { ...msg, parts: [], got: 0 };
    } else if (msg.t === 'file-end') {
      if (cur) {
        try { await flushFileToCache(cur); onEvent({ type: 'file-written', url: cur.url, size: cur.size }); }
        catch (e) { onEvent({ type: 'error', where: 'write', url: cur.url, message: String(e && e.message || e) }); }
      }
      cur = null;
    } else if (msg.t === 'done') {
      const secs = (performance.now() - t0) / 1000;
      onEvent({ type: 'stream-complete', received, secs,
                mbps: secs > 0 ? received * 8 / 1e6 / secs : 0, written: written.length });
    }
  }

  function onData(buf) {
    if (!cur) return; // stray bytes outside a file window
    const u8 = new Uint8Array(buf);
    cur.parts.push(u8);
    cur.got += u8.length;
    received += u8.length;
    if ((cur.parts.length % 64) === 0) {
      const secs = (performance.now() - t0) / 1000;
      onEvent({ type: 'progress', received, total: manifest ? manifest.totalBytes : 0,
                mbps: secs > 0 ? received * 8 / 1e6 / secs : 0, file: cur.url });
    }
  }

  pc.addEventListener('datachannel', (ev) => {
    const dc = ev.channel;
    dc.binaryType = 'arraybuffer';
    onEvent({ type: 'channel-open' });
    dc.addEventListener('message', (e) => {
      if (typeof e.data === 'string') {
        try { onControl(JSON.parse(e.data)); }
        catch (_err) { /* ignore malformed control frame */ }
      } else {
        onData(e.data);
      }
    });
  });

  return {
    id,
    /** Step 2: feed scanned OFFER frames. When complete, sets remote,
     *  creates the answer, gathers host ICE, returns answer QR frames. */
    makeOfferCollector() {
      const col = makeFrameCollector();
      let handled = false;
      return async (qrText) => {
        if (handled) return { done: true };
        const done = await col.feed(qrText);
        if (!done || done.kind !== 'O') return { done: false, progress: col.progress(done ? done.id : id) };
        handled = true;
        await pc.setRemoteDescription({ type: 'offer', sdp: done.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitIceComplete(pc);
        onEvent({ type: 'answer-ready', sdpBytes: pc.localDescription.sdp.length });
        const frames = await sdpToFrames(pc.localDescription.sdp, 'A', id);
        return { done: true, answerFrames: frames };
      };
    },

    /** Step 4 (after stream-complete): make the received PWA runnable.
     *  Registers the service worker so the app boots offline next launch. */
    async finalizeAndRegisterSW(swUrl = '../sw.js', scope = '../') {
      if (!self.isSecureContext) {
        return { ok: false, reason: 'insecure-context',
                 detail: 'Service Worker + Cache Storage require https or localhost. ' +
                         'A LAN IP over http:// or a file:// bundle cannot host the reconstructed PWA.' };
      }
      if (!('serviceWorker' in navigator)) {
        return { ok: false, reason: 'no-sw-support' };
      }
      try {
        const reg = await navigator.serviceWorker.register(swUrl, { scope });
        onEvent({ type: 'sw-registered', scope: reg.scope });
        return { ok: true, scope: reg.scope, written: written.length };
      } catch (e) {
        return { ok: false, reason: 'register-failed', detail: String(e && e.message || e) };
      }
    },

    summary() {
      const byCache = {};
      for (const w of written) { byCache[w.cache] = (byCache[w.cache] || 0) + 1; }
      return { received, filesWritten: written.length, byCache,
               secureContext: self.isSecureContext };
    },
    cancel() { try { pc.close(); } catch (_e) {} },
    _pc: pc,
  };
}
