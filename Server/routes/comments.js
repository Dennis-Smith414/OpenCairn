// Server/routes/comments.js
const express = require("express");
const router = express.Router();
const db = require("../Postgres");
const authorize = require("../middleware/authorize");

// -------------------------
// GET: comments for a waypoint
// -------------------------
router.get("/waypoints/:waypointId", async (req, res) => {
  try {
    const { waypointId } = req.params;
    const rows = await db.all(
      `
      SELECT c.id, c.user_id, u.username, c.content,
             c.created_at, c.updated_at, c.edited,
             c.kind, c.waypoint_id, c.route_id
      FROM comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.kind = 'waypoint' AND c.waypoint_id = $1
      ORDER BY c.created_at DESC
      `,
      [Number(waypointId)]
    );
    res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comments" });
  }
});

// -------------------------
// GET: comments for a route
// -------------------------
router.get("/routes/:routeId", async (req, res) => {
  try {
    const { routeId } = req.params;
    const rows = await db.all(
      `
      SELECT c.id, c.user_id, u.username, c.content,
             c.created_at, c.updated_at, c.edited,
             c.kind, c.waypoint_id, c.route_id
      FROM comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.kind = 'route' AND c.route_id = $1
      ORDER BY c.created_at DESC
      `,
      [Number(routeId)]
    );
    res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comments" });
  }
});

// -------------------------
// POST: add a WAYPOINT comment (auth)
// -------------------------
router.post("/waypoints/:waypointId", authorize, async (req, res) => {
  try {
    const { waypointId } = req.params;
    const userId = req.user.id;
    const content = (req.body.content ?? "").trim();

    if (!content) return res.status(400).json({ ok: false, error: "Content required." });

    const comment = await db.get(
      `
      INSERT INTO comments (user_id, kind, waypoint_id, route_id, content)
      VALUES ($1, 'waypoint', $2, NULL, $3)
      RETURNING id, user_id, content, created_at, updated_at, edited, kind, waypoint_id, route_id
      `,
      [userId, Number(waypointId), content]
    );
    res.json({ ok: true, comment });
  } catch (err) {
    console.error("Error posting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to post comment" });
  }
});

// -------------------------
// POST: add a ROUTE comment (auth)
// -------------------------
router.post("/routes/:routeId", authorize, async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;
    const content = (req.body.content ?? "").trim();

    if (!content) return res.status(400).json({ ok: false, error: "Content required." });

    const comment = await db.get(
      `
      INSERT INTO comments (user_id, kind, waypoint_id, route_id, content)
      VALUES ($1, 'route', NULL, $2, $3)
      RETURNING id, user_id, content, created_at, updated_at, edited, kind, waypoint_id, route_id
      `,
      [userId, Number(routeId), content]
    );
    res.json({ ok: true, comment });
  } catch (err) {
    console.error("Error posting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to post comment" });
  }
});

// -------------------------
// PATCH: update ANY comment (author only)
// -------------------------
router.patch("/:commentId", authorize, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;
    const trimmed = (req.body.content ?? "").trim();

    if (!trimmed) return res.status(400).json({ ok: false, error: "Content cannot be empty." });
    if (trimmed.length > 5000) return res.status(400).json({ ok: false, error: "Content too long." });

    const updated = await db.get(
      `
      UPDATE comments
         SET content   = $1,
             updated_at = NOW(),
             edited     = edited OR (content <> $1)
       WHERE id = $2
         AND user_id = $3
         AND content <> $1
       RETURNING id, user_id, content, created_at, updated_at, edited, kind, waypoint_id, route_id
      `,
      [trimmed, Number(commentId), userId]
    );

    if (!updated) {
      const exists = await db.get(
        "SELECT id, user_id FROM comments WHERE id = $1",
        [Number(commentId)]
      );
      if (!exists) return res.status(404).json({ ok: false, error: "Comment not found." });
      if (Number(exists.user_id) !== Number(userId)) {
        return res.status(403).json({ ok: false, error: "Not your comment." });
      }
      return res.status(200).json({ ok: true, unchanged: true });
    }

    res.json({ ok: true, comment: updated });
  } catch (err) {
    console.error("Error updating comment:", err);
    res.status(500).json({ ok: false, error: "Failed to update comment" });
  }
});

// -------------------------
// DELETE: ANY comment (author only)
// -------------------------
router.delete("/:commentId", authorize, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const existing = await db.get(
      "SELECT id FROM comments WHERE id = $1 AND user_id = $2",
      [Number(commentId), userId]
    );
    if (!existing) return res.status(403).json({ ok: false, error: "Not your comment" });

    await db.run("DELETE FROM comments WHERE id = $1", [Number(commentId)]);
    res.json({ ok: true, deleted_id: Number(commentId) });
  } catch (err) {
    console.error("Error deleting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to delete comment" });
  }
});


module.exports = router;
