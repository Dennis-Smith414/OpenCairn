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
let currentHeader = null;

async function setActivePmtiles(path) {
  if (!PMTiles) {
    logToRN({
      msg: "Cannot set basemap: pmtiles module not available",
    });
    currentBasemapPath = null;
    currentPmtiles = null;
    currentHeader = null;
    return;
  }

  if (!path) {
    currentBasemapPath = null;
    currentPmtiles = null;
    currentHeader = null;
    logToRN({ msg: "Cleared active basemap" });
    return;
  }

  try {
    await fs.promises.access(path, fs.constants.R_OK);

    const source = new NodeFileSource(path);
    const cache = ResolvedValueCache ? new ResolvedValueCache() : undefined;
    const pm = new PMTiles(source, cache);
    const header = await pm.getHeader();

    currentBasemapPath = path;
    currentPmtiles = pm;
    currentHeader = header;

    logToRN({
      msg: "Active basemap set",
      path,
      minZoom: header.minZoom,
      maxZoom: header.maxZoom,
      tileType: header.tileType,
      minLon: header.minLon,
      minLat: header.minLat,
      maxLon: header.maxLon,
      maxLat: header.maxLat,
    });
  } catch (err) {
    logToRN({
      msg: "Failed to set basemap",
      path,
      error: err && err.message ? err.message : String(err),
    });
    currentBasemapPath = null;
    currentPmtiles = null;
    currentHeader = null;
  }
}

// ---- Messages from RN ----
rn_bridge.channel.on("message", (msg) => {
  try {
    const parsed = typeof msg === "string" ? JSON.parse(msg) : msg;
    if (!parsed || typeof parsed !== "object") return;

    if (parsed.type === "set-basemap") {
      const path = parsed.path || null;
      logToRN({ msg: "set-basemap received", path });
      setActivePmtiles(path);
    }
  } catch (err) {
    logToRN({
      msg: "Error handling message",
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
  try {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          basemap: !!currentPmtiles,
          path: currentBasemapPath,
          header: currentHeader
            ? {
                minZoom: currentHeader.minZoom,
                maxZoom: currentHeader.maxZoom,
                tileType: currentHeader.tileType,
              }
            : null,
        })
      );
      return;
    }

    const match = req.url.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)\.(mvt|pbf)$/);
    if (!match) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    if (!currentPmtiles) {
      res.writeHead(503);
      res.end("No active basemap");
      return;
    }

    const z = parseInt(match[1], 10);
    const x = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);

    logToRN({ msg: "getZxy called", z, x, y });

    const tile = await currentPmtiles.getZxy(z, x, y);
    if (!tile || !tile.data) {
      res.writeHead(204);
      res.end();
      return;
    }

    const buf = Buffer.from(tile.data);

    logToRN({
      msg: "Tile served",
      z,
      x,
      y,
      bytes: buf.length,
      tileType: currentHeader ? currentHeader.tileType : undefined,
    });

    res.writeHead(200, {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      "Cache-Control": "no-store",
    });
    res.end(buf);
  } catch (err) {
    logToRN({
      msg: "Request error",
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
  logToRN({ msg: "Listening", url: `http://127.0.0.1:${PORT}` });
});
