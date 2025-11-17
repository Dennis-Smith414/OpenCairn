// offline/routes/waypoints.js
const express = require("express");
const router = express.Router();
const { all, get, run } = require("../db/queries");
const authorize = require("../middleware/authorize");

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ===================================================================
// GET /waypoints/route/:route_id
// → Fetch all NON-DELETED waypoints for a given route
// ===================================================================
router.get("/route/:route_id", async (req, res) => {
  try {
    const routeId = toInt(req.params.route_id);
    if (!routeId) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing or invalid route_id." });
    }

    const result = await all(
      `
      SELECT
        w.*,
        r.name AS route_name
      FROM waypoints w
      LEFT JOIN routes r ON r.id = w.route_id
      WHERE w.route_id = ?
        AND w.sync_status != 'deleted'
      ORDER BY w.created_at DESC
      `,
      [routeId]
    );

    res.json({ ok: true, items: result });
  } catch (err) {
    console.error("[offline] GET /waypoints/route error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

// ===================================================================
// GET /waypoints/:id
// → Fetch a single NON-DELETED waypoint by id
// ===================================================================
router.get("/:id", async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing or invalid waypoint id." });
    }

    const waypoint = await get(
      `
      SELECT
        w.*,
        r.name AS route_name
      FROM waypoints w
      LEFT JOIN routes r ON r.id = w.route_id
      WHERE w.id = ?
        AND w.sync_status != 'deleted'
      `,
      [id]
    );

    if (!waypoint) {
      return res
        .status(404)
        .json({ ok: false, error: "Waypoint not found." });
    }

    res.json({ ok: true, waypoint });
  } catch (err) {
    console.error("[offline] GET /waypoints/:id error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

// ===================================================================
// POST /waypoints  (create, offline)
// Expect body: { route_id, name, description?, lat, lon, type?, username? }
// user_id comes from JWT
// ===================================================================
router.post("/", authorize, async (req, res) => {
  try {
    const route_id = toInt(req.body.route_id);
    const name = (req.body.name ?? "").trim();
    const description =
      req.body.description === undefined
        ? null
        : (req.body.description ?? "").toString() || null;
    const lat = req.body.lat != null ? Number(req.body.lat) : null;
    const lon = req.body.lon != null ? Number(req.body.lon) : null;
    const type = (req.body.type ?? "generic").toString();

    const user_id = toInt(req.user?.id);
    const username =
      (req.user?.username ?? req.body.username ?? "").trim();

    if (!route_id || !name || lat == null || lon == null) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: route_id, name, lat, lon.",
      });
    }
    if (!user_id) {
      return res.status(401).json({
        ok: false,
        error: "Missing or invalid user id (JWT).",
      });
    }

    const result = await run(
      `
      INSERT INTO waypoints (
        id,
        route_id,
        user_id,
        username,
        name,
        description,
        lat,
        lon,
        type,
        created_at,
        updated_at,
        sync_status
      )
      VALUES (
        NULL,          -- let SQLite assign id
        ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'new'
      )
      `,
      [route_id, user_id, username || "UnknownUser", name, description, lat, lon, type]
    );

    const insertedId = result.lastID;

    const waypoint = await get(
      `
      SELECT
        w.*,
        r.name AS route_name
      FROM waypoints w
      LEFT JOIN routes r ON r.id = w.route_id
      WHERE w.id = ?
      `,
      [insertedId]
    );

    res.json({ ok: true, waypoint });
  } catch (err) {
    console.error("[offline] POST /waypoints error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

// ===================================================================
// PATCH /waypoints/:id  (owner-only, partial update, offline)
// Expect body: { route_id?, name?, description?, lat?, lon?, type? }
// user_id comes from JWT
// ===================================================================
router.patch("/:id", authorize, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const userId = toInt(req.user?.id);

    if (!id) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid waypoint id." });
    }
    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, error: "Missing or invalid user id." });
    }

    // Allowed fields
    let { route_id, name, description, lat, lon, type } = req.body || {};

    if (route_id != null) route_id = toInt(route_id);
    if (name != null) name = String(name).trim();
    if (description !== undefined) {
      description = description === "" ? null : String(description);
    }
    if (lat != null) lat = Number(lat);
    if (lon != null) lon = Number(lon);
    if (type != null) type = String(type);

    const sets = [];
    const params = [];

    const add = (fragment, value) => {
      sets.push(fragment);
      params.push(value);
    };

    if (route_id != null) add("route_id = ?", route_id);
    if (name != null) add("name = ?", name);
    if (description !== undefined) add("description = ?", description);
    if (lat != null) add("lat = ?", lat);
    if (lon != null) add("lon = ?", lon);
    if (type != null) add("type = ?", type);

    if (sets.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "No fields to update." });
    }

    // Always bump updated_at
    sets.push("updated_at = datetime('now')");
    // Mark as dirty unless it was still 'new'
    sets.push(
      `sync_status = CASE
         WHEN sync_status = 'new' THEN 'new'
         ELSE 'dirty'
       END`
    );

    const sql = `
      UPDATE waypoints
         SET ${sets.join(", ")}
       WHERE id = ?
         AND user_id = ?
    `;
    params.push(id, userId);

    const result = await run(sql, params);

    if (!result.changes) {
      return res
        .status(403)
        .json({ ok: false, error: "Not found or not permitted." });
    }

    const waypoint = await get(
      `
      SELECT
        w.*,
        r.name AS route_name
      FROM waypoints w
      LEFT JOIN routes r ON r.id = w.route_id
      WHERE w.id = ?
      `,
      [id]
    );

    res.json({ ok: true, waypoint });
  } catch (err) {
    console.error("[offline] PATCH /waypoints/:id error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

// ===================================================================
// DELETE /waypoints/:id  (owner-only, offline)
// user id comes from JWT
// ===================================================================
router.delete("/:id", authorize, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const userId = toInt(req.user?.id);

    if (!id) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing or invalid waypoint id." });
    }
    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, error: "Missing or invalid user id." });
    }

    // Fetch current sync_status to decide between hard delete vs tombstone
    const existing = await get(
      `
      SELECT sync_status
      FROM waypoints
      WHERE id = ?
        AND user_id = ?
      `,
      [id, userId]
    );

    if (!existing) {
      return res
        .status(403)
        .json({ ok: false, error: "Not found or not permitted." });
    }

    if (existing.sync_status === "new") {
      // Never synced → hard delete, no need to inform remote
      const result = await run(
        `
        DELETE FROM waypoints
         WHERE id = ?
           AND user_id = ?
        `,
        [id, userId]
      );

      if (!result.changes) {
        return res
          .status(403)
          .json({ ok: false, error: "Not found or not permitted." });
      }
    } else {
      // Already synced → tombstone for sync
      await run(
        `
        UPDATE waypoints
           SET sync_status = 'deleted',
               updated_at  = datetime('now')
         WHERE id = ?
           AND user_id = ?
        `,
        [id, userId]
      );
    }

    res.json({ ok: true, id });
  } catch (err) {
    console.error("[offline] DELETE /waypoints error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

module.exports = router;
