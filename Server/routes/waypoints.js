const express = require("express");
const router = express.Router();
const db = require("../Postgres"); // Neon helper functions
// const authorize = require("../middleware/authorize"); //enable later

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
      `SELECT id, route_id, user_id, name, description, lat, lon, type, created_at
       FROM waypoints
       WHERE route_id = $1
       ORDER BY created_at ASC`,
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
// → Create a new waypoint (TEMPORARY: no auth)
// ===================================================================
// TODO: add authorize middleware once JWT auth is working
router.post("/", async (req, res) => {
  try {
    const { route_id, name, description, lat, lon, type } = req.body;
    const user_id = 1; // Placeholder until auth context provides a user ID

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

module.exports = router;
