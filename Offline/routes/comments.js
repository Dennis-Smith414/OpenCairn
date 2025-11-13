// offline/routes/comments.js
const express = require("express");
const router = express.Router();
const { all, get, run } = require("../db/queries");

// -------------------------
// GET: comments for a waypoint
// -------------------------
router.get("/waypoints/:waypointId", async (req, res) => {
  try {
    const { waypointId } = req.params;

    const rows = await all(
      `
      SELECT
        c.id,
        c.user_id,
        c.username,
        c.content,
        c.created_at,
        c.updated_at,
        c.edited,
        c.kind,
        c.waypoint_id,
        c.route_id
      FROM comments c
      WHERE c.kind = 'waypoint'
        AND c.waypoint_id = ?
      ORDER BY c.created_at DESC
      `,
      [Number(waypointId)]
    );

    res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error("[offline] Error fetching waypoint comments:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comments" });
  }
});

// -------------------------
// GET: comments for a route
// -------------------------
router.get("/routes/:routeId", async (req, res) => {
  try {
    const { routeId } = req.params;

    const rows = await all(
      `
      SELECT
        c.id,
        c.user_id,
        c.username,
        c.content,
        c.created_at,
        c.updated_at,
        c.edited,
        c.kind,
        c.waypoint_id,
        c.route_id
      FROM comments c
      WHERE c.kind = 'route'
        AND c.route_id = ?
      ORDER BY c.created_at DESC
      `,
      [Number(routeId)]
    );

    res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error("[offline] Error fetching route comments:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch comments" });
  }
});

// -------------------------
// POST: add a WAYPOINT comment (offline)
// Expect body: { user_id, username, content }
// -------------------------
router.post("/waypoints/:waypointId", async (req, res) => {
  try {
    const { waypointId } = req.params;
    const waypoint_id = Number(waypointId);

    const user_id = Number(req.body.user_id);
    const username = (req.body.username ?? "").trim();
    const content = (req.body.content ?? "").trim();

    if (!user_id || !username || !content) {
      return res
        .status(400)
        .json({ ok: false, error: "user_id, username, and content are required." });
    }

    // Insert comment
    const result = await run(
      `
      INSERT INTO comments (user_id, username, kind, waypoint_id, route_id, content)
      VALUES (?, ?, 'waypoint', ?, NULL, ?)
      `,
      [user_id, username, waypoint_id, content]
    );

    const commentId = result.lastID;

    const comment = await get(
      `
      SELECT
        id,
        user_id,
        username,
        content,
        created_at,
        updated_at,
        edited,
        kind,
        waypoint_id,
        route_id
      FROM comments
      WHERE id = ?
      `,
      [commentId]
    );

    res.json({ ok: true, comment });
  } catch (err) {
    console.error("[offline] Error posting waypoint comment:", err);
    res.status(500).json({ ok: false, error: "Failed to post comment" });
  }
});

// -------------------------
// POST: add a ROUTE comment (offline)
// Expect body: { user_id, username, content }
// -------------------------
router.post("/routes/:routeId", async (req, res) => {
  try {
    const { routeId } = req.params;
    const route_id = Number(routeId);

    const user_id = Number(req.body.user_id);
    const username = (req.body.username ?? "").trim();
    const content = (req.body.content ?? "").trim();

    if (!user_id || !username || !content) {
      return res
        .status(400)
        .json({ ok: false, error: "user_id, username, and content are required." });
    }

    const result = await run(
      `
      INSERT INTO comments (user_id, username, kind, waypoint_id, route_id, content)
      VALUES (?, ?, 'route', NULL, ?, ?)
      `,
      [user_id, username, route_id, content]
    );

    const commentId = result.lastID;

    const comment = await get(
      `
      SELECT
        id,
        user_id,
        username,
        content,
        created_at,
        updated_at,
        edited,
        kind,
        waypoint_id,
        route_id
      FROM comments
      WHERE id = ?
      `,
      [commentId]
    );

    res.json({ ok: true, comment });
  } catch (err) {
    console.error("[offline] Error posting route comment:", err);
    res.status(500).json({ ok: false, error: "Failed to post comment" });
  }
});

// -------------------------
// PATCH: update ANY comment (author only, offline)
// Expect body: { user_id, content }
// -------------------------
router.patch("/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params;
    const id = Number(commentId);
    const user_id = Number(req.body.user_id);
    const trimmed = (req.body.content ?? "").trim();

    if (!user_id) {
      return res.status(400).json({ ok: false, error: "user_id is required." });
    }

    if (!trimmed) {
      return res.status(400).json({ ok: false, error: "Content cannot be empty." });
    }
    if (trimmed.length > 5000) {
      return res.status(400).json({ ok: false, error: "Content too long." });
    }

    // Only update if same user and content actually changes
    const result = await run(
      `
      UPDATE comments
         SET content    = ?,
             updated_at = datetime('now'),
             edited     = CASE WHEN content <> ? THEN 1 ELSE edited END
       WHERE id      = ?
         AND user_id = ?
         AND content <> ?
      `,
      [trimmed, trimmed, id, user_id, trimmed]
    );

    if (!result.changes) {
      // Check if the comment exists at all
      const exists = await get(
        "SELECT id, user_id FROM comments WHERE id = ?",
        [id]
      );

      if (!exists) {
        return res.status(404).json({ ok: false, error: "Comment not found." });
      }
      if (Number(exists.user_id) !== Number(user_id)) {
        return res.status(403).json({ ok: false, error: "Not your comment." });
      }

      // Exists + same user + no changes => unchanged
      return res.status(200).json({ ok: true, unchanged: true });
    }

    const updated = await get(
      `
      SELECT
        id,
        user_id,
        username,
        content,
        created_at,
        updated_at,
        edited,
        kind,
        waypoint_id,
        route_id
      FROM comments
      WHERE id = ?
      `,
      [id]
    );

    res.json({ ok: true, comment: updated });
  } catch (err) {
    console.error("[offline] Error updating comment:", err);
    res.status(500).json({ ok: false, error: "Failed to update comment" });
  }
});

// -------------------------
// DELETE: ANY comment (author only, offline)
// Expect body: { user_id }
// -------------------------
router.delete("/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params;
    const id = Number(commentId);
    const user_id = Number(req.body.user_id);

    if (!user_id) {
      return res.status(400).json({ ok: false, error: "user_id is required." });
    }

    const existing = await get(
      "SELECT id, user_id FROM comments WHERE id = ? AND user_id = ?",
      [id, user_id]
    );

    if (!existing) {
      return res.status(403).json({ ok: false, error: "Not your comment" });
    }

    await run("DELETE FROM comments WHERE id = ?", [id]);

    res.json({ ok: true, deleted_id: id });
  } catch (err) {
    console.error("[offline] Error deleting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to delete comment" });
  }
});

module.exports = router;
