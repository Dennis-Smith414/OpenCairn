/**
 * Server/routes/gpx.js
 *
 * Web Framework & Middleware:
 *  - Express router exposes REST endpoints under /api/routes/*
 *  - Multer (memoryStorage) handles multipart GPX uploads (req.file.buffer)
 *
 * Data & Geometry:
 *  - Postgres + PostGIS (via pg Pool) stores raw GPX + derived geography
 *  - turf helpers compute bbox from GeoJSON
 *  - Haversine helper computes great-circle distance (meters)
 *
 * Endpoints:
 *  GET  /api/routes/ping            → quick router health
 *  GET  /api/routes/list            → list routes (pagination, optional q= search)
 *  GET  /api/routes/:id.meta        → metadata for a single route
 *  GET  /api/routes/:id.geojson     → geometry as GeoJSON Feature
 *  GET  /api/routes?minX&minY&maxX&maxY[&limit]
 *                                  → FeatureCollection of routes intersecting a bbox
 *  POST /api/routes/upload          → upload a .gpx (multipart field: file)
 */

const express = require("express");               // Web Framework for Node -- Used for routing, middleware, JSON parsing
const multer = require("multer");                 // Middleware to handle file uploads in Express
const crypto = require("crypto");                 // Node's built-in crypto utilities (checksums for dedupe)
const bbox = require("@turf/bbox").default;       // Computes [minX,minY,maxX,maxY] from GeoJSON
const { featureCollection, lineString } = require("@turf/helpers"); // Helpers to build GeoJSON objects
const gpxParse = require("gpx-parse");            // Parses .gpx XML into JS objects
const { Pool } = require("pg");                   // Manages Postgres connections

// Create a mini Express app just for 'routes' endpoints
const router = express.Router();

// --- PostgreSQL connection manager ------------------------------------------
// Use the connection string from process.env.DATABASE_URL (loaded in index.js via dotenv).
// NOTE: We keep a SINGLE Pool instance for this module. Avoid redeclaring Pool.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// --- Multer config -----------------------------------------------------------
// Use memory storage so req.file.buffer exists (we parse GPX directly from memory).
const upload = multer({
  storage: multer.memoryStorage(),        // <— ensure req.file.buffer exists
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max upload
});

/**
 * Compute the great-circle distance (meters) between two [lon,lat] points
 * using the Haversine formula.
 * - Inputs are degrees; internally converted to radians for trig functions.
 * - Returns straight-line distance over the Earth's surface.
 */
function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// -----------------------------------------------------------------------------
// Simple ping: quick proof the router is mounted at /api
// -----------------------------------------------------------------------------
router.get("/routes/ping", (_req, res) =>
  res.json({ ok: true, where: "gpx-router" })
);

// -----------------------------------------------------------------------------
// LIST endpoint
// GET /api/routes/list?offset=0&limit=20&q=smith
// - Returns a paginated list of routes, optionally filtered by name (ILIKE).
// -----------------------------------------------------------------------------
router.get("/routes/list", async (req, res) => {
  const { offset = 0, limit = 20, q = "" } = req.query;

  // Defensive parsing: cap limit (avoid unbounded scans), default offset to 0.
  const lim = Math.min(parseInt(limit, 10) || 20, 100);
  const off = parseInt(offset, 10) || 0;

  // If a search term is present, add a WHERE ILIKE filter; otherwise select all.
  const where = q ? `WHERE name ILIKE $1` : ``;

  // Parameter order shifts depending on `q`.
  const params = q ? [`%${q}%`, lim, off] : [lim, off];

  // ORDER BY updated_at DESC keeps newest/edited routes first.
  const sql = `
    SELECT id, slug, name, distance_m, points_n, updated_at
      FROM routes
      ${where}
     ORDER BY updated_at DESC
     LIMIT $${q ? 2 : 1} OFFSET $${q ? 3 : 2}
  `;

  const { rows } = await pool.query(sql, params);
  res.json({ items: rows, nextOffset: off + rows.length });
});

