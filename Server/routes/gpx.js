// server/routes/gpx.js
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { Pool } = require("pg");
const gpxParse = require("gpx-parse");
const authorize = require("../middleware/authorize");

console.log("[gpx] Loaded DATABASE_URL =", JSON.stringify(process.env.DATABASE_URL));

/** @type {import('pg').Pool} */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const router = express.Router();

/** Multer → in-memory GPX upload */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

router.get("/routes/ping", (_req, res) => res.json({ ok: true, where: "gpx-router" }));

/**
 * Parse GPX XML buffer → { name, coords:[[lon,lat],...], checksum }
 * @param {Buffer} buf
 * @returns {Promise<{name: string, coords: [number, number][], checksum: string}>}
 */
async function parseGpxBuffer(buf) {
  const xml = buf.toString("utf8");
  const checksum = crypto.createHash("sha256").update(xml).digest("hex");

  const gpx = await new Promise((resolve, reject) =>
    gpxParse.parseGpx(xml, (err, data) => (err ? reject(err) : resolve(data)))
  );

  /** @type {[number, number][]} */
  const coords = [];
  for (const trk of gpx.tracks || []) {
    for (const seg of trk.segments || []) {
      for (const p of seg) {
        if (Number.isFinite(p.lon) && Number.isFinite(p.lat)) {
          coords.push([p.lon, p.lat]);
        }
      }
    }
  }

  const name =
    (gpx && gpx.metadata && gpx.metadata.name) ||
    (gpx && gpx.tracks && gpx.tracks[0] && gpx.tracks[0].name) ||
    "Uploaded Track";

  return { name, coords, checksum };
}

/**
 * GET /api/routes/:id.geojson
 * Return a FeatureCollection for ALL GPX geometries of a route (empty collection if none).
 * @typedef {{type:'Feature',properties:Record<string,any>,geometry:any}} GeoJSONFeature
 * @typedef {{type:'FeatureCollection',features:GeoJSONFeature[]}} FeatureCollection
 */
router.get("/routes/:id.geojson", async (req, res) => {
  try {
    const routeId = Number(req.params.id);
    if (!Number.isInteger(routeId) || routeId <= 0) {
      return res.status(400).json({ ok: false, error: "invalid-route-id" });
    }

    const result = await pool.query(
      `SELECT id, name, ST_AsGeoJSON(geometry)::json AS geometry
         FROM gpx
        WHERE route_id = $1
        ORDER BY id ASC`,
      [routeId]
    );

    /** @type {GeoJSONFeature[]} */
    const features = result.rows.map((row, idx) => ({
      type: "Feature",
      properties: { route_id: routeId, gpx_id: row.id, name: row.name, segment: idx },
      geometry: row.geometry,
    }));

    /** @type {FeatureCollection} */
    const fc = { type: "FeatureCollection", features };
    res.json(fc);
  } catch (e) {
    console.error("geojson failed:", e);
    res.status(500).json({ ok: false, error: "geojson-failed" });
  }
});

/**
 * GET /api/routes/:id/gpx
 * List GPX rows (metadata) for a route.
 */
router.get("/routes/:id/gpx", async (req, res) => {
  try {
    const routeId = Number(req.params.id);
    if (!Number.isInteger(routeId) || routeId <= 0) {
      return res.status(400).json({ ok: false, error: "invalid-route-id" });
    }

    const q = await pool.query(
      `SELECT id, route_id, name, created_at
         FROM gpx
        WHERE route_id = $1
        ORDER BY id ASC`,
      [routeId]
    );
    res.json({ ok: true, items: q.rows });
  } catch (e) {
    console.error("list gpx failed:", e);
    res.status(500).json({ ok: false, error: "list-gpx-failed" });
  }
});

/**
 * POST /api/routes/:id/gpx   (multipart/form-data with "file")
 * Attach a new GPX file to an existing route.
 * Security: only the route owner may upload (adjust if you support collaborators).
 */
router.post("/routes/:id/gpx", authorize, upload.single("file"), async (req, res) => {
  /** @type {import('pg').PoolClient | null} */
  let client = null;

  try {
    const routeId = Number(req.params.id);
    if (!Number.isInteger(routeId) || routeId <= 0) {
      return res.status(400).json({ ok: false, error: "invalid-route-id" });
    }
    if (!req.file) return res.status(400).json({ ok: false, error: "no-file" });

    client = await pool.connect();

    // Ownership check (change/remove if you want collaborators)
    const ownerCheck = await client.query(
      `SELECT id FROM routes WHERE id = $1 AND user_id = $2`,
      [routeId, req.user.id]
    );
    if (!ownerCheck.rowCount) {
      return res.status(403).json({ ok: false, error: "not-owner-or-not-found" });
    }

    const { name, coords /*, checksum*/ } = await parseGpxBuffer(req.file.buffer);
    if (coords.length < 2) {
      return res.status(400).json({ ok: false, error: "no-track-points" });
    }

    // WKT LINESTRING
    const wkt = `LINESTRING(${coords.map(([lon, lat]) => `${lon} ${lat}`).join(",")})`;

    await client.query("BEGIN");

    const ins = await client.query(
      `INSERT INTO gpx (route_id, name, geometry, file)
       VALUES ($1, $2, ST_GeomFromText($3, 4326), $4)
       RETURNING id, route_id, name, created_at`,
      [routeId, name, wkt, req.file.buffer]
    );

    // bump route updated_at so lists sort by recent activity
    await client.query(`UPDATE routes SET updated_at = NOW() WHERE id = $1`, [routeId]);

    await client.query("COMMIT");

    res.json({ ok: true, gpx: ins.rows[0] });
  } catch (err) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    console.error("upload gpx failed:", err);
    res.status(500).json({ ok: false, error: "upload-gpx-failed" });
  } finally {
    if (client) client.release();
  }
});

/**
 * DELETE /api/gpx/:gpxId
 * Remove a single GPX row.
 * Security: only route owner can delete a GPX row.
 */
router.delete("/gpx/:gpxId", authorize, async (req, res) => {
  /** @type {import('pg').PoolClient | null} */
  let client = null;

  try {
    const gpxId = Number(req.params.gpxId);
    if (!Number.isInteger(gpxId) || gpxId <= 0) {
      return res.status(400).json({ ok: false, error: "invalid-gpx-id" });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    // Find the route for this GPX row and ensure ownership
    const found = await client.query(
      `SELECT g.id AS gpx_id, r.id AS route_id, r.user_id
         FROM gpx g
         JOIN routes r ON r.id = g.route_id
        WHERE g.id = $1`,
      [gpxId]
    );
    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "not-found" });
    }
    if (Number(found.rows[0].user_id) !== Number(req.user.id)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ ok: false, error: "not-owner" });
    }

    const del = await client.query(
      `DELETE FROM gpx WHERE id = $1 RETURNING id, route_id`,
      [gpxId]
    );

    // bump route updated_at after deletion as well
    await client.query(`UPDATE routes SET updated_at = NOW() WHERE id = $1`, [
      del.rows[0].route_id,
    ]);

    await client.query("COMMIT");

    res.json({ ok: true, deleted_id: del.rows[0].id });
  } catch (e) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    console.error("delete gpx failed:", e);
    res.status(500).json({ ok: false, error: "delete-gpx-failed" });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
