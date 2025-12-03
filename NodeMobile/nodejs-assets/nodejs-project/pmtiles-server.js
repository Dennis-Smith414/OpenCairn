// pmtiles-server.js
const http = require("http");
const fs = require("fs");
const rn_bridge = require("rn-bridge");

const PORT = 5200;

// Simple helper to forward logs to RN
function logToRN(payload) {
  try {
    rn_bridge.channel.send(
      JSON.stringify({
        type: "pmtiles-log",
        ...payload,
      })
    );
  } catch (e) {
    console.log(
      "[pmtiles-server][logToRN-failed]",
      e && e.message ? e.message : e
    );
  }
}

// ---- pmtiles imports ----
let PMTiles = null;
let ResolvedValueCache = null;

try {
  const pm = require("pmtiles");
  PMTiles = pm.PMTiles || pm;
  ResolvedValueCache = pm.ResolvedValueCache || null;
  logToRN({ msg: "pmtiles module loaded" });
} catch (err) {
  logToRN({
    msg: "pmtiles module NOT available",
    error: err && err.message ? err.message : String(err),
  });
}

// ---- File source ----
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

// ---- Active basemap ----
let currentBasemapPath = null;
let currentPmtiles = null;
let currentTileType = null; // <--- NEW

async function setActivePmtiles(path) {
  if (!PMTiles) {
    logToRN({
      msg: "Cannot set basemap: pmtiles module not available",
    });
    currentBasemapPath = null;
    currentPmtiles = null;
    currentTileType = null;
    return;
  }

  if (!path) {
    currentBasemapPath = null;
    currentPmtiles = null;
    currentTileType = null;
    logToRN({ msg: "Cleared active basemap" });
    return;
  }

  try {
    logToRN({ msg: "setActivePmtiles called", path });

    await fs.promises.access(path, fs.constants.R_OK);
    logToRN({ msg: "fs.access OK", path });

    const source = new NodeFileSource(path);
    const cache = ResolvedValueCache ? new ResolvedValueCache() : undefined;
    const pm = new PMTiles(source, cache);
    const header = await pm.getHeader();

    currentBasemapPath = path;
    currentPmtiles = pm;
    currentTileType = header.tileType || null; // <--- NEW

    logToRN({
      msg: "Active basemap set",
      path,
      tileType: header.tileType,   // <--- IMPORTANT
      minZoom: header.minZoom,
      maxZoom: header.maxZoom,
      bounds: {
        minLon: header.minLon,
        minLat: header.minLat,
        maxLon: header.maxLon,
        maxLat: header.maxLat,
      },
    });
  } catch (err) {
    logToRN({
      msg: "Failed to set basemap",
      path,
      error: err && err.message ? err.message : String(err),
    });
    currentBasemapPath = null;
    currentPmtiles = null;
    currentTileType = null;
  }
}

// ---- Messages from RN ----
rn_bridge.channel.on("message", (msg) => {
  try {
    const parsed = typeof msg === "string" ? JSON.parse(msg) : msg;
    if (!parsed || typeof parsed !== "object") return;

    if (parsed.type === "set-basemap") {
      const path = parsed.path || null;
      logToRN({ msg: "RN message: set-basemap", path });
      setActivePmtiles(path);
    } else {
      logToRN({ msg: "RN message: unknown type", raw: parsed });
    }
  } catch (err) {
    logToRN({
      msg: "Error handling RN message",
      error: err && err.message ? err.message : String(err),
    });
  }
});

// Tell RN we’re alive
rn_bridge.channel.send(
  JSON.stringify({ type: "pmtiles-server-ready", port: PORT })
);

// ---- HTTP server ----
const server = http.createServer(async (req, res) => {
  logToRN({ msg: "HTTP request", url: req.url });

  try {
    if (req.url === "/health") {
      const payload = {
        ok: true,
        basemap: !!currentPmtiles,
        path: currentBasemapPath,
        tileType: currentTileType,
      };
      logToRN({ msg: "HTTP /health", payload });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
      return;
    }

    const match = req.url.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (!match) {
      logToRN({ msg: "HTTP 404 (no match)", url: req.url });
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    if (!currentPmtiles) {
      logToRN({ msg: "HTTP 503 (no active basemap)", url: req.url });
      res.writeHead(503);
      res.end("No active basemap");
      return;
    }

    const z = parseInt(match[1], 10);
    const x = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);

    logToRN({ msg: "getZxy called", z, x, y, tileType: currentTileType });

    const tile = await currentPmtiles.getZxy(z, x, y);
    if (!tile || !tile.data) {
      logToRN({ msg: "No tile data", z, x, y });
      res.writeHead(204);
      res.end();
      return;
    }

    const buf = Buffer.from(tile.data);
    const magic = buf.slice(0, 8).toString("hex"); // <--- NEW
    logToRN({
      msg: "Tile served",
      z,
      x,
      y,
      bytes: buf.length,
      tileType: currentTileType,
      magic,
    });

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    });
    res.end(buf);
  } catch (err) {
    logToRN({
      msg: "Request error",
      url: req.url,
      error: err && err.message ? err.message : String(err),
    });
    try {
      res.writeHead(500);
      res.end("Internal error");
    } catch {
      // ignore
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  logToRN({ msg: "Listening", addr: "127.0.0.1", port: PORT });
});