// -----------------------------------------------------------------------------
// META endpoint
// GET /api/routes/:id.meta
// - Return metadata for a single route (no geometry).
// -----------------------------------------------------------------------------
router.get("/routes/:id/meta", async (req, res) => {
  const { id } = req.params;

  const q = await pool.query(
    `SELECT id, slug, name, distance_m, points_n, updated_at
       FROM routes
      WHERE id = $1`,
    [id]
  );

  if (!q.rowCount) return res.sendStatus(404);
  res.json(q.rows[0]);
});

// -----------------------------------------------------------------------------
// GEOJSON endpoint
// GET /api/routes/:id.geojson
// - Return a single route as a GeoJSON Feature { properties, geometry }.
// - geometry comes from ST_AsGeoJSON(geom::geometry) (geom is stored as GEOGRAPHY).
// -----------------------------------------------------------------------------
router.get("/routes/:id.geojson", async (req, res) => {
  try {
    const { id } = req.params;

    const q = await pool.query(
      `SELECT id, name, ST_AsGeoJSON(geom::geometry)::json AS geometry
         FROM routes
        WHERE id = $1`,
      [id]
    );

    if (!q.rowCount) return res.sendStatus(404);

    const r = q.rows[0];
    res.json({
      type: "Feature",
      properties: { id: r.id, name: r.name },
      geometry: r.geometry,
    });
  } catch (e) {
    console.error("geojson failed:", e);
    res.status(500).json({ error: "geojson-failed" });
  }
});

