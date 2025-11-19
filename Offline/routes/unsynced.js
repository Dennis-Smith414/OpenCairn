// offline/routes/unsynced.js
const express = require("express");
const router = express.Router();
const { all, run } = require("../db/queries");

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * GET /api/sync/route/:id/changes
 *
 * Returns all non-clean changes for a single route:
 *  - waypoints            (from waypoints)
 *  - comments             (from comments)
 *  - ratings:
 *      - waypoint         (from waypoint_ratings)
 *      - route            (from route_ratings)
 *      - comment          (from comment_ratings)
 *  - favorites:
 *      - route            (from route_favorites)
 *
 * Shape matches OfflineChangeBundle in src/lib/syncOnline.ts.
 */
router.get("/route/:id/changes", async (req, res) => {
  const routeId = toInt(req.params.id);
  if (!routeId) {
    return res
      .status(400)
      .json({ ok: false, error: "Invalid route id" });
  }

  try {
    // Waypoints for this route that are dirty/new/deleted
    const waypoints = await all(
      `SELECT *
       FROM waypoints
       WHERE route_id = ?
         AND sync_status != 'clean'`,
      [routeId]
    );

    // Route-level comments (comments.route_id) that are dirty/new/deleted
    const comments = await all(
      `SELECT *
       FROM comments
       WHERE route_id = ?
         AND sync_status != 'clean'`,
      [routeId]
    );

    // Waypoint ratings for waypoints belonging to this route
    const waypointRatings = await all(
      `
        SELECT wr.*
        FROM waypoint_ratings wr
        JOIN waypoints w ON w.id = wr.waypoint_id
        WHERE w.route_id = ?
          AND wr.sync_status != 'clean'
      `,
      [routeId]
    );

    // Route ratings for this route
    const routeRatings = await all(
      `SELECT *
       FROM route_ratings
       WHERE route_id = ?
         AND sync_status != 'clean'`,
      [routeId]
    );

    // Comment ratings for comments on this route
    const commentRatings = await all(
      `
        SELECT cr.*
        FROM comment_ratings cr
        JOIN comments c ON c.id = cr.comment_id
        WHERE c.route_id = ?
          AND cr.sync_status != 'clean'
      `,
      [routeId]
    );

    // Route favorites for this route
    const routeFavorites = await all(
      `
        SELECT *
          FROM route_favorites
         WHERE route_id = ?
           AND sync_status != 'clean'
      `,
      [routeId]
    );

    res.json({
      ok: true,
      route_id: routeId,
      waypoints,
      comments,
      ratings: {
        waypoint: waypointRatings,
        route: routeRatings,
        comment: commentRatings,
      },
      favorites: {
        route: routeFavorites,
      },
    });
  } catch (err) {
    console.error("[offline] GET /api/sync/route/:id/changes error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Failed to load unsynced changes" });
  }
});

/**
 * POST /api/sync/route/:id/mark-clean
 *
 * Called AFTER a successful upload of this route's changes.
 * Responsibilities:
 *  - For this route:
 *      • waypoints / comments / ratings / favorites:
 *          - delete rows with sync_status='deleted'
 *          - set sync_status='clean' for rows with 'new'/'dirty'
 *      • routes:
 *          - set sync_status='clean'
 *          - bump last_synced_at = datetime('now')
 */
router.post("/route/:id/mark-clean", async (req, res) => {
  const routeId = toInt(req.params.id);
  if (!routeId) {
    return res
      .status(400)
      .json({ ok: false, error: "Invalid route id" });
  }

  try {
    // --- WAYPOINTS (owned by this route) ---
    // Delete waypoint tombstones
    await run(
      `
      DELETE FROM waypoints
      WHERE route_id = ?
        AND sync_status = 'deleted'
      `,
      [routeId]
    );
    // Mark remaining new/dirty waypoints as clean
    await run(
      `
      UPDATE waypoints
         SET sync_status = 'clean'
       WHERE route_id = ?
         AND sync_status IN ('new','dirty')
      `,
      [routeId]
    );

    // --- ROUTE-LEVEL COMMENTS (comments.route_id) ---
    await run(
      `
      DELETE FROM comments
       WHERE route_id = ?
         AND sync_status = 'deleted'
      `,
      [routeId]
    );
    await run(
      `
      UPDATE comments
         SET sync_status = 'clean'
       WHERE route_id = ?
         AND sync_status IN ('new','dirty')
      `,
      [routeId]
    );

    // --- WAYPOINT RATINGS (ratings for waypoints on this route) ---
    // delete tombstones
    await run(
      `
      DELETE FROM waypoint_ratings
       WHERE waypoint_id IN (
             SELECT id FROM waypoints WHERE route_id = ?
           )
         AND sync_status = 'deleted'
      `,
      [routeId]
    );
    // mark new/dirty as clean
    await run(
      `
      UPDATE waypoint_ratings
         SET sync_status = 'clean'
       WHERE waypoint_id IN (
             SELECT id FROM waypoints WHERE route_id = ?
           )
         AND sync_status IN ('new','dirty')
      `,
      [routeId]
    );

    // --- ROUTE RATINGS (ratings for this route) ---
    await run(
      `
      DELETE FROM route_ratings
       WHERE route_id = ?
         AND sync_status = 'deleted'
      `,
      [routeId]
    );
    await run(
      `
      UPDATE route_ratings
         SET sync_status = 'clean'
       WHERE route_id = ?
         AND sync_status IN ('new','dirty')
      `,
      [routeId]
    );

    // --- COMMENT RATINGS (ratings for comments on this route) ---
    await run(
      `
      DELETE FROM comment_ratings
       WHERE comment_id IN (
             SELECT id FROM comments WHERE route_id = ?
           )
         AND sync_status = 'deleted'
      `,
      [routeId]
    );
    await run(
      `
      UPDATE comment_ratings
         SET sync_status = 'clean'
       WHERE comment_id IN (
             SELECT id FROM comments WHERE route_id = ?
           )
         AND sync_status IN ('new','dirty')
      `,
      [routeId]
    );

    // --- ROUTE FAVORITES (favorites for this route) ---
    await run(
      `
      DELETE FROM route_favorites
       WHERE route_id = ?
         AND sync_status = 'deleted'
      `,
      [routeId]
    );
    await run(
      `
      UPDATE route_favorites
         SET sync_status = 'clean'
       WHERE route_id = ?
         AND sync_status IN ('new','dirty')
      `,
      [routeId]
    );

    // --- ROUTE METADATA (offline routes table) ---
    await run(
      `
      UPDATE routes
         SET sync_status   = 'clean',
             last_synced_at = datetime('now')
       WHERE id = ?
      `,
      [routeId]
    );

    res.json({ ok: true, route_id: routeId });
  } catch (err) {
    console.error("[offline] POST /api/sync/route/:id/mark-clean error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Failed to mark route clean" });
  }
});

module.exports = router;
