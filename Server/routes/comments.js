// Server/routes/comments.js
const express = require("express");
const router = express.Router();
const db = require("../Postgres");
const authorize = require("../middleware/authorize"); // optional if you use JWT

// 🧭 GET comments for a waypoint
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

// 📝 POST a comment (authenticated)
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

router.delete("/:commentId", authorize, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    console.log("Deleting comment:", commentId, "by user:", userId);

    const existing = await db.get(
      "SELECT * FROM comments WHERE id = $1 AND user_id = $2",
      [commentId, userId]
    );
    console.log("Existing comment:", existing);

    if (!existing)
      return res.status(403).json({ ok: false, error: "Not your comment" });

    await db.run("DELETE FROM comments WHERE id = $1", [commentId]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error deleting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to delete comment" });
  }
});


module.exports = router;
