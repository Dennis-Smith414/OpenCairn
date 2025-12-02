// pmtiles-server.js
// Tiny HTTP server that serves tiles from the *active* PMTiles file.
// Talks to React Native via rn-bridge.

const http = require("http");
const fs = require("fs");
const rn_bridge = require("rn-bridge");

// Try to require pmtiles, but don't crash if missing
let PMTiles = null;
let ResolvedValueCache = null;
try {
  const pm = require("pmtiles");
  PMTiles = pm.PMTiles || pm;
  ResolvedValueCache = pm.ResolvedValueCache || pm.ResolvedValueCache;
  console.log("[pmtiles-server] pmtiles module loaded");
} catch (err) {
  console.error("[pmtiles-server] pmtiles module NOT available:", err.message);
}

const PORT = 5200;

// -----------------------------
// NodeFileSource: PMTiles Source
// -----------------------------
class NodeFileSource {
  constructor(path) {
    this.path = path;
  }

  getKey() {
    return this.path;
  }

  async getBytes(offset, length, _signal, _etag) {
    const fd = await fs.promises.open(this.path, "r");
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fd.read(buf, 0, length, offset);
      return {
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead),
        etag: undefined,
        cacheControl: undefined,
        expires: undefined,
      };
    } finally {
      await fd.close();
    }
  }
}

// -----------------------------
// Active basemap state
// -----------------------------
let currentBasemapPath = null;
let currentPmtiles = null;

async function setActivePmtiles(path) {
  if (!PMTiles) {
    console.error(
      "[pmtiles-server] Cannot set basemap: pmtiles module not available"
    );
    currentBasemapPath = null;
    currentPmtiles = null;
    return;
  }

  if (!path) {
    currentBasemapPath = null;
    currentPmtiles = null;
    console.log("[pmtiles-server] Cleared active basemap");
    return;
  }

  try {
    await fs.promises.access(path, fs.constants.R_OK);

    const source = new NodeFileSource(path);
    const cache = new ResolvedValueCache();
    const pm = new PMTiles(source, cache);

    const header = await pm.getHeader();
    console.log(
      "[pmtiles-server] Active basemap set:",
      path,
      `z${header.minZoom}-${header.maxZoom}`,
      "bounds:",
      header.minLon,
      header.minLat,
      header.maxLon,
      header.maxLat
    );

    currentBasemapPath = path;
    currentPmtiles = pm;
  } catch (err) {
    console.error("[pmtiles-server] Failed to set basemap:", path, err.message);
    currentBasemapPath = null;
    currentPmtiles = null;
  }
}

// -----------------------------
// rn-bridge: messages from RN
// -----------------------------
rn_bridge.channel.on("message", (msg) => {
  try {
    const parsed = typeof msg === "string" ? JSON.parse(msg) : msg;
    if (!parsed || typeof parsed !== "object") return;

    if (parsed.type === "set-basemap") {
      const path = parsed.path || null;
      console.log("[pmtiles-server] set-basemap", path);
      setActivePmtiles(path);
    }
  } catch (err) {
    console.error("[pmtiles-server] Error handling message:", err.message);
  }
});

// Let RN know we’re up
rn_bridge.channel.send(
  JSON.stringify({ type: "pmtiles-server-ready", port: PORT })
);

// -----------------------------
// HTTP server: /tiles/{z}/{x}/{y}.mvt
// -----------------------------
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ ok: true, basemap: !!currentPmtiles, path: currentBasemapPath })
      );
      return;
    }

    if (!req.url.startsWith("/tiles/")) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    if (!currentPmtiles) {
      res.writeHead(503);
      res.end("No active basemap");
      return;
    }

    const match = req.url.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)\.png)$/);
    if (!match) {
      res.writeHead(400);
      res.end("Bad tiles URL");
      return;
    }

    const z = parseInt(match[1], 10);
    const x = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);

    const tile = await currentPmtiles.getZxy(z, x, y);
    if (!tile || !tile.data) {
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    });
    res.end(Buffer.from(tile.data));
  } catch (err) {
    console.error("[pmtiles-server] Request error:", err.message);
    try {
      res.writeHead(500);
      res.end("Internal error");
    } catch (_) {}
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("[pmtiles-server] Listening on http://127.0.0.1:" + PORT);
});
