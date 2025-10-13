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

  console.log("🔍 [GET /api/ratings/waypoint/:id]", {
    waypointId,
    userId,
    headersAuth: req.headers.authorization ? "✅ present" : "❌ missing",
  });

  try {
    if (!waypointId) throw new Error("Missing waypoint id");
    if (!userId) throw new Error("Missing user id from token");

    console.log("📦 Fetching total rating...");
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

    console.log("Final rating payload:", { total, user_rating });
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

  console.log("[POST /api/ratings/waypoint/:id]", {
    waypointId,
    userId,
    val,
  });

  if (![1, -1].includes(val)) {
    return res.status(400).json({ ok: false, error: "val must be 1 or -1" });
  }

  try {
    // Check if user already voted
    const existing = await db.get(
      `SELECT val FROM waypoint_rating
       WHERE waypoint_id = $1 AND user_id = $2`,
      [waypointId, userId]
    );
    console.log("Existing vote:", existing);

    if (existing) {
      if (existing.val === val) {
        console.log("🗑️ Same vote again → deleting...");
        await db.run(
          `DELETE FROM waypoint_rating
           WHERE waypoint_id = $1 AND user_id = $2`,
          [waypointId, userId]
        );
      } else {
        console.log("Flipping vote...");
        await db.run(
          `UPDATE waypoint_rating
           SET val = $3
           WHERE waypoint_id = $1 AND user_id = $2`,
          [waypointId, userId, val]
        );
      }
    } else {
      console.log(" Inserting new vote...");
      await db.run(
        `INSERT INTO waypoint_rating (waypoint_id, user_id, val)
         VALUES ($1, $2, $3)`,
        [waypointId, userId, val]
      );
    }

    // Return updated totals
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

module.exports = router;
