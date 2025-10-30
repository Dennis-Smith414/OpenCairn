// Server/routes/comments.js
const express = require("express");
const router = express.Router();
const db = require("../Postgres");
const authorize = require("../middleware/authorize"); // optional if you use JWT

//GET comments for a waypoint
router.get("/:waypointId", async (req, res) => {
  try {
    const { waypointId } = req.params;
    const rows = await db.all(
      `SELECT c.id, c.user_id, u.username, c.content, c.create_time
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.waypoint_id = $1
       ORDER BY c.create_time DESC`,
      [waypointId]
    );
    res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comments" });
  }
});

// POST a comment (authenticated)
router.post("/:waypointId", authorize, async (req, res) => {
  try {
    const { waypointId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const comment = await db.get(
      `INSERT INTO comments (user_id, waypoint_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, content, create_time`,
      [userId, waypointId, content]
    );
    res.json({ ok: true, comment });
  } catch (err) {
    console.error("Error posting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to post comment" });
  }
});

// PATCH update a comment (author only)
router.patch("/:commentId", authorize, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const trimmed = (content ?? "").trim();
    if (!trimmed) {
      return res.status(400).json({ ok: false, error: "Content cannot be empty." });
    }
    if (trimmed.length > 5000) { // pick a sensible cap
      return res.status(400).json({ ok: false, error: "Content too long." });
    }

    // Ensure the comment belongs to the current user
    const existing = await db.get(
      "SELECT id, user_id FROM comments WHERE id = $1",
      [commentId]
    );
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Comment not found." });
    }
    if (Number(existing.user_id) !== Number(userId)) {
      return res.status(403).json({ ok: false, error: "Not your comment." });
    }

    // Update and return updated row (include username for UI parity if you like)
    const updated = await db.get(
      `UPDATE comments
         SET content = $1
       WHERE id = $2
       RETURNING id, user_id, content, create_time`,
      [trimmed, commentId]
    );

    res.json({ ok: true, comment: updated }); // or { ok: true, comment: withUser }
  } catch (err) {
    console.error("Error updating comment:", err);
    res.status(500).json({ ok: false, error: "Failed to update comment" });
  }
});

// DELETE a comment
router.delete("/:commentId", authorize, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const existing = await db.get(
      "SELECT id, user_id FROM comments WHERE id = $1 AND user_id = $2",
      [commentId, userId]
    );
    if (!existing) {
      return res.status(403).json({ ok: false, error: "Not your comment" });
    }

    await db.run("DELETE FROM comments WHERE id = $1", [commentId]);
    res.json({ ok: true, deleted_id: Number(commentId) }); // <- added deleted_id
  } catch (err) {
    console.error("Error deleting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to delete comment" });
  }
});

module.exports = router;
