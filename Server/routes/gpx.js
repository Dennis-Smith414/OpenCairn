/**
 * Server/routes/gpx.js  — MODIFIED
 *
 * Endpoints:
 *  GET  /api/routes/ping
 *  GET  /api/routes/list
 *  GET  /api/routes/:id.meta
 *  GET  /api/routes/:id.geojson
 *  GET  /api/routes?minX&minY&maxX&maxY[&limit]
 *  POST /api/routes/upload
 */

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const bbox = require("@turf/bbox").default;
const { featureCollection, lineString } = require("@turf/helpers");
const gpxParse = require("gpx-parse");
const { Pool } = require("pg");

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Multer → in-memory GPX upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// 🛰️ Simple health check
router.get("/routes/ping", (_req, res) => res.json({ ok: true, where: "gpx-router" }));

// 📜 List routes (metadata only)
router.get("/routes/list", async (req, res) => {
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
});

// 📌 Route metadata only (no geometry)
router.get("/routes/:id.meta", async (req, res) => {
  const { id } = req.params;
  const q = await pool.query(
    `SELECT id, slug, name, region, created_at, updated_at FROM routes WHERE id = $1`,
    [id]
  );
  if (!q.rowCount) return res.sendStatus(404);
  res.json(q.rows[0]);
});

// 🧭 Geometry as GeoJSON (for MapScreen.tsx)
router.get("/routes/:id.geojson", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT ST_AsGeoJSON(geometry)::json AS geometry
         FROM gpx
        WHERE route_id = $1
        LIMIT 1`,
      [id]
    );

    if (!result.rowCount) return res.sendStatus(404);

    const geo = result.rows[0].geometry;
    const feature = {
      type: "Feature",
      properties: { route_id: id },
      geometry: geo,
    };
    res.json(feature);
  } catch (e) {
    console.error("geojson failed:", e);
    res.status(500).json({ error: "geojson-failed" });
  }
});

// 🌐 BBOX browse — intersect gpx geometries
router.get("/routes", async (req, res) => {
  try {
    const { minX, minY, maxX, maxY, limit = 200 } = req.query;
    if ([minX, minY, maxX, maxY].some((v) => v === undefined)) {
      return res.status(400).json({ error: "bbox required: minX,minY,maxX,maxY" });
    }

    const boundsWkt = `POLYGON((${minX} ${minY}, ${maxX} ${minY}, ${maxX} ${maxY}, ${minX} ${maxY}, ${minX} ${minY}))`;

    const q = await pool.query(
      `SELECT r.id, r.name, ST_AsGeoJSON(g.geometry)::json AS geometry
         FROM gpx g
         JOIN routes r ON g.route_id = r.id
        WHERE ST_Intersects(g.geometry, ST_GeomFromText($1, 4326))
        LIMIT LEAST($2::int, 1000)`,
      [boundsWkt, limit]
    );

    res.json({
      type: "FeatureCollection",
      features: q.rows.map((r) => ({
        type: "Feature",
        properties: { id: r.id, name: r.name },
        geometry: r.geometry,
      })),
    });
  } catch (e) {
    console.error("bbox browse failed:", e);
    res.status(500).json({ error: "bbox-failed" });
  }
});

// ⬆️ GPX Upload — store raw file + geometry in gpx table, create route metadata
router.post("/routes/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no-file" });
    const xml = req.file.buffer.toString("utf8");
    const checksum = crypto.createHash("sha256").update(xml).digest("hex");

    // Parse GPX → track coords
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

    // Insert route metadata
    const slug = "route-" + checksum.slice(0, 8);
    const name =
      gpx?.metadata?.name ||
      gpx?.tracks?.[0]?.name ||
      "Uploaded Route";

    const routeRes = await pool.query(
      `INSERT INTO routes (slug, name)
       VALUES ($1,$2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [slug, name]
    );
    const routeId = routeRes.rows[0].id;

    // Insert or update GPX geometry + file
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

module.exports = router;
