// offline/routes/comments.js
const express = require("express");
const router = express.Router();
const { all, get, run } = require("../db/queries");
const authorize = require("../middleware/authorize");

// -------------------------
// GET: comments for a waypoint (offline)
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
        AND c.sync_status != 'deleted'
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
// GET: comments for a route (offline)
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
        AND c.sync_status != 'deleted'
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
// Expect body: { content }  (username optional; can come from JWT)
// -------------------------
router.post("/waypoints/:waypointId", authorize, async (req, res) => {
  try {
    const { waypointId } = req.params;
    const waypoint_id = Number(waypointId);

    const user_id = Number(req.user?.id);
    const username = (req.user?.username ?? req.body.username ?? "").trim();
    const content = (req.body.content ?? "").trim();

    if (!user_id) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing or invalid user id." });
    }
    if (!content) {
      return res
        .status(400)
        .json({ ok: false, error: "Content is required." });
    }

    // Insert comment as "new" for sync
    const result = await run(
      `
      INSERT INTO comments (user_id, username, kind, waypoint_id, route_id, content, sync_status)
      VALUES (?, ?, 'waypoint', ?, NULL, ?, 'new')
      `,
      [user_id, username || "UnknownUser", waypoint_id, content]
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
// Expect body: { content }  (username optional; can come from JWT)
// -------------------------
router.post("/routes/:routeId", authorize, async (req, res) => {
  try {
    const { routeId } = req.params;
    const route_id = Number(routeId);

    const user_id = Number(req.user?.id);
    const username = (req.user?.username ?? req.body.username ?? "").trim();
    const content = (req.body.content ?? "").trim();

    if (!user_id) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing or invalid user id." });
    }
    if (!content) {
      return res
        .status(400)
        .json({ ok: false, error: "Content is required." });
    }

    const result = await run(
      `
      INSERT INTO comments (user_id, username, kind, waypoint_id, route_id, content, sync_status)
      VALUES (?, ?, 'route', NULL, ?, ?, 'new')
      `,
      [user_id, username || "UnknownUser", route_id, content]
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
// Expect body: { content }   (user comes from JWT)
// -------------------------
router.patch("/:commentId", authorize, async (req, res) => {
  try {
    const { commentId } = req.params;
    const id = Number(commentId);
    const user_id = Number(req.user?.id);
    const trimmed = (req.body.content ?? "").trim();

    if (!user_id) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing or invalid user id." });
    }

    if (!trimmed) {
      return res
        .status(400)
        .json({ ok: false, error: "Content cannot be empty." });
    }
    if (trimmed.length > 5000) {
      return res
        .status(400)
        .json({ ok: false, error: "Content too long." });
    }

    // Update content and mark as dirty unless it was still "new"
    const result = await run(
      `
      UPDATE comments
         SET content    = ?,
             updated_at = datetime('now'),
             edited     = CASE WHEN content <> ? THEN 1 ELSE edited END,
             sync_status = CASE
                             WHEN sync_status = 'new' THEN 'new'
                             ELSE 'dirty'
                           END
       WHERE id      = ?
         AND user_id = ?
         AND content <> ?
      `,
      [trimmed, trimmed, id, user_id, trimmed]
    );

    if (!result.changes) {
      const exists = await get(
        "SELECT id, user_id FROM comments WHERE id = ?",
        [id]
      );

      if (!exists) {
        return res
          .status(404)
          .json({ ok: false, error: "Comment not found." });
      }
      if (Number(exists.user_id) !== Number(user_id)) {
        return res
          .status(403)
          .json({ ok: false, error: "Not your comment." });
      }

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
// user id comes from JWT
// -------------------------
router.delete("/:commentId", authorize, async (req, res) => {
  try {
    const { commentId } = req.params;
    const id = Number(commentId);
    const user_id = Number(req.user?.id);

    if (!user_id) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing or invalid user id." });
    }

    const existing = await get(
      "SELECT id, user_id, sync_status FROM comments WHERE id = ? AND user_id = ?",
      [id, user_id]
    );

    if (!existing) {
      return res
        .status(403)
        .json({ ok: false, error: "Not your comment" });
    }

    // If the comment was never synced, we can hard delete it.
    // If it was already synced (clean/dirty), mark as 'deleted' for the next upload.
    if (existing.sync_status === "new") {
      await run("DELETE FROM comments WHERE id = ?", [id]);
    } else {
      await run(
        "UPDATE comments SET sync_status = 'deleted' WHERE id = ?",
        [id]
      );
    }

    res.json({ ok: true, deleted_id: id });
  } catch (err) {
    console.error("[offline] Error deleting comment:", err);
    res.status(500).json({ ok: false, error: "Failed to delete comment" });
  }
});

module.exports = router;