// -----------------------------------------------------------------------------
// BBOX browse endpoint
// GET /api/routes?minX&minY&maxX&maxY[&limit]
// - Returns a FeatureCollection of routes intersecting the bbox.
// - Input bbox is WKT POLYGON; queries GEOGRAPHY geom via ST_Intersects.
// -----------------------------------------------------------------------------
router.get("/routes", async (req, res) => {
  try {
    const { minX, minY, maxX, maxY, limit = 200 } = req.query;

    // Basic input guard: require all four bbox params
    if ([minX, minY, maxX, maxY].some((v) => v === undefined)) {
      return res
        .status(400)
        .json({ error: "bbox required: minX,minY,maxX,maxY" });
    }

    // WKT polygon of the bbox (lon/lat order)
    const boundsWkt = `POLYGON((${minX} ${minY}, ${maxX} ${minY}, ${maxX} ${maxY}, ${minX} ${maxY}, ${minX} ${minY}))`;

    // Intersect query: GEOGRAPHY vs. ST_GeogFromText(WKT)
    const q = await pool.query(
      `SELECT id, name, ST_AsGeoJSON(geom::geometry)::json AS geometry
         FROM routes
        WHERE ST_Intersects(geom, ST_GeogFromText($1))
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

// -----------------------------------------------------------------------------
// UPLOAD endpoint
// POST /api/routes/upload  (multipart form field: file)
// - Accepts a GPX file upload (field name: "file").
// - Parses the GPX into track coordinates.
// - Computes distance + bbox, converts geometry to WKT.
// - De-duplicates by SHA-256 checksum.
// - Stores source GPX + derived geometry into Postgres (PostGIS).
// -----------------------------------------------------------------------------
router.post("/routes/upload", upload.single("file"), async (req, res) => {
  try {
    // Ensure a file was uploaded under the "file" field.
    if (!req.file) return res.status(400).json({ error: "no-file" });

    // Read the uploaded GPX (XML) from memory.
    const xml = req.file.buffer.toString("utf8");

    // Compute checksum (dedupe key).
    const checksum = crypto.createHash("sha256").update(xml).digest("hex");

    // QUICK DEDUPE: if a route with the same checksum already exists, short-circuit.
    {
      const dup = await pool.query(
        "SELECT id FROM routes WHERE checksum=$1",
        [checksum]
      );
      if (dup.rowCount) {
        return res.json({ ok: true, id: dup.rows[0].id, dedup: true });
      }
    }

    // Parse GPX → JS object model (tracks → segments → points).
    // gpx-parse uses a callback API; wrap in a Promise so we can await it.
    const gpx = await new Promise((resolve, reject) =>
      gpxParse.parseGpx(xml, (err, data) => (err ? reject(err) : resolve(data)))
    );

    // Collect each segment as an array of [lon,lat] pairs for geometry building.
    const multi = [];    // Array<Array<[lon, lat]>>
    let totalPoints = 0; // Count of coordinates across all segments
    let totalMeters = 0; // Total length across all segments (meters)

    for (const trk of gpx.tracks || []) {
      for (const seg of trk.segments || []) {
        // Map GPX points → [lon,lat]; drop any non-finite coords.
        const coords = seg
          .map((p) => [p.lon, p.lat])
          .filter((xy) => Number.isFinite(xy[0]) && Number.isFinite(xy[1]));

        // Keep only segments with ≥2 points (needed to form a line).
        if (coords.length >= 2) {
          multi.push(coords);
          totalPoints += coords.length;

          // Accumulate Haversine distance along this segment.
          for (let i = 1; i < coords.length; i++) {
            totalMeters += haversineMeters(coords[i - 1], coords[i]);
          }
        }
      }
    }

    // If we didn’t find any valid segments, reject the upload.
    if (!multi.length) {
      return res.status(400).json({ error: "no-track-segments" });
    }

    // Build a GeoJSON FeatureCollection from segments to compute bbox.
    const fc = featureCollection(multi.map((seg) => lineString(seg)));
    const [minX, minY, maxX, maxY] = bbox(fc); // [west, south, east, north]

    // MULTILINESTRING WKT from all segments.
    // Example: MULTILINESTRING((x1 y1,x2 y2,...),(x1 y1,x2 y2,...),...)
    const mlsWkt =
      "MULTILINESTRING(" +
      multi
        .map((seg) => "(" + seg.map(([x, y]) => `${x} ${y}`).join(",") + ")")
        .join(",") +
      ")";

    // Bounds polygon WKT from computed bbox.
    const boundsWkt = `POLYGON((${minX} ${minY}, ${maxX} ${minY}, ${maxX} ${maxY}, ${minX} ${maxY}, ${minX} ${minY}))`;

    // Choose a human-friendly name: GPX metadata → first track name → fallback.
    const name =
      gpx?.metadata?.name ||
      (gpx?.tracks?.[0]?.name ? String(gpx.tracks[0].name) : "Uploaded Route");

    // Stable slug based on checksum prefix (convenient for linking).
    const slug = "route-" + checksum.slice(0, 8);

    // Insert the route:
    //  - slug, name, source
    //  - raw GPX XML (provenance) + checksum (dedupe)
    //  - derived stats: distance (meters), points
    //  - bounds & geom as GEOGRAPHY (via ST_GeogFromText on WKT)
    const { rows } = await pool.query(
      `INSERT INTO routes (slug, name, source, gpx_xml, checksum, distance_m, points_n, bounds, geom)
       VALUES ($1,$2,$3,$4,$5,$6,$7, ST_GeogFromText($8), ST_GeogFromText($9))
       RETURNING id`,
      [
        slug,
        name,
        "upload",
        xml,
        checksum,
        Math.round(totalMeters),
        totalPoints,
        boundsWkt,
        mlsWkt,
      ]
    );

    // Respond with success + basic metadata.
    res.json({
      ok: true,
      id: rows[0].id,
      slug,
      name,
      distance_m: Math.round(totalMeters),
      points_n: totalPoints,
    });
  } catch (err) {
    console.error("upload failed:", err);
    res.status(500).json({ error: "upload-failed" });
  }
});

// Export the router so index.js can mount it at /api
module.exports = router;
