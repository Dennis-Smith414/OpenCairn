// Server/routes/favorites.js
const express = require("express");
const router = express.Router();
const db = require("../Postgres");
const authorize = require("../middleware/authorize");

/**
 * GET /api/favorites/routes
 * → Get the current user's favorite route IDs.
 */
router.get("/routes", authorize, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized." });
    }

    const rows = await db.all(
      `
        SELECT route_id
          FROM route_favorites
         WHERE user_id = $1
         ORDER BY created_at DESC
      `,
      [userId]
    );

    const route_ids = rows.map((r) => r.route_id);
    res.json({ ok: true, route_ids });
  } catch (err) {
    console.error("GET /favorites/routes error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

/**
 * POST /api/favorites/routes/:routeId
 * → Mark a route as favorite for the current user.
 */
router.post("/routes/:routeId", authorize, async (req, res) => {
  try {
    const userId = req.user?.id;
    const routeId = Number(req.params.routeId);

    if (!userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized." });
    }
    if (!Number.isInteger(routeId) || routeId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid route id." });
    }

    // Optional: ensure route exists (cheap safety check)
    const route = await db.get(`SELECT id FROM routes WHERE id = $1`, [routeId]);
    if (!route) {
      return res.status(404).json({ ok: false, error: "Route not found." });
    }

    await db.run(
      `
        INSERT INTO route_favorites (user_id, route_id, created_at)
        VALUES ($1, $2, now())
        ON CONFLICT (user_id, route_id) DO NOTHING
      `,
      [userId, routeId]
    );

    res.json({ ok: true, route_id: routeId });
  } catch (err) {
    console.error("POST /favorites/routes/:routeId error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

/**
 * DELETE /api/favorites/routes/:routeId
 * → Remove a route from the current user's favorites.
 */
router.delete("/routes/:routeId", authorize, async (req, res) => {
  try {
    const userId = req.user?.id;
    const routeId = Number(req.params.routeId);

    if (!userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized." });
    }
    if (!Number.isInteger(routeId) || routeId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid route id." });
    }

    const { rowCount } = await db.run(
      `
        DELETE FROM route_favorites
         WHERE user_id = $1 AND route_id = $2
      `,
      [userId, routeId]
    );

    if (rowCount === 0) {
      // Not strictly an error, but helps debugging
      console.warn(
        "DELETE /favorites/routes: nothing deleted for",
        { userId, routeId }
      );
    }

    res.json({ ok: true, route_id: routeId });
  } catch (err) {
    console.error("DELETE /favorites/routes/:routeId error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

// -----------------------------------------------------------
// GET /api/favorites/routes/:route_id
// → returns whether CURRENT user has favorited this route
// -----------------------------------------------------------
router.get("/routes/:route_id", authorize, async (req, res) => {
  try {
    const userId = req.user.id;
    const routeId = Number(req.params.route_id);

    if (!routeId || !Number.isInteger(routeId)) {
      return res.status(400).json({ ok: false, error: "Invalid route id." });
    }

    const row = await db.get(
      `
        SELECT 1
          FROM route_favorites
         WHERE user_id = $1
           AND route_id = $2
      `,
      [userId, routeId]
    );

    const favorite = !!row;

    res.json({ ok: true, favorite });
  } catch (err) {
    console.error("GET /favorites/routes/:route_id error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

module.exports = router;

module.exports = router;
