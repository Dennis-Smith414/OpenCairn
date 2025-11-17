// offline/routes/routes.js
const express = require("express");
const router = express.Router();
const { all, get, run } = require("../db/queries");

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---------- GET /routes  (list with search + pagination)
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 100);
    const offset = Math.max(parseInt(req.query.offset ?? "0", 10), 0);
    const q = (req.query.q ?? "").trim();

    const params = [];
    let where = "";

    if (q) {
      // case-insensitive search for SQLite
      params.push(`%${q.toLowerCase()}%`);
      where = "WHERE LOWER(r.name) LIKE ?";
    }

    params.push(limit, offset);

    // Use correlated subselects instead of LATERAL in SQLite
    const sql = `
      SELECT
        r.id,
        r.slug,
        r.name,
        r.region,
        r.username,
        r.rating,
        r.created_at,
        r.updated_at,
        COALESCE(
          (SELECT COUNT(*) FROM waypoints w WHERE w.route_id = r.id),
          0
        ) AS waypoint_count,
        COALESCE(
          (SELECT COUNT(*) FROM gpx g WHERE g.route_id = r.id),
          0
        ) AS gpx_count
      FROM routes r
      ${where}
      ORDER BY r.updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const items = await all(sql, params);
    res.json({ ok: true, items, nextOffset: offset + items.length });
  } catch (e) {
    console.error("[offline] GET /routes failed:", e);
    res.status(500).json({ ok: false, error: "list-failed" });
  }
});

// ---------- GET /routes/:id  (metadata; include_gpx=true -> add GeoJSON)
router.get("/:id", async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: "bad-route-id", got: req.params.id });
    }

    const includeGpx =
      String(req.query.include_gpx ?? "false").toLowerCase() === "true";

    const route = await get(
      `
      SELECT
        id,
        slug,
        name,
        region,
        user_id,
        username,
        rating,
        created_at,
        updated_at
      FROM routes
      WHERE id = ?
      `,
      [id]
    );

    if (!route) {
      return res.status(404).json({ ok: false, error: "not-found" });
    }

    if (!includeGpx) {
      return res.json({ ok: true, route });
    }

    const rows = await all(
      `
      SELECT geometry, name
      FROM gpx
      WHERE route_id = ?
      ORDER BY id ASC
      `,
      [id]
    );

    const features = rows.map((row, idx) => {
      let geometry = null;
      try {
        geometry = JSON.parse(row.geometry);
      } catch {
        // if geometry isn't valid JSON, leave it null
        geometry = null;
      }

      return {
        type: "Feature",
        properties: {
          route_id: id,
          segment: idx,
          name: row.name ?? null,
        },
        geometry,
      };
    });

    return res.json({
      ok: true,
      route,
      gpx: { type: "FeatureCollection", features },
    });
  } catch (e) {
    console.error("[offline] GET /routes/:id failed:", e);
    res.status(500).json({ ok: false, error: "read-failed" });
  }
});

// ---------- POST /routes  (create; offline)
// Expect body: { user_id, username, name, region?, slug? }
router.post("/", async (req, res) => {
  try {
    const userId = toInt(req.body.user_id);
    const username = (req.body.username ?? "").trim();
    const name = (req.body.name ?? "").trim();
    const region = (req.body.region ?? null) || null;

    if (!userId || !username || !name) {
      return res.status(400).json({
        ok: false,
        error: "user_id, username, and name are required.",
      });
    }

    // generate a simple slug if not provided
    const slug =
      (req.body.slug ??
        "route-" +
          Math.random().toString(36).slice(2, 6) +
          "-" +
          Date.now().toString(36)
      ).toLowerCase();

    // Insert route (no RETURNING in SQLite; use lastID)
    let insertedId;
    try {
      const result = await run(
        `
        INSERT INTO routes (id, user_id, username, slug, name, region)
        VALUES (
          NULL,      -- let SQLite assign id
          ?, ?, ?, ?, ?
        )
        `,
        [userId, username, slug, name, region]
      );
      insertedId = result.lastID;
    } catch (err) {
      // Likely slug uniqueness violation
      console.error("[offline] POST /routes insert error:", err.message);
      return res.status(409).json({ ok: false, error: "slug-conflict" });
    }

    const route = await get(
      `
      SELECT
        id,
        slug,
        name,
        region,
        user_id,
        username,
        rating,
        created_at,
        updated_at
      FROM routes
      WHERE id = ?
      `,
      [insertedId]
    );

    res.status(201).json({ ok: true, route });
  } catch (e) {
    console.error("[offline] POST /routes failed:", e);
    res.status(500).json({ ok: false, error: "create-failed" });
  }
});

// ---------- PATCH /routes/:id  (update; owner only offline)
// Expect body: { user_id, name?, region? }
router.patch("/:id", async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const userId = toInt(req.body.user_id);
    const name = req.body.name ?? null;
    const region = req.body.region ?? null;

    if (!id) {
      return res.status(400).json({ ok: false, error: "bad-route-id" });
    }
    if (!userId) {
      return res.status(400).json({ ok: false, error: "Missing or invalid user id" });
    }

    const owner = await get(
      `SELECT user_id FROM routes WHERE id = ?`,
      [id]
    );
    if (!owner) {
      return res.status(404).json({ ok: false, error: "not-found" });
    }
    if (Number(owner.user_id) !== Number(userId)) {
      return res.status(403).json({ ok: false, error: "not-owner" });
    }

    await run(
      `
      UPDATE routes
         SET name      = COALESCE(?, name),
             region    = COALESCE(?, region),
             updated_at = datetime('now')
       WHERE id = ?
      `,
      [name, region, id]
    );

    const route = await get(
      `
      SELECT
        id,
        slug,
        name,
        region,
        user_id,
        username,
        rating,
        created_at,
        updated_at
      FROM routes
      WHERE id = ?
      `,
      [id]
    );

    res.json({ ok: true, route });
  } catch (e) {
    console.error("[offline] PATCH /routes/:id failed:", e);
    res.status(500).json({ ok: false, error: "update-failed" });
  }
});

// ---------- DELETE /routes/:id  (delete; owner only offline)
// Expect body: { user_id }
router.delete("/:id", async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const userId = toInt(req.body.user_id);

    if (!id) {
      return res.status(400).json({ ok: false, error: "bad-route-id" });
    }
    if (!userId) {
      return res.status(400).json({ ok: false, error: "Missing or invalid user id" });
    }

    const owner = await get(
      `SELECT user_id FROM routes WHERE id = ?`,
      [id]
    );
    if (!owner) {
      return res.status(404).json({ ok: false, error: "not-found" });
    }
    if (Number(owner.user_id) !== Number(userId)) {
      return res.status(403).json({ ok: false, error: "not-owner" });
    }

    await run(`DELETE FROM routes WHERE id = ?`, [id]); // cascades to waypoints/gpx via FKs
    res.json({ ok: true, deleted_id: id });
  } catch (e) {
    console.error("[offline] DELETE /routes/:id failed:", e);
    res.status(500).json({ ok: false, error: "delete-failed" });
  }
});

// ---------- GET /routes/:id/gpx  (FeatureCollection for that route)
router.get("/:id/gpx", async (req, res) => {
  try {
    const rawId = String(req.params.id);
    const id = toInt(rawId);
    if (!id) {
      return res.status(400).json({ ok: false, error: "bad-route-id", got: rawId });
    }

    const rows = await all(
      `
      SELECT geometry, name
      FROM gpx
      WHERE route_id = ?
      ORDER BY id ASC
      `,
      [id]
    );

    if (!rows.length) {
      return res.json({
        ok: true,
        geojson: { type: "FeatureCollection", features: [] },
      });
    }

    const features = rows.map((row, idx) => {
      let geometry = null;
      try {
        geometry = JSON.parse(row.geometry);
      } catch {
        geometry = null;
      }

      return {
        type: "Feature",
        properties: {
          route_id: id,
          segment: idx + 1,
          name: row.name ?? null,
        },
        geometry,
      };
    });

    res.json({ ok: true, geojson: { type: "FeatureCollection", features } });
  } catch (e) {
    console.error("[offline] GET /routes/:id/gpx failed:", e);
    res.status(500).json({ ok: false, error: "geojson-failed" });
  }
});

module.exports = router;
