// Server/routes/routes.js
const express = require("express");
const router = express.Router();
const db = require("../Postgres");
const authorize = require("../middleware/authorize");

// ---------- GET /api/routes  (list with search + pagination)
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 100);
    const offset = Math.max(parseInt(req.query.offset ?? "0", 10), 0);
    const q = (req.query.q ?? "").trim();

    const params = [];
    let where = "";
    if (q) {
      params.push(`%${q}%`);
      where = `WHERE r.name ILIKE $${params.length}`;
    }

    // counts are handy for UI
    params.push(limit, offset);
    const sql = `
      SELECT
        r.id, r.slug, r.name, r.region, r.created_at, r.updated_at,
        COALESCE(wp.cnt, 0) AS waypoint_count,
        COALESCE(gx.cnt, 0) AS gpx_count
      FROM routes r
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt FROM waypoints w WHERE w.route_id = r.id
      ) wp ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt FROM gpx g WHERE g.route_id = r.id
      ) gx ON true
      ${where}
      ORDER BY r.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const items = await db.all(sql, params);
    res.json({ ok: true, items, nextOffset: offset + items.length });
  } catch (e) {
    console.error("GET /routes failed:", e);
    res.status(500).json({ ok: false, error: "list-failed" });
  }
});

// ---------- GET /api/routes/:id  (metadata; include_gpx=true -> add GeoJSON)
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const includeGpx = String(req.query.include_gpx ?? "false").toLowerCase() === "true";

    const route = await db.get(
      `SELECT id, slug, name, region, user_id, created_at, updated_at
         FROM routes
        WHERE id = $1`,
      [id]
    );
    if (!route) return res.status(404).json({ ok: false, error: "not-found" });

    if (!includeGpx) return res.json({ ok: true, route });

    const geoms = await db.all(
      `SELECT ST_AsGeoJSON(geometry)::json AS geometry, name
         FROM gpx
        WHERE route_id = $1
        ORDER BY id ASC`,
      [id]
    );

    const features = geoms.map((row, idx) => ({
      type: "Feature",
      properties: { route_id: id, segment: idx, name: row.name ?? null },
      geometry: row.geometry,
    }));

    return res.json({
      ok: true,
      route,
      gpx: { type: "FeatureCollection", features },
    });
  } catch (e) {
    console.error("GET /routes/:id failed:", e);
    res.status(500).json({ ok: false, error: "read-failed" });
  }
});

// ---------- POST /api/routes  (create; requires auth)
router.post("/", authorize, async (req, res) => {
  try {
    const userId = req.user.id;
    const name = (req.body.name ?? "").trim();
    const region = (req.body.region ?? null) || null;
    if (!name) return res.status(400).json({ ok: false, error: "name-required" });

    // generate a simple slug if not provided
    const slug =
      (req.body.slug ??
        "route-" +
          Math.random().toString(36).slice(2, 6) +
          "-" +
          Date.now().toString(36)).toLowerCase();

    const row = await db.get(
      `INSERT INTO routes (user_id, slug, name, region)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id, slug, name, region, user_id, created_at, updated_at`,
      [userId, slug, name, region]
    );

    if (!row) return res.status(409).json({ ok: false, error: "slug-conflict" });
    res.status(201).json({ ok: true, route: row });
  } catch (e) {
    console.error("POST /routes failed:", e);
    res.status(500).json({ ok: false, error: "create-failed" });
  }
});

// ---------- PATCH /api/routes/:id  (update; owner only)
router.patch("/:id", authorize, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user.id;
    const name = (req.body.name ?? null);
    const region = (req.body.region ?? null);

    const owner = await db.get(`SELECT user_id FROM routes WHERE id = $1`, [id]);
    if (!owner) return res.status(404).json({ ok: false, error: "not-found" });
    if (Number(owner.user_id) !== Number(userId))
      return res.status(403).json({ ok: false, error: "not-owner" });

    const row = await db.get(
      `UPDATE routes
          SET name = COALESCE($1, name),
              region = COALESCE($2, region),
              updated_at = NOW()
        WHERE id = $3
        RETURNING id, slug, name, region, user_id, updated_at`,
      [name, region, id]
    );

    res.json({ ok: true, route: row });
  } catch (e) {
    console.error("PATCH /routes/:id failed:", e);
    res.status(500).json({ ok: false, error: "update-failed" });
  }
});

// ---------- DELETE /api/routes/:id  (delete; owner only)
router.delete("/:id", authorize, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user.id;

    const owner = await db.get(`SELECT user_id FROM routes WHERE id = $1`, [id]);
    if (!owner) return res.status(404).json({ ok: false, error: "not-found" });
    if (Number(owner.user_id) !== Number(userId))
      return res.status(403).json({ ok: false, error: "not-owner" });

    await db.run(`DELETE FROM routes WHERE id = $1`, [id]); // cascades to waypoints/gpx
    res.json({ ok: true, deleted_id: id });
  } catch (e) {
    console.error("DELETE /routes/:id failed:", e);
    res.status(500).json({ ok: false, error: "delete-failed" });
  }
});

/// ---------- GET /api/routes/:id/gpx  (FeatureCollection for that route)
  router.get("/:id/gpx", async (req, res) => {
    try {
     const rawId = String(req.params.id);
     const id = Number(rawId);
     if (!Number.isInteger(id)) {
       return res.status(400).json({ ok: false, error: "bad-route-id", got: rawId });
     }

      const rows = await db.all(
        `SELECT ST_AsGeoJSON(geometry)::json AS geometry, name
           FROM gpx
          WHERE route_id = $1
          ORDER BY id ASC`,
        [id]
      );
     if (!rows.length) {
       // Return an empty FC so the client can handle "no geometry yet"
       return res.json({ ok: true, geojson: { type: "FeatureCollection", features: [] } });
     }

      const features = rows.map((row, idx) => ({
        type: "Feature",
       properties: { route_id: id, segment: idx + 1, name: row.name ?? null },
        geometry: row.geometry,
      }));
      res.json({ ok: true, geojson: { type: "FeatureCollection", features } });
    } catch (e) {
      console.error("GET /routes/:id/gpx failed:", e);
      res.status(500).json({ ok: false, error: "geojson-failed" });
    }
  });


module.exports = router;
