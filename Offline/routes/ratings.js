// offline/routes/ratings.js
const express = require("express");
const router = express.Router();
const { all, get, run } = require("../db/queries");

// Helper: safely coerce numbers
const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// =======================
// GET Waypoint Rating
// GET /ratings/waypoint/:id?user_id=123
// =======================
router.get("/waypoint/:id", async (req, res) => {
  const waypointId = toInt(req.params.id);
  const userId = toInt(req.query.user_id); // optional

  try {
    if (!waypointId) {
      return res.status(400).json({ ok: false, error: "Missing or invalid waypoint id" });
    }

    const totalRow = await get(
      `SELECT COALESCE(SUM(val), 0) AS total
         FROM waypoint_ratings
        WHERE waypoint_id = ?`,
      [waypointId]
    );
    const total = totalRow?.total ?? 0;

    let user_rating = null;
    if (userId) {
      const userRow = await get(
        `SELECT val
           FROM waypoint_ratings
          WHERE waypoint_id = ? AND user_id = ?`,
        [waypointId, userId]
      );
      user_rating = userRow?.val ?? null;
    }

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[offline GET waypoint rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch rating" });
  }
});

// =======================
// POST Waypoint Rating
// POST /ratings/waypoint/:id
// body: { user_id, val } where val ∈ {1, -1}
// =======================
router.post("/waypoint/:id", async (req, res) => {
  const waypointId = toInt(req.params.id);
  const userId = toInt(req.body.user_id);
  const val = toInt(req.body.val);

  if (!waypointId) {
    return res.status(400).json({ ok: false, error: "Missing or invalid waypoint id" });
  }
  if (!userId) {
    return res.status(400).json({ ok: false, error: "Missing or invalid user id" });
  }
  if (![1, -1].includes(val)) {
    return res.status(400).json({ ok: false, error: "val must be 1 or -1" });
  }

  try {
    const existing = await get(
      `SELECT val
         FROM waypoint_ratings
        WHERE waypoint_id = ? AND user_id = ?`,
      [waypointId, userId]
    );

    let user_rating = null;

    if (existing && existing.val === val) {
      // Same value → remove rating (toggle off)
      await run(
        `DELETE FROM waypoint_ratings
          WHERE waypoint_id = ? AND user_id = ?`,
        [waypointId, userId]
      );
      user_rating = null;
    } else if (existing) {
      // Different value → update
      await run(
        `UPDATE waypoint_ratings
            SET val = ?
          WHERE waypoint_id = ? AND user_id = ?`,
        [val, waypointId, userId]
      );
      user_rating = val;
    } else {
      // No existing rating → insert new
      await run(
        `INSERT INTO waypoint_ratings (user_id, waypoint_id, val)
          VALUES (?, ?, ?)`,
        [userId, waypointId, val]
      );
      user_rating = val;
    }

    const totalRow = await get(
      `SELECT COALESCE(SUM(val), 0) AS total
         FROM waypoint_ratings
        WHERE waypoint_id = ?`,
      [waypointId]
    );
    const total = totalRow?.total ?? 0;

    // keep aggregate in sync
    await run(`UPDATE waypoints SET rating = ? WHERE id = ?`, [total, waypointId]);

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[offline POST waypoint rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to post rating" });
  }
});


// =======================
// GET Comment Rating
// GET /ratings/comment/:id?user_id=123
// =======================
router.get("/comment/:id", async (req, res) => {
  const commentId = toInt(req.params.id);
  const userId = toInt(req.query.user_id); // optional

  try {
    if (!commentId) {
      return res.status(400).json({ ok: false, error: "Missing or invalid comment id" });
    }

    const totalRow = await get(
      `SELECT COALESCE(SUM(val), 0) AS total
         FROM comment_ratings
        WHERE comment_id = ?`,
      [commentId]
    );
    const total = totalRow?.total ?? 0;

    let user_rating = null;
    if (userId) {
      const userRow = await get(
        `SELECT val
           FROM comment_ratings
          WHERE comment_id = ? AND user_id = ?`,
        [commentId, userId]
      );
      user_rating = userRow?.val ?? null;
    }

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[offline GET comment rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comment rating" });
  }
});

// =======================
// POST Comment Rating
// POST /ratings/comment/:id
// body: { user_id, val }
// =======================
router.post("/comment/:id", async (req, res) => {
  const commentId = toInt(req.params.id);
  const userId = toInt(req.body.user_id);
  const val = toInt(req.body.val);

  if (!commentId) {
    return res.status(400).json({ ok: false, error: "Missing or invalid comment id" });
  }
  if (!userId) {
    return res.status(400).json({ ok: false, error: "Missing or invalid user id" });
  }
  if (![1, -1].includes(val)) {
    return res.status(400).json({ ok: false, error: "val must be 1 or -1" });
  }

  try {
    const existing = await get(
      `SELECT val
         FROM comment_ratings
        WHERE comment_id = ? AND user_id = ?`,
      [commentId, userId]
    );

    let user_rating = null;

    if (existing && existing.val === val) {
      await run(
        `DELETE FROM comment_ratings
          WHERE comment_id = ? AND user_id = ?`,
        [commentId, userId]
      );
      user_rating = null;
    } else if (existing) {
      await run(
        `UPDATE comment_ratings
            SET val = ?
          WHERE comment_id = ? AND user_id = ?`,
        [val, commentId, userId]
      );
      user_rating = val;
    } else {
      await run(
        `INSERT INTO comment_ratings (user_id, comment_id, val)
          VALUES (?, ?, ?)`,
        [userId, commentId, val]
      );
      user_rating = val;
    }

    const totalRow = await get(
      `SELECT COALESCE(SUM(val), 0) AS total
         FROM comment_ratings
        WHERE comment_id = ?`,
      [commentId]
    );
    const total = totalRow?.total ?? 0;

    // keep aggregate on comments in sync
    await run(`UPDATE comments SET rating = ? WHERE id = ?`, [total, commentId]);

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[offline POST comment rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to post comment rating" });
  }
});


// =======================
// GET Route Rating
// GET /ratings/route/:id?user_id=123
// =======================
router.get("/route/:id", async (req, res) => {
  const routeId = toInt(req.params.id);
  const userId = toInt(req.query.user_id); // optional

  try {
    if (!routeId) {
      return res.status(400).json({ ok: false, error: "Missing or invalid route id" });
    }

    const totalRow = await get(
      `SELECT COALESCE(SUM(val), 0) AS total
         FROM route_ratings
        WHERE route_id = ?`,
      [routeId]
    );
    const total = totalRow?.total ?? 0;

    let user_rating = null;
    if (userId) {
      const userRow = await get(
        `SELECT val
           FROM route_ratings
          WHERE route_id = ? AND user_id = ?`,
        [routeId, userId]
      );
      user_rating = userRow?.val ?? null;
    }

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[offline GET route rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch rating" });
  }
});

// =======================
// POST Route Rating
// POST /ratings/route/:id
// body: { user_id, val }
// =======================
router.post("/route/:id", async (req, res) => {
  const routeId = toInt(req.params.id);
  const userId = toInt(req.body.user_id);
  const val = toInt(req.body.val);

  if (!routeId) {
    return res.status(400).json({ ok: false, error: "Missing or invalid route id" });
  }
  if (!userId) {
    return res.status(400).json({ ok: false, error: "Missing or invalid user id" });
  }
  if (![1, -1].includes(val)) {
    return res.status(400).json({ ok: false, error: "val must be 1 or -1" });
  }

  try {
    const existing = await get(
      `SELECT val
         FROM route_ratings
        WHERE route_id = ? AND user_id = ?`,
      [routeId, userId]
    );

    let user_rating = null;

    if (existing && existing.val === val) {
      await run(
        `DELETE FROM route_ratings
          WHERE route_id = ? AND user_id = ?`,
        [routeId, userId]
      );
      user_rating = null;
    } else if (existing) {
      await run(
        `UPDATE route_ratings
            SET val = ?
          WHERE route_id = ? AND user_id = ?`,
        [val, routeId, userId]
      );
      user_rating = val;
    } else {
      await run(
        `INSERT INTO route_ratings (user_id, route_id, val)
          VALUES (?, ?, ?)`,
        [userId, routeId, val]
      );
      user_rating = val;
    }

    const totalRow = await get(
      `SELECT COALESCE(SUM(val), 0) AS total
         FROM route_ratings
        WHERE route_id = ?`,
      [routeId]
    );
    const total = totalRow?.total ?? 0;

    // keep aggregate on routes in sync
    await run(`UPDATE routes SET rating = ? WHERE id = ?`, [total, routeId]);

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[offline POST route rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to post route rating" });
  }
});

module.exports = router;
