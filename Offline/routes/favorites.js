// offline/routes/favorites.js
const express = require("express");
const router = express.Router();
const { all, get, run } = require("../db/queries");
const authorize = require("../middleware/authorize");

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ===================================================================
// GET /favorites/routes
// → Get NON-DELETED favorite route IDs for current user (offline)
// Mounted as /api/favorites in index.js → /api/favorites/routes
// ===================================================================
router.get("/routes", authorize, async (req, res) => {
  try {
    const userId = toInt(req.user?.id);
    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, error: "Missing or invalid user id." });
    }

    const rows = await all(
      `
      SELECT route_id
        FROM route_favorites
       WHERE user_id = ?
         AND sync_status != 'deleted'
       ORDER BY created_at DESC
      `,
      [userId]
    );

    const route_ids = rows.map((r) => r.route_id);
    res.json({ ok: true, route_ids });
  } catch (err) {
    console.error("[offline] GET /favorites/routes error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

// ===================================================================
// POST /favorites/routes/:routeId
// → Mark a route as favorite for the current user (offline)
// ===================================================================
router.post("/routes/:routeId", authorize, async (req, res) => {
  try {
    const userId = toInt(req.user?.id);
    const routeId = toInt(req.params.routeId);

    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, error: "Missing or invalid user id." });
    }
    if (!routeId) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid route id." });
    }

    // Ensure route exists offline (just for sanity)
    const route = await get(
      `
      SELECT id
        FROM routes
       WHERE id = ?
      `,
      [routeId]
    );

    if (!route) {
      return res
        .status(404)
        .json({ ok: false, error: "Route not found." });
    }

    // Check if favorite already exists
    const existing = await get(
      `
      SELECT sync_status
        FROM route_favorites
       WHERE user_id = ?
         AND route_id = ?
      `,
      [userId, routeId]
    );

    if (!existing) {
      // brand new favorite, not yet synced
      await run(
        `
        INSERT INTO route_favorites (
          user_id,
          route_id,
          created_at,
          sync_status
        )
        VALUES (
          ?, ?, datetime('now'), 'new'
        )
        `,
        [userId, routeId]
      );
    } else if (existing.sync_status === "deleted") {
      // re-favoriting something we previously deleted → mark as dirty
      await run(
        `
        UPDATE route_favorites
           SET sync_status = 'dirty',
               created_at  = datetime('now')
         WHERE user_id = ?
           AND route_id = ?
        `,
        [userId, routeId]
      );
    } else {
      // already favorited (new/dirty/clean) → no-op
    }

    res.json({ ok: true, route_id: routeId });
  } catch (err) {
    console.error("[offline] POST /favorites/routes/:routeId error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

// ===================================================================
// DELETE /favorites/routes/:routeId
// → Remove a route from the current user's favorites (offline)
// ===================================================================
router.delete("/routes/:routeId", authorize, async (req, res) => {
  try {
    const userId = toInt(req.user?.id);
    const routeId = toInt(req.params.routeId);

    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, error: "Missing or invalid user id." });
    }
    if (!routeId) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid route id." });
    }

    const existing = await get(
      `
      SELECT sync_status
        FROM route_favorites
       WHERE user_id = ?
         AND route_id = ?
      `,
      [userId, routeId]
    );

    if (!existing) {
      // nothing to delete; not an error, just log and return ok
      console.warn(
        "[offline] DELETE /favorites/routes: nothing to delete",
        { userId, routeId }
      );
      return res.json({ ok: true, route_id: routeId });
    }

    if (existing.sync_status === "new") {
      // never synced → hard delete
      const result = await run(
        `
        DELETE FROM route_favorites
         WHERE user_id = ?
           AND route_id = ?
        `,
        [userId, routeId]
      );

      if (!result.changes) {
        return res
          .status(403)
          .json({ ok: false, error: "Not found or not permitted." });
      }
    } else {
      // synced → tombstone for pushOnline
      await run(
        `
        UPDATE route_favorites
           SET sync_status = 'deleted',
               created_at  = datetime('now')
         WHERE user_id = ?
           AND route_id = ?
        `,
        [userId, routeId]
      );
    }

    res.json({ ok: true, route_id: routeId });
  } catch (err) {
    console.error("[offline] DELETE /favorites/routes/:routeId error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

module.exports = router;
