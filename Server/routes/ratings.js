// Server/routes/ratings.js
const express = require("express");
const router = express.Router();
const db = require("../Postgres");
const authorize = require("../middleware/authorize");

// =======================
// 📍 GET Waypoint Rating
// =======================
router.get("/waypoint/:id", authorize, async (req, res) => {
  const waypointId = req.params.id;
  const userId = req.user?.id;

  try {
    if (!waypointId) throw new Error("Missing waypoint id");
    if (!userId) throw new Error("Missing user id from token");

    const totalRows = await db.all(
      `SELECT COALESCE(SUM(val), 0) AS total
       FROM waypoint_rating
       WHERE waypoint_id = $1`,
      [waypointId]
    );

    const userRow = await db.get(
      `SELECT val
       FROM waypoint_rating
       WHERE waypoint_id = $1 AND user_id = $2`,
      [waypointId, userId]
    );

    const total = totalRows[0]?.total || 0;
    const user_rating = userRow?.val ?? null;

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[GET waypoint rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch rating" });
  }
});

// =======================
// POST Waypoint Rating
// =======================
router.post("/waypoint/:id", authorize, async (req, res) => {
  const waypointId = req.params.id;
  const userId = req.user?.id;
  const { val } = req.body;

  if (![1, -1].includes(val)) {
    return res.status(400).json({ ok: false, error: "val must be 1 or -1" });
  }

  try {
    const existing = await db.get(
      `SELECT val FROM waypoint_rating
       WHERE waypoint_id = $1 AND user_id = $2`,
      [waypointId, userId]
    );

    if (existing) {
      if (existing.val === val) {
        await db.run(
          `DELETE FROM waypoint_rating
           WHERE waypoint_id = $1 AND user_id = $2`,
          [waypointId, userId]
        );
      } else {
        await db.run(
          `UPDATE waypoint_rating
           SET val = $3
           WHERE waypoint_id = $1 AND user_id = $2`,
          [waypointId, userId, val]
        );
      }
    } else {
      await db.run(
        `INSERT INTO waypoint_rating (waypoint_id, user_id, val)
         VALUES ($1, $2, $3)`,
        [waypointId, userId, val]
      );
    }

    const totalRows = await db.all(
      `SELECT COALESCE(SUM(val), 0) AS total
       FROM waypoint_rating
       WHERE waypoint_id = $1`,
      [waypointId]
    );

    const userRow = await db.get(
      `SELECT val
       FROM waypoint_rating
       WHERE waypoint_id = $1 AND user_id = $2`,
      [waypointId, userId]
    );

    const total = totalRows[0]?.total || 0;
    const user_rating = userRow?.val ?? null;

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[POST waypoint rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to post rating" });
  }
});


// =======================
// 💬 GET Comment Rating
// =======================
router.get("/comment/:id", authorize, async (req, res) => {
  const commentId = req.params.id;
  const userId = req.user?.id;

  try {
    if (!commentId) throw new Error("Missing comment id");
    if (!userId) throw new Error("Missing user id from token");

    const totalRows = await db.all(
      `SELECT COALESCE(SUM(val), 0) AS total
       FROM comment_rating
       WHERE comment_id = $1`,
      [commentId]
    );

    const userRow = await db.get(
      `SELECT val
       FROM comment_rating
       WHERE comment_id = $1 AND user_id = $2`,
      [commentId, userId]
    );

    const total = totalRows[0]?.total || 0;
    const user_rating = userRow?.val ?? null;

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[GET comment rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comment rating" });
  }
});

// =======================
// 💬 POST Comment Rating
// =======================
router.post("/comment/:id", authorize, async (req, res) => {
  const commentId = req.params.id;
  const userId = req.user?.id;
  const { val } = req.body;

  if (![1, -1].includes(val)) {
    return res.status(400).json({ ok: false, error: "val must be 1 or -1" });
  }

  try {
    const existing = await db.get(
      `SELECT val FROM comment_rating
       WHERE comment_id = $1 AND user_id = $2`,
      [commentId, userId]
    );

    if (existing) {
      if (existing.val === val) {
        await db.run(
          `DELETE FROM comment_rating
           WHERE comment_id = $1 AND user_id = $2`,
          [commentId, userId]
        );
      } else {
        await db.run(
          `UPDATE comment_rating
           SET val = $3
           WHERE comment_id = $1 AND user_id = $2`,
          [commentId, userId, val]
        );
      }
    } else {
      await db.run(
        `INSERT INTO comment_rating (comment_id, user_id, val)
         VALUES ($1, $2, $3)`,
        [commentId, userId, val]
      );
    }

    const totalRows = await db.all(
      `SELECT COALESCE(SUM(val), 0) AS total
       FROM comment_rating
       WHERE comment_id = $1`,
      [commentId]
    );

    const userRow = await db.get(
      `SELECT val
       FROM comment_rating
       WHERE comment_id = $1 AND user_id = $2`,
      [commentId, userId]
    );

    const total = totalRows[0]?.total || 0;
    const user_rating = userRow?.val ?? null;

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[POST comment rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to post comment rating" });
  }
});

module.exports = router;
