const express = require("express");
const router = express.Router();
const db = require("../Postgres"); // Neon helper functions
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
       WHERE w.route_id = $1`,
      [route_id]
    );

    res.json({ ok: true, items: result });
  } catch (err) {
    console.error("GET /waypoints/route error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===================================================================
// POST /api/waypoints
// ===================================================================
router.post("/", authorize, async (req, res) => {
  try {
    const { route_id, name, description, lat, lon, type } = req.body;
    const user_id = req.user?.id || null; // Placeholder until auth context provides a user ID

    // Validate required fields
    if (!route_id || !name || lat == null || lon == null) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing required fields: route_id, name, lat, lon." });
    }

    const insertSql = `
      INSERT INTO waypoints (route_id, user_id, name, description, lat, lon, type, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      RETURNING *;
    `;

    const { rows } = await db.run(insertSql, [
      route_id,
      user_id,
      name,
      description || null,
      lat,
      lon,
      type || "generic",
    ]);

    console.log("Waypoint created:", rows[0]);
    res.json({ ok: true, waypoint: rows[0] });
  } catch (err) {
    console.error("POST /waypoints error:", err);
    res.status(500).json({ ok: false, error: err.message });
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

    // Only allow the owner to delete
    const { rows } = await db.run(
      `DELETE FROM waypoints
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (rows.length === 0) {
      // Either waypoint doesn't exist, or the user isn't the owner
      return res.status(403).json({ ok: false, error: "Not found or not permitted." });
    }

    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error("DELETE /waypoints error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
