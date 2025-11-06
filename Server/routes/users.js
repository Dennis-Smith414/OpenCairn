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
         (SELECT COUNT(*) FROM comments WHERE user_id = $1) AS comments_created,
         (SELECT COUNT(*) FROM comment_ratings WHERE user_id = $1) AS comment_ratings
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
        c.kind                         AS source,
        c.id                           AS id,
        c.content                      AS content,
        c.created_at                   AS created_at,
        c.updated_at                   AS updated_at,
        c.edited                       AS edited,

        CASE WHEN c.kind = 'waypoint' THEN c.waypoint_id ELSE NULL END AS waypoint_id,
        CASE WHEN c.kind = 'waypoint' THEN w.name       ELSE NULL END AS waypoint_name,

        -- route_id/name from either the comment (route) or the waypoint's route (waypoint)
        COALESCE(
          CASE WHEN c.kind = 'route'    THEN c.route_id END,
          CASE WHEN c.kind = 'waypoint' THEN w.route_id END
        ) AS route_id,

        COALESCE(
          CASE WHEN c.kind = 'route'    THEN r.name      END,
          CASE WHEN c.kind = 'waypoint' THEN rw.name     END
        ) AS route_name

      FROM comments c
      LEFT JOIN waypoints w ON w.id = c.waypoint_id              -- for waypoint comments
      LEFT JOIN routes   r ON r.id = c.route_id                  -- for route comments
      LEFT JOIN routes  rw ON rw.id = w.route_id                 -- route via waypoint

      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
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