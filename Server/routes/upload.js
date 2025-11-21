// server/routes/upload.js
const express = require("express");
const router = express.Router();
const authorize = require("../middleware/authorize");
const db = require("../Postgres"); // <-- use same wrapper as other routes

router.post("/push", authorize, async (req, res) => {
  const userId = req.user.id;
  const payload = req.body || {};

  const {
    waypoints = [],
    comments = [],
    ratings = { waypoint: [], route: [], comment: [] },
    favorites = { route: [] },
  } = payload;

  try {
    /* -------------------------
     * WAYPOINTS
     * ------------------------- */
    for (const wp of waypoints) {
      if (wp.sync_status === "new") {
        await db.run(
          `INSERT INTO waypoints (id, route_id, user_id, name, description, lat, lon, type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO NOTHING`,
          [
            wp.id,
            wp.route_id,
            userId,
            wp.name,
            wp.description,
            wp.lat,
            wp.lon,
            wp.type,
          ]
        );
      } else if (wp.sync_status === "dirty") {
        await db.run(
          `UPDATE waypoints
             SET name=$1,
                 description=$2,
                 lat=$3,
                 lon=$4,
                 type=$5,
                 updated_at=NOW()
           WHERE id=$6
             AND user_id=$7`,
          [
            wp.name,
            wp.description,
            wp.lat,
            wp.lon,
            wp.type,
            wp.id,
            userId,
          ]
        );
      } else if (wp.sync_status === "deleted") {
        await db.run(
          `DELETE FROM waypoints
            WHERE id=$1
              AND user_id=$2`,
          [wp.id, userId]
        );
      }
    }

    /* -------------------------
     * COMMENTS
     * ------------------------- */
    for (const c of comments) {
      if (c.sync_status === "new") {
        await db.run(
          `INSERT INTO comments (id, user_id, kind, waypoint_id, route_id, content, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
           ON CONFLICT (id) DO NOTHING`,
          [c.id, userId, c.kind, c.waypoint_id, c.route_id, c.content]
        );
      } else if (c.sync_status === "dirty") {
        await db.run(
          `UPDATE comments
             SET content=$1,
                 updated_at=NOW(),
                 edited=true
           WHERE id=$2
             AND user_id=$3`,
          [c.content, c.id, userId]
        );
      } else if (c.sync_status === "deleted") {
        await db.run(
          `DELETE FROM comments
            WHERE id=$1
              AND user_id=$2`,
          [c.id, userId]
        );
      }
    }

    /* -------------------------
     * RATINGS
     * ------------------------- */

    // r.target_id  => waypoint_id / route_id / comment_id
    // r.rating     => val  (-1 or +1)
    const applyRating = async (table, idColumn, r) => {
      if (r.sync_status === "new" || r.sync_status === "dirty") {
        await db.run(
          `INSERT INTO ${table} (user_id, ${idColumn}, val)
           VALUES ($1,$2,$3)
           ON CONFLICT (user_id, ${idColumn})
           DO UPDATE SET val=$3`,
          [userId, r.target_id, r.rating]
        );
      } else if (r.sync_status === "deleted") {
        await db.run(
          `DELETE FROM ${table}
            WHERE user_id=$1
              AND ${idColumn}=$2`,
          [userId, r.target_id]
        );
      }
    };

    for (const r of ratings.waypoint) {
      await applyRating("waypoint_ratings", "waypoint_id", r);
    }
    for (const r of ratings.route) {
      await applyRating("route_ratings", "route_id", r);
    }
    for (const r of ratings.comment) {
      await applyRating("comment_ratings", "comment_id", r);
    }

    /* -------------------------
     * FAVORITES (ROUTES)
     * ------------------------- */

    // f.target_id => route_id
    const applyFavorite = async (table, idColumn, f) => {
      if (f.sync_status === "new" || f.sync_status === "dirty") {
        await db.run(
          `INSERT INTO ${table} (user_id, ${idColumn}, created_at)
           VALUES ($1,$2,NOW())
           ON CONFLICT (user_id, ${idColumn}) DO NOTHING`,
          [userId, f.target_id]
        );
      } else if (f.sync_status === "deleted") {
        await db.run(
          `DELETE FROM ${table}
            WHERE user_id=$1
              AND ${idColumn}=$2`,
          [userId, f.target_id]
        );
      }
    };

    if (favorites && Array.isArray(favorites.route)) {
      for (const f of favorites.route) {
        await applyFavorite("route_favorites", "route_id", f);
      }
    }

    res.json({
      ok: true,
      applied: {
        waypoints: waypoints.length,
        comments: comments.length,
        ratings:
          ratings.waypoint.length +
          ratings.route.length +
          ratings.comment.length,
        favorites: (favorites.route || []).length,
      },
    });
  } catch (err) {
    console.error("[upload] syncOnline error", err);
    res.status(500).json({ ok: false, error: "sync-failed" });
  }
});

module.exports = router;
