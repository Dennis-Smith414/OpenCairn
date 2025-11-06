// Server/routes/waypoints.js
const express = require("express");
const router = express.Router();
const db = require("../Postgres");
const authorize = require("../middleware/authorize");

// ===================================================================
// GET /api/waypoints/route/:route_id
// → Fetch all waypoints for a given route
// ===================================================================
router.get("/route/:route_id", async (req, res) => {
  try {
    const { route_id } = req.params;
    if (!route_id) {
      return res.status(400).json({ ok: false, error: "Missing route_id." });
    }

    const result = await db.all(
      `SELECT w.*, u.username
         FROM waypoints w
         JOIN users u ON w.user_id = u.id
        WHERE w.route_id = $1
        ORDER BY w.created_at DESC`,
      [route_id]
    );

    res.json({ ok: true, items: result });
  } catch (err) {
    console.error("GET /waypoints/route error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===================================================================
// GET /api/waypoints/:id
// → Fetch a single waypoint by id
// ===================================================================
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Missing waypoint id." });

    const waypoint = await db.get(
      `SELECT w.*, u.username, r.name AS route_name
         FROM waypoints w
         JOIN users u ON w.user_id = u.id
         JOIN routes r ON w.route_id = r.id
        WHERE w.id = $1`,
      [id]
    );
    if (!waypoint) return res.status(404).json({ ok: false, error: "Waypoint not found." });

    res.json({ ok: true, waypoint });
  } catch (err) {
    console.error("GET /waypoints/:id error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===================================================================
// POST /api/waypoints  (create)
// ===================================================================
router.post("/", authorize, async (req, res) => {
  try {
    const { route_id, name, description, lat, lon, type } = req.body;
    const user_id = req.user?.id;

    if (!route_id || !name || lat == null || lon == null) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing required fields: route_id, name, lat, lon." });
    }

    const insertSql = `
      INSERT INTO waypoints (route_id, user_id, name, description, lat, lon, type, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
      RETURNING *;
    `;
    const { rows } = await db.run(insertSql, [
      route_id,
      user_id,
      String(name).trim(),
      description || null,
      Number(lat),
      Number(lon),
      type || "generic",
    ]);

    res.json({ ok: true, waypoint: rows[0] });
  } catch (err) {
    console.error("POST /waypoints error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===================================================================
// PATCH /api/waypoints/:id  (owner-only, partial update)
// ===================================================================
router.patch("/:id", authorize, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.user?.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid waypoint id." });
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, error: "Unauthorized." });
    }

    // Allowed fields (include only columns that exist in your schema)
    let { route_id, name, description, lat, lon, type } = req.body || {};
    if (name != null) name = String(name).trim();
    if (description !== undefined) description = description === "" ? null : String(description);
    if (route_id != null) route_id = Number(route_id);
    if (lat != null) lat = Number(lat);
    if (lon != null) lon = Number(lon);
    if (type != null) type = String(type);

    // Build dynamic SET clause
    const sets = [];
    const params = [];
    let p = 1;

    const add = (sqlFragment, value) => {
      sets.push(sqlFragment.replace("?", `$${p++}`));
      params.push(value);
    };

    if (route_id != null) add("route_id = ?", route_id);
    if (name != null) add("name = ?", name);
    if (description !== undefined) add("description = ?", description);
    if (lat != null) add("lat = ?", lat);
    if (lon != null) add("lon = ?", lon);
    if (type != null) add("type = ?", type);

    if (sets.length === 0) {
      return res.status(400).json({ ok: false, error: "No fields to update." });
    }

    // Always bump updated_at using SQL NOW() (no bound param)
    sets.push("updated_at = NOW()");

    const sql = `
      UPDATE waypoints
         SET ${sets.join(", ")}
       WHERE id = $${p++} AND user_id = $${p++}
       RETURNING *;
    `;
    params.push(id, userId);

    const { rowCount, rows } = await db.run(sql, params);
    if (rowCount === 0) {
      return res.status(403).json({ ok: false, error: "Not found or not permitted." });
    }

    res.json({ ok: true, waypoint: rows[0] });
  } catch (err) {
    console.error("PATCH /waypoints/:id error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});


// ===================================================================
// DELETE /api/waypoints/:id  (owner-only)
// ===================================================================
router.delete("/:id", authorize, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!id) return res.status(400).json({ ok: false, error: "Missing waypoint id." });
    if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized." });

    const { rows } = await db.run(
      `DELETE FROM waypoints
        WHERE id = $1 AND user_id = $2
        RETURNING id`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(403).json({ ok: false, error: "Not found or not permitted." });
    }

    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error("DELETE /waypoints error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
