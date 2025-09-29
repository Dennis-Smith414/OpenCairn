// Server/routes/gpx.js
require('dotenv').config();
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { Pool } = require("pg");
const gpxParse = require("gpx-parse");
const { featureCollection, lineString } = require("@turf/helpers");

console.log('[gpx] Loaded DATABASE_URL =', JSON.stringify(process.env.DATABASE_URL));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const router = express.Router();

// Multer → in-memory GPX upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// 🛰️ Health check
router.get("/routes/ping", (_req, res) => res.json({ ok: true, where: "gpx-router" }));

// 📜 Route list
router.get("/routes/list", async (req, res) => {
  try {
    const { offset = 0, limit = 20, q = "" } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const off = parseInt(offset, 10) || 0;
    const where = q ? `WHERE name ILIKE $1` : ``;
    const params = q ? [`%${q}%`, lim, off] : [lim, off];

    const sql = `
      SELECT id, slug, name, region, created_at, updated_at
      FROM routes
      ${where}
      ORDER BY updated_at DESC
      LIMIT $${q ? 2 : 1} OFFSET $${q ? 3 : 2}
    `;
    const { rows } = await pool.query(sql, params);
    res.json({ items: rows, nextOffset: off + rows.length });
  } catch (e) {
    console.error("list failed:", e);
    res.status(500).json({ error: "list-failed" });
  }
});

// 📌 Route metadata (no geometry)
router.get("/routes/:id.meta", async (req, res) => {
  const { id } = req.params;
  const q = await pool.query(
    `SELECT id, slug, name, region, created_at, updated_at FROM routes WHERE id = $1`,
    [id]
  );
  if (!q.rowCount) return res.sendStatus(404);
  res.json(q.rows[0]);
});

// 🧭 GeoJSON for *all GPX entries* of a route
router.get("/routes/:id.geojson", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ST_AsGeoJSON(geometry)::json AS geometry
         FROM gpx
        WHERE route_id = $1`,
      [id]
    );

    if (!result.rowCount) return res.sendStatus(404);

    // Build a FeatureCollection of all geometries for this route
    const features = result.rows.map((row, idx) => ({
      type: "Feature",
      properties: { route_id: id, segment: idx },
      geometry: row.geometry,
    }));

    res.json({
      type: "FeatureCollection",
      features,
    });
  } catch (e) {
    console.error("geojson failed:", e);
    res.status(500).json({ error: "geojson-failed" });
  }
});

// ⬆️ GPX Upload
router.post("/routes/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no-file" });
    const xml = req.file.buffer.toString("utf8");
    const checksum = crypto.createHash("sha256").update(xml).digest("hex");

    // Parse GPX → coords
    const gpx = await new Promise((resolve, reject) =>
      gpxParse.parseGpx(xml, (err, data) => (err ? reject(err) : resolve(data)))
    );

    const coords = [];
    for (const trk of gpx.tracks || []) {
      for (const seg of trk.segments || []) {
        seg.forEach((p) => {
          if (Number.isFinite(p.lon) && Number.isFinite(p.lat)) {
            coords.push([p.lon, p.lat]);
          }
        });
      }
    }
    if (coords.length < 2) return res.status(400).json({ error: "no-track-points" });

    const slug = "route-" + checksum.slice(0, 8);
    const name = gpx?.metadata?.name || gpx?.tracks?.[0]?.name || "Uploaded Route";

    const routeRes = await pool.query(
      `INSERT INTO routes (slug, name)
       VALUES ($1,$2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [slug, name]
    );
    const routeId = routeRes.rows[0].id;

    const lineWkt = `LINESTRING(${coords.map(([x, y]) => `${x} ${y}`).join(",")})`;
    await pool.query(
      `INSERT INTO gpx (route_id, name, geometry, file)
       VALUES ($1, $2, ST_GeomFromText($3, 4326), $4)
       ON CONFLICT (route_id) DO UPDATE
         SET name = EXCLUDED.name,
             geometry = EXCLUDED.geometry,
             file = EXCLUDED.file`,
      [routeId, name, lineWkt, req.file.buffer]
    );

    res.json({ ok: true, id: routeId, slug, name });
  } catch (err) {
    console.error("upload failed:", err);
    res.status(500).json({ error: "upload-failed" });
  }
});

// ✏️ Update route metadata
router.patch("/routes/:id", async (req, res) => {
  const { id } = req.params;
  const { name, region } = req.body;

  try {
    const result = await pool.query(
      `UPDATE routes
       SET name = COALESCE($1, name),
           region = COALESCE($2, region),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, slug, name, region, updated_at`,
      [name, region, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "not-found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("update route failed:", err);
    res.status(500).json({ error: "update-failed" });
  }
});

module.exports = router;
