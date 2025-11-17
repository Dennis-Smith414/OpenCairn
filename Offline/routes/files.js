// offline/routes/files.js
const express = require("express");
const router = express.Router();
const { all, get, run } = require("../db/queries");

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ------------------------------------------------------
// GET /api/files/routes
// -> Returns all offline routes + sync metadata + counts
// ------------------------------------------------------
router.get("/routes", async (req, res) => {
  try {
    const rows = await all(
      `
        SELECT
          r.*,
          (SELECT COUNT(*) FROM waypoints w WHERE w.route_id = r.id) AS waypoint_count,
          (SELECT COUNT(*) FROM comments c WHERE c.route_id = r.id) AS comment_count
        FROM routes r
        ORDER BY r.name ASC
      `
    );

    res.json({ ok: true, routes: rows });
  } catch (err) {
    console.error("[offline] GET /files/routes error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Failed to load offline routes" });
  }
});

// ------------------------------------------------------
// POST /api/files/routes/:id/resync
// -> Currently: just bumps last_synced_at for that route
// ------------------------------------------------------
router.post("/routes/:id/resync", async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) {
    return res.status(400).json({ ok: false, error: "Invalid route id" });
  }

  try {
    await run(
      `UPDATE routes
       SET last_synced_at = datetime('now')
       WHERE id = ?`,
      [id]
    );

    const route = await get(
      `
        SELECT
          r.*,
          (SELECT COUNT(*) FROM waypoints w WHERE w.route_id = r.id) AS waypoint_count,
          (SELECT COUNT(*) FROM comments c WHERE c.route_id = r.id) AS comment_count
        FROM routes r
        WHERE r.id = ?
      `,
      [id]
    );

    res.json({ ok: true, route });
  } catch (err) {
    console.error("[offline] POST /files/routes/:id/resync error:", err);
    res.status(500).json({ ok: false, error: "Failed to resync route" });
  }
});

module.exports = router;
