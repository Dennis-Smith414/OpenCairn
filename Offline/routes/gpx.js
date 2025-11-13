// Server/routes/gpx.js
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const gpxParse = require("gpx-parse");
const authorize = require("../middleware/authorize");
const db = require("../Postgres"); // use your pooled helper

const router = express.Router();

// Multer → in-memory GPX upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Simple health check (optional)
router.get("/routes/ping", (_req, res) => res.json({ ok: true, where: "gpx-router" }));

/** Utility: parse GPX XML → array of segments, each segment = [[lon,lat], ...] */
function extractSegments(gpx) {
  const segments = [];
  for (const trk of gpx.tracks || []) {
    for (const seg of trk.segments || []) {
      const coords = [];
      for (const p of seg || []) {
        if (Number.isFinite(p.lon) && Number.isFinite(p.lat)) {
          coords.push([p.lon, p.lat]);
        }
      }
      if (coords.length >= 2) segments.push(coords);
    }
  }
  return segments;
}

function lineWkt(coords) {
  // coords is [[lon,lat], ...]
  return `LINESTRING(${coords.map(([x, y]) => `${x} ${y}`).join(",")})`;
}

/**
 * POST /api/routes/:id/gpx
 * Attach GPX file to an existing route (one DB row per GPX segment)
 */
router.post("/routes/:id/gpx", authorize, upload.single("file"), async (req, res) => {
  try {
    const routeId = Number(req.params.id);
    if (!req.file) return res.status(400).json({ ok: false, error: "no-file" });

    // Ensure route exists
    const route = await db.get(`SELECT id, name FROM routes WHERE id = $1`, [routeId]);
    if (!route) return res.status(404).json({ ok: false, error: "route-not-found" });

    const xml = req.file.buffer.toString("utf8");
    const gpx = await new Promise((resolve, reject) =>
      gpxParse.parseGpx(xml, (err, data) => (err ? reject(err) : resolve(data)))
    );

    const segments = extractSegments(gpx);
    if (!segments.length) return res.status(400).json({ ok: false, error: "no-track-segments" });

    const baseName = gpx?.metadata?.name || gpx?.tracks?.[0]?.name || "Uploaded GPX";

    // Insert one row per segment
    for (let i = 0; i < segments.length; i++) {
      const segName = segments.length > 1 ? `${baseName} (seg ${i + 1})` : baseName;
      const wkt = lineWkt(segments[i]);
      await db.run(
        `INSERT INTO gpx (route_id, name, geometry, file)
         VALUES ($1, $2, ST_GeomFromText($3, 4326), $4)`,
        [routeId, segName, wkt, req.file.buffer]
      );
    }

    res.json({ ok: true, route_id: routeId, segments: segments.length });
  } catch (err) {
    console.error("POST /routes/:id/gpx failed:", err);
    res.status(500).json({ ok: false, error: "upload-failed" });
  }
});

/**
 * Legacy: POST /api/routes/upload
 * Create-or-reuse a route by checksum-derived slug, then attach GPX.
 * (Keeps your old flow working while you migrate the client.)
 */
router.post("/routes/upload", authorize, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "no-file" });

    const xml = req.file.buffer.toString("utf8");
    const checksum = crypto.createHash("sha256").update(xml).digest("hex");
    const slug = "route-" + checksum.slice(0, 8);
    const userId = req.user?.id ?? null;

    // Parse GPX
    const gpx = await new Promise((resolve, reject) =>
      gpxParse.parseGpx(xml, (err, data) => (err ? reject(err) : resolve(data)))
    );
    const segments = extractSegments(gpx);
    if (!segments.length) return res.status(400).json({ ok: false, error: "no-track-segments" });

    const name = gpx?.metadata?.name || gpx?.tracks?.[0]?.name || "Uploaded Route";

    // Upsert route by slug
    const route = await db.get(
      `INSERT INTO routes (slug, name, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             user_id = COALESCE(routes.user_id, EXCLUDED.user_id)
       RETURNING id, slug, name`,
      [slug, name, userId]
    );
    const routeId = route.id;

    // Insert one row per segment (no ON CONFLICT here → allow multiple GPX rows per route)
    for (let i = 0; i < segments.length; i++) {
      const segName = segments.length > 1 ? `${name} (seg ${i + 1})` : name;
      const wkt = lineWkt(segments[i]);
      await db.run(
        `INSERT INTO gpx (route_id, name, geometry, file)
         VALUES ($1, $2, ST_GeomFromText($3, 4326), $4)`,
        [routeId, segName, wkt, req.file.buffer]
      );
    }

    res.json({ ok: true, id: routeId, slug: route.slug, name: route.name, segments: segments.length });
  } catch (err) {
    console.error("POST /routes/upload failed:", err);
    res.status(500).json({ ok: false, error: "upload-failed" });
  }
});

module.exports = router;
