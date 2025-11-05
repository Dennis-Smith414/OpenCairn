// Server/routes/ratings.js
const express = require("express");
const router = express.Router();
const db = require("../Postgres");
const authorize = require("../middleware/authorize");

// =======================
// GET Waypoint Rating
// =======================
router.get("/waypoint/:id", authorize, async (req, res) => {
  const waypointId = req.params.id;
  const userId = req.user?.id;

  try {
    if (!waypointId) throw new Error("Missing waypoint id");
    if (!userId) throw new Error("Missing user id from token");

    const totalRows = await db.all(
      `SELECT COALESCE(SUM(val), 0) AS total
       FROM waypoint_ratings
       WHERE waypoint_id = $1`,
      [waypointId]
    );

    const userRow = await db.get(
      `SELECT val
       FROM waypoint_ratings
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
  const val = Number(req.body.val);

  if (![1, -1].includes(val)) {
    return res.status(400).json({ ok: false, error: "val must be 1 or -1" });
  }

  try {
    const row = await db.get(
      `
      WITH del AS (
        DELETE FROM waypoint_ratings r
         WHERE r.waypoint_id = $1
           AND r.user_id = $2
           AND r.val = $3
        RETURNING 1
      ),
      upsert AS (
        INSERT INTO waypoint_ratings (waypoint_id, user_id, val)
        SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM del)
        ON CONFLICT (user_id, waypoint_id)
        DO UPDATE SET val = EXCLUDED.val
        RETURNING val
      ),
      tot AS (
        SELECT COALESCE(SUM(val), 0) AS total
          FROM waypoint_ratings
         WHERE waypoint_id = $1
      ),
      final_user AS (
        SELECT val FROM upsert
        UNION ALL
        SELECT NULL::INT AS val FROM del
      )
      SELECT
        (SELECT total FROM tot) AS total,
        (SELECT val FROM final_user LIMIT 1) AS user_rating;
      `,
      [waypointId, userId, val]
    );

    res.json({ ok: true, total: row.total, user_rating: row.user_rating });
  } catch (err) {
    console.error("[POST waypoint rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to post rating" });
  }
});



// =======================
// GET Waypoint Comment Rating
// =======================
router.get("/waypoint_comment/:id", authorize, async (req, res) => {
  const waypoint_comment_id = req.params.id;
  const userId = req.user?.id;

  try {
    if (!waypoint_comment_id) throw new Error("Missing comment id");
    if (!userId) throw new Error("Missing user id from token");

    const totalRows = await db.all(
      `SELECT COALESCE(SUM(val), 0) AS total
       FROM waypoint_comment_ratings
       WHERE waypoint_comment_id = $1`,
      [waypoint_comment_id]
    );

    const userRow = await db.get(
      `SELECT val
       FROM waypoint_comment_ratings
       WHERE waypoint_comment_id = $1 AND user_id = $2`,
      [waypoint_comment_id, userId]
    );

    const total = totalRows[0]?.total || 0;
    const user_rating = userRow?.val ?? null;

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[GET waypoint comment rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comment rating" });
  }
});

// =======================
// POST WAYPOINT Comment Rating
// =======================
router.post("/waypoint_comment/:id", authorize, async (req, res) => {
  const waypoint_comment_id = req.params.id;
  const userId = req.user?.id;
  const { val } = req.body;

  if (![1, -1].includes(val)) {
    return res.status(400).json({ ok: false, error: "val must be 1 or -1" });
  }

  try {
    const row = await db.get(
      `
      WITH del AS (
        -- If the user clicks the same value again, remove their rating
        DELETE FROM waypoint_comment_ratings r
         WHERE r.waypoint_comment_id = $1
           AND r.user_id = $2
           AND r.val = $3
        RETURNING 1
      ),
      upsert AS (
        -- Otherwise insert or flip the rating to the new value
        INSERT INTO waypoint_comment_ratings (waypoint_comment_id, user_id, val)
        SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM del)
        ON CONFLICT (user_id, waypoint_comment_id)
        DO UPDATE SET val = EXCLUDED.val
        RETURNING val
      ),
      tot AS (
        SELECT COALESCE(SUM(val), 0) AS total
          FROM waypoint_comment_ratings
         WHERE waypoint_comment_id = $1
      ),
      final_user AS (
        -- If we deleted, user_rating is NULL; if we inserted/updated, return that val
        SELECT val FROM upsert
        UNION ALL
        SELECT NULL::INT AS val FROM del
      )
      SELECT
        (SELECT total FROM tot)        AS total,
        (SELECT val FROM final_user
           LIMIT 1)                    AS user_rating;
      `,
      [waypoint_comment_id, userId, val]
    );

    res.json({ ok: true, total: row.total, user_rating: row.user_rating });
  } catch (err) {
    console.error("[POST comment rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to post comment rating" });
  }
});



// =======================
// GET ROUTE Rating
// =======================
router.get("/route/:id", authorize, async (req, res) => {
  const routeId = req.params.id;
  const userId = req.user?.id;

  try {
    if (!routeId) throw new Error("Missing route id");
    if (!userId) throw new Error("Missing user id from token");

    const totalRows = await db.all(
      `SELECT COALESCE(SUM(val), 0) AS total
       FROM route_ratings
       WHERE route_id = $1`,
      [routeId]
    );

    const userRow = await db.get(
      `SELECT val
       FROM route_ratings
       WHERE route_id = $1 AND user_id = $2`,
      [routeId, userId]
    );

    const total = totalRows[0]?.total || 0;
    const user_rating = userRow?.val ?? null;

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[GET route rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch rating" });
  }
});

// =======================
// POST ROUTE Rating
// =======================
router.post("/route/:id", authorize, async (req, res) => {
  const routeId = req.params.id;
  const userId = req.user?.id;
  const val = Number(req.body.val);

  if (![1, -1].includes(val)) {
    return res.status(400).json({ ok: false, error: "val must be 1 or -1" });
  }

  try {
    const row = await db.get(
      `
      WITH del AS (
        DELETE FROM route_ratings r
         WHERE r.route_id = $1
           AND r.user_id = $2
           AND r.val = $3
        RETURNING 1
      ),
      upsert AS (
        INSERT INTO route_ratings (route_id, user_id, val)
        SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM del)
        ON CONFLICT (user_id, route_id)
        DO UPDATE SET val = EXCLUDED.val
        RETURNING val
      ),
      tot AS (
        SELECT COALESCE(SUM(val), 0) AS total
          FROM route_ratings
         WHERE route_id = $1
      ),
      final_user AS (
        SELECT val FROM upsert
        UNION ALL
        SELECT NULL::INT AS val FROM del
      )
      SELECT
        (SELECT total FROM tot) AS total,
        (SELECT val FROM final_user LIMIT 1) AS user_rating;
      `,
      [routeId, userId, val]
    );

    res.json({ ok: true, total: row.total, user_rating: row.user_rating });
  } catch (err) {
    console.error("[POST route rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to post route rating" });
  }
});

// =======================
// GET ROUTE Comment Rating
// =======================
router.get("/route_comment/:id", authorize, async (req, res) => {
  const route_comment_id = req.params.id;
  const userId = req.user?.id;

  try {
    if (!route_comment_id) throw new Error("Missing comment id");
    if (!userId) throw new Error("Missing user id from token");

    const totalRows = await db.all(
      `SELECT COALESCE(SUM(val), 0) AS total
       FROM route_comment_ratings
       WHERE route_comment_id = $1`,
      [route_comment_id]
    );

    const userRow = await db.get(
      `SELECT val
       FROM route_comment_ratings
       WHERE route_comment_id = $1 AND user_id = $2`,
      [route_comment_id, userId]
    );

    const total = totalRows[0]?.total || 0;
    const user_rating = userRow?.val ?? null;

    res.json({ ok: true, total, user_rating });
  } catch (err) {
    console.error("[GET route comment rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comment rating" });
  }
});

// =======================
// POST ROUTE Comment Rating
// =======================
router.post("/route_comment/:id", authorize, async (req, res) => {
  const route_comment_id = req.params.id;
  const userId = req.user?.id;
  const { val } = req.body;

  if (![1, -1].includes(val)) {
    return res.status(400).json({ ok: false, error: "val must be 1 or -1" });
  }

  try {
    const row = await db.get(
      `
      WITH del AS (
        -- If the user clicks the same value again, remove their rating
        DELETE FROM route_comment_ratings r
         WHERE r.route_comment_id = $1
           AND r.user_id = $2
           AND r.val = $3
        RETURNING 1
      ),
      upsert AS (
        -- Otherwise insert or flip the rating to the new value
        INSERT INTO route_comment_ratings (route_comment_id, user_id, val)
        SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM del)
        ON CONFLICT (user_id, route_comment_id)
        DO UPDATE SET val = EXCLUDED.val
        RETURNING val
      ),
      tot AS (
        SELECT COALESCE(SUM(val), 0) AS total
          FROM route_comment_ratings
         WHERE route_comment_id = $1
      ),
      final_user AS (
        -- If we deleted, user_rating is NULL; if we inserted/updated, return that val
        SELECT val FROM upsert
        UNION ALL
        SELECT NULL::INT AS val FROM del
      )
      SELECT
        (SELECT total FROM tot)        AS total,
        (SELECT val FROM final_user
           LIMIT 1)                    AS user_rating;
      `,
      [route_comment_id, userId, val]
    );

    res.json({ ok: true, total: row.total, user_rating: row.user_rating });
  } catch (err) {
    console.error("[POST route comment rating] Error:", err);
    res.status(500).json({ ok: false, error: "Failed to post route comment rating" });
  }
});

module.exports = router;
