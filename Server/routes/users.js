const express = require("express");
const { Pool } = require("pg");
const authorize = require('../middleware/authorize');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// This route is protected. It will first run the 'authorize' middleware.
// If the token is valid, `req.user` will be populated.
router.get("/me", authorize, async (req, res) => {
  try {
    const userId = req.user.id; // Get the user ID from the decoded token

    const userRes = await pool.query(
      "SELECT id, username, email, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "User not found." });
    }
     const statsRes = await pool.query(`
       SELECT
         (SELECT COUNT(*) FROM routes WHERE user_id = $1) AS routes_created,
         (SELECT COUNT(*) FROM waypoints WHERE user_id = $1) AS waypoints_created,
         (SELECT COUNT(*) FROM route_ratings WHERE user_id = $1) AS route_ratings,
         (SELECT COUNT(*) FROM waypoint_ratings WHERE user_id = $1) AS waypoint_ratings,
         (SELECT COUNT(*) FROM waypoint_comments WHERE user_id = $1) AS waypoint_comments_created,
         (SELECT COUNT(*) FROM waypoint_comment_ratings WHERE user_id = $1) AS waypoint_comment_ratings,
         (SELECT COUNT(*) FROM route_comments WHERE user_id = $1) AS route_comments_created,
         (SELECT COUNT(*) FROM route_comment_ratings WHERE user_id = $1) AS route_comment_ratings
     `, [userId]);


    res.json({
      ok: true,
      user: userRes.rows[0],
      stats: statsRes.rows[0],
    });

  } catch (e) {
    console.error("GET /api/users/me ", e);
    res.status(500).json({ ok: false, error: "Server error." });
  }
});
// ================================================================
// GET /api/users/me/routes
// Returns all routes created by the logged-in user
// ================================================================
router.get("/me/routes", authorize, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, slug, name, region, created_at, updated_at
         FROM routes
        WHERE user_id = $1
        ORDER BY updated_at DESC`,
      [userId]
    );

    res.json({ ok: true, routes: result.rows });
  } catch (err) {
    console.error("GET /api/users/me/routes error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

// ================================================================
// GET /api/users/me/waypoints
// Returns all waypoints created by the logged-in user
// ================================================================
router.get("/me/waypoints", authorize, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT w.*, r.name AS route_name
         FROM waypoints w
         LEFT JOIN routes r ON r.id = w.route_id
        WHERE w.user_id = $1
        ORDER BY w.created_at DESC`,
      [userId]
    );

    res.json({ ok: true, waypoints: result.rows });
  } catch (err) {
    console.error("GET /api/users/me/waypoints error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

// ================================================================
// GET /api/users/me/comments
// Returns all comments (waypoint + route) written by the logged-in user
// ================================================================
router.get("/me/comments", authorize, async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await pool.query(
      `
      SELECT
        'waypoint'::text           AS source,
        wc.id                      AS id,
        wc.content                 AS content,
        wc.created_at              AS created_at,
        wc.updated_at              AS updated_at,
        wc.edited                  AS edited,
        wc.waypoint_id             AS waypoint_id,
        w.name                     AS waypoint_name,
        w.route_id                 AS route_id,
        r.name                     AS route_name
      FROM waypoint_comments wc
      LEFT JOIN waypoints w ON w.id = wc.waypoint_id
      LEFT JOIN routes    r ON r.id = w.route_id
      WHERE wc.user_id = $1

      UNION ALL

      SELECT
        'route'::text              AS source,
        rc.id                      AS id,
        rc.content                 AS content,
        rc.created_at              AS created_at,
        rc.updated_at              AS updated_at,
        rc.edited                  AS edited,
        NULL::int                  AS waypoint_id,
        NULL::text                 AS waypoint_name,
        rc.route_id                AS route_id,
        r.name                     AS route_name
      FROM route_comments rc
      LEFT JOIN routes r ON r.id = rc.route_id
      WHERE rc.user_id = $1

      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error("GET /api/users/me/comments error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});


module.exports = router;