// offline/routes/tiles.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const { PMTiles } = require("pmtiles");

const router = express.Router();

// ---- FileSource for pmtiles (Node fs-based) ----
class FileSource {
  constructor(filename) {
    this.filename = filename;
    this.fileDescriptor = fs.openSync(filename, "r");
  }

  getKey() {
    return this.filename;
  }

  // helper: read bytes from file into buffer
  readBytesIntoBuffer(buffer, offset) {
    return new Promise((resolve, reject) => {
      fs.read(
        this.fileDescriptor,
        buffer,
        0,
        buffer.length,
        offset,
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  // required by pmtiles Source interface
  async getBytes(offset, length) {
    const buffer = Buffer.alloc(length);
    await this.readBytesIntoBuffer(buffer, offset);

    // convert Node Buffer → ArrayBuffer
    const data = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );

    return { data };
  }
}

// ---- Init PMTiles instance ----
const pmtilesPath = path.join(
  __dirname,
  "..",
  "tiledata",
  "opencairn-us-wi-z4-14.pmtiles"
);

if (!fs.existsSync(pmtilesPath)) {
  console.error("[offline-tiles] PMTiles file not found:", pmtilesPath);
}

const source = new FileSource(pmtilesPath);
const pmtiles = new PMTiles(source);

// ---- Tile endpoint ----
// Example URL: /tiles/4/7/5.mvt
router.get("/tiles/:z/:x/:y.mvt", async (req, res) => {
  const z = Number(req.params.z);
  const x = Number(req.params.x);
  const y = Number(req.params.y);

  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return res.status(400).json({ error: "Invalid z/x/y" });
  }

  try {
    const tile = await pmtiles.getZxy(z, x, y);
    if (!tile) {
      return res.status(404).send("Tile not found");
    }

    const data = Buffer.from(tile.data); // tile.data is ArrayBuffer

    const header = await pmtiles.getHeader();

    // Vector MVT tiles
    if (header.tileType === 1) {
      res.setHeader("Content-Type", "application/x-protobuf");
    }

    // Planetiler default is gzip compression → tell MapLibre
    // (If you ever change Planetiler to use uncompressed tiles, you can remove this)
    //res.setHeader("Content-Encoding", "gzip");

    res.status(200).send(data);
  } catch (err) {
    console.error("[offline-tiles] Error serving tile:", err);
    res.status(500).json({ error: "Failed to serve tile" });
  }
});


module.exports = router;
