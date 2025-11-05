// Server/routes/comments.js
const express = require("express");
const router = express.Router();
const db = require("../Postgres");
const authorize = require("../middleware/authorize"); // optional if you use JWT

//GET comments for a waypoint
router.get("/waypoints/:waypointId", async (req, res) => {
  try {
    const { waypointId } = req.params;
    const rows = await db.all(
      `SELECT c.id, c.user_id, u.username, c.content, c.created_at, c.updated_at, c.edited
       FROM waypoint_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.waypoint_id = $1
       ORDER BY c.created_at DESC`,
      [waypointId]
    );
    res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comments" });
  }
});
//GET comments for a route
router.get("/routes/:routeId", async (req, res) => {
  try {
    const { routeId } = req.params;
    const rows = await db.all(
      `SELECT c.id, c.user_id, u.username, c.content, c.created_at, c.updated_at, c.edited
       FROM route_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.route_id = $1
       ORDER BY c.created_at DESC`,
      [routeId]
    );
    res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comments" });
  }
});

// POST a WAYPOINT comment (authenticated)
router.post("/waypoints/:waypointId", authorize, async (req, res) => {
  try {
    const { waypointId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const comment = await db.get(
      `INSERT INTO waypoint_comments (user_id, waypoint_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, content, created_at`,
      [userId, waypointId, content]
    );
    res.json({ ok: true, comment });
  } catch (err) {
    console.error("Error posting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to post comment" });
  }
});

// POST a ROUTE comment (authenticated)
router.post("/routes/:routeId", authorize, async (req, res) => {
  try {
    const { routeId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const comment = await db.get(
      `INSERT INTO route_comments (user_id, route_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, content, created_at`,
      [userId, routeId, content]
    );
    res.json({ ok: true, comment });
  } catch (err) {
    console.error("Error posting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to post comment" });
  }
});

// PATCH update a WAYPOINT comment (author only)
router.patch("/waypoints/:commentId", authorize, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;
    const trimmed = (req.body.content ?? "").trim();

    if (!trimmed) {
      return res.status(400).json({ ok: false, error: "Content cannot be empty." });
    }
    if (trimmed.length > 5000) {
      return res.status(400).json({ ok: false, error: "Content too long." });
    }

    // Update only if the row exists AND belongs to the user AND content actually changes
    const updated = await db.get(
      `
      UPDATE waypoint_comments
         SET content = $1,
             updated_at = NOW(),
             edited = CASE WHEN content <> $1 THEN TRUE ELSE edited END
       WHERE id = $2
         AND user_id = $3
         AND content <> $1
       RETURNING id, user_id, content, created_at, updated_at, edited
      `,
      [trimmed, commentId, userId]
    );

    if (!updated) {
      // Figure out why: not found vs not yours vs no change
      // Check existence quickly:
      const exists = await db.get(
        "SELECT id, user_id FROM waypoint_comments WHERE id = $1",
        [commentId]
      );
      if (!exists) {
        return res.status(404).json({ ok: false, error: "Comment not found." });
      }
      if (Number(exists.user_id) !== Number(userId)) {
        return res.status(403).json({ ok: false, error: "Not your comment." });
      }
      // Same content (no change)
      return res.status(200).json({ ok: true, unchanged: true });
    }

    res.json({ ok: true, comment: updated });
  } catch (err) {
    console.error("Error updating comment:", err);
    res.status(500).json({ ok: false, error: "Failed to update comment" });
  }
});


// PATCH update a ROUTE comment (author only)
router.patch("/routes/:commentId", authorize, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;
    const trimmed = (req.body.content ?? "").trim();

    if (!trimmed) {
      return res.status(400).json({ ok: false, error: "Content cannot be empty." });
    }
    if (trimmed.length > 5000) {
      return res.status(400).json({ ok: false, error: "Content too long." });
    }

    // Update only if the row exists AND belongs to the user AND content actually changes
    const updated = await db.get(
      `
      UPDATE route_comments
         SET content = $1,
             updated_at = NOW(),
             edited = CASE WHEN content <> $1 THEN TRUE ELSE edited END
       WHERE id = $2
         AND user_id = $3
         AND content <> $1
       RETURNING id, user_id, content, created_at, updated_at, edited
      `,
      [trimmed, commentId, userId]
    );

    if (!updated) {
      // Figure out why: not found vs not yours vs no change
      // Check existence quickly:
      const exists = await db.get(
        "SELECT id, user_id FROM waypoint_comments WHERE id = $1",
        [commentId]
      );
      if (!exists) {
        return res.status(404).json({ ok: false, error: "Comment not found." });
      }
      if (Number(exists.user_id) !== Number(userId)) {
        return res.status(403).json({ ok: false, error: "Not your comment." });
      }
      // Same content (no change)
      return res.status(200).json({ ok: true, unchanged: true });
    }

    res.json({ ok: true, comment: updated });
  } catch (err) {
    console.error("Error updating comment:", err);
    res.status(500).json({ ok: false, error: "Failed to update comment" });
  }
});

// DELETE a WAYPOINT comment
router.delete("/waypoints/:commentId", authorize, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const existing = await db.get(
      "SELECT id, user_id FROM waypoint_comments WHERE id = $1 AND user_id = $2",
      [commentId, userId]
    );
    if (!existing) {
      return res.status(403).json({ ok: false, error: "Not your comment" });
    }

    await db.run("DELETE FROM waypoint_comments WHERE id = $1", [commentId]);
    res.json({ ok: true, deleted_id: Number(commentId) }); // <- added deleted_id
  } catch (err) {
    console.error("Error deleting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to delete comment" });
  }
});


// DELETE a ROUTE comment
router.delete("/routes/:commentId", authorize, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const existing = await db.get(
      "SELECT id, user_id FROM waypoint_comments WHERE id = $1 AND user_id = $2",
      [commentId, userId]
    );
    if (!existing) {
      return res.status(403).json({ ok: false, error: "Not your comment" });
    }

    await db.run("DELETE FROM waypoint_comments WHERE id = $1", [commentId]);
    res.json({ ok: true, deleted_id: Number(commentId) }); // <- added deleted_id
  } catch (err) {
    console.error("Error deleting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to delete comment" });
  }
});

module.exports = router;
