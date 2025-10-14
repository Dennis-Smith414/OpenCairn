/**
 * Server/routes/comments.js
 *
 * Handles CRUD operations for waypoint comments.
 */

const express = require("express");
const router = express.Router();
const pool = require("../Postgres");
const authorize = require("../middleware/authorize");

// -------------------------------------
// POST /api/comments
// Create a new comment for a waypoint
// -------------------------------------
router.post("/", authorize, async (req, res) => {
  const { waypoint_id, content } = req.body;
  const user_id = req.user.id; // from decoded JWT

  if (!waypoint_id || !content) {
    return res.status(400).json({ ok: false, error: "Missing waypoint_id or content" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO comments (user_id, waypoint_id, content, create_time)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, user_id, waypoint_id, content, create_time`,
      [user_id, waypoint_id, content]
    );
    res.json({ ok: true, comment: result.rows[0] });
  } catch (err) {
    console.error("Error creating comment:", err);
    res.status(500).json({ ok: false, error: "Failed to create comment" });
  }
});

// -------------------------------------
// GET /api/comments/:waypoint_id
// Fetch all comments for a waypoint
// -------------------------------------
router.get("/:waypoint_id", async (req, res) => {
  const { waypoint_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT c.id, c.user_id, u.username, c.content, c.create_time
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.waypoint_id = $1
       ORDER BY c.create_time DESC`,
      [waypoint_id]
    );
    res.json({ ok: true, comments: result.rows });
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comments" });
  }
});

// -------------------------------------
// DELETE /api/comments/:id
// Delete a comment (only by its author)
// -------------------------------------
router.delete("/:id", authorize, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  try {
    // Only delete if the user owns the comment
    const result = await pool.query(
      `DELETE FROM comments WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user_id]
    );

    if (result.rowCount === 0) {
      return res.status(403).json({ ok: false, error: "Not authorized or comment not found" });
    }

    res.json({ ok: true, deleted_id: id });
  } catch (err) {
    console.error("Error deleting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to delete comment" });
  }
});

module.exports = router;
