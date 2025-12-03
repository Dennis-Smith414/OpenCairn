// src/offline/routes/comments.ts
//
// React Native offline equivalents of the old offline/routes/comments.js
// endpoints. No Express, no HTTP – just plain functions over SQLite.

import { dbAll, dbGet, dbRun } from "../sqlite";
import { OfflineCommentRow } from "../types";

export type OfflineCommentKind = "waypoint" | "route";

export interface OfflineCommentInsertOptions {
  userId: number;
  username?: string | null;
  content: string;
}

/**
 * Get comments for a waypoint (offline).
 * Mirrors GET /api/comments/waypoints/:waypointId (offline).
 */
export async function fetchWaypointCommentsOffline(
  waypointId: number
): Promise<OfflineCommentRow[]> {
  const rows = await dbAll<OfflineCommentRow>(
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
        c.route_id,
        c.rating
      FROM comments c
      WHERE c.kind = 'waypoint'
        AND c.waypoint_id = ?
        AND (c.sync_status IS NULL OR c.sync_status != 'deleted')
      ORDER BY c.created_at DESC
      `,
    [Number(waypointId)]
  );
  return rows;
}

/**
 * Get comments for a route (offline).
 * Mirrors GET /api/comments/routes/:routeId (offline).
 */
export async function fetchRouteCommentsOffline(
  routeId: number
): Promise<OfflineCommentRow[]> {
  const rows = await dbAll<OfflineCommentRow>(
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
        c.route_id,
        c.rating
      FROM comments c
      WHERE c.kind = 'route'
        AND c.route_id = ?
        AND (c.sync_status IS NULL OR c.sync_status != 'deleted')
      ORDER BY c.created_at DESC
      `,
    [Number(routeId)]
  );
  return rows;
}

/**
 * Add a WAYPOINT comment (offline).
 * Mirrors POST /api/comments/waypoints/:waypointId (offline).
 */
export async function createWaypointCommentOffline(
  waypointId: number,
  opts: OfflineCommentInsertOptions
): Promise<OfflineCommentRow> {
  const waypoint_id = Number(waypointId);
  const user_id = Number(opts.userId);
  const username = (opts.username ?? "").trim() || "UnknownUser";
  const content = (opts.content ?? "").trim();

  if (!user_id) {
    throw new Error("Missing or invalid user id.");
  }
  if (!content) {
    throw new Error("Content is required.");
  }

  const result = await dbRun(
    `
      INSERT INTO comments (user_id, username, kind, waypoint_id, route_id, content, sync_status)
      VALUES (?, ?, 'waypoint', ?, NULL, ?, 'new')
      `,
    [user_id, username, waypoint_id, content]
  );

  const commentId = result.insertId;
  if (!commentId) {
    throw new Error("Failed to insert comment.");
  }

  const comment = await dbGet<OfflineCommentRow>(
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
        route_id,
        rating
      FROM comments
      WHERE id = ?
      `,
    [commentId]
  );

  if (!comment) {
    throw new Error("Inserted comment not found.");
  }

  return comment;
}

/**
 * Add a ROUTE comment (offline).
 * Mirrors POST /api/comments/routes/:routeId (offline).
 */
export async function createRouteCommentOffline(
  routeId: number,
  opts: OfflineCommentInsertOptions
): Promise<OfflineCommentRow> {
  const route_id = Number(routeId);
  const user_id = Number(opts.userId);
  const username = (opts.username ?? "").trim() || "UnknownUser";
  const content = (opts.content ?? "").trim();

  if (!user_id) {
    throw new Error("Missing or invalid user id.");
  }
  if (!content) {
    throw new Error("Content is required.");
  }

  const result = await dbRun(
    `
      INSERT INTO comments (user_id, username, kind, waypoint_id, route_id, content, sync_status)
      VALUES (?, ?, 'route', NULL, ?, ?, 'new')
      `,
    [user_id, username, route_id, content]
  );

  const commentId = result.insertId;
  if (!commentId) {
    throw new Error("Failed to insert comment.");
  }

  const comment = await dbGet<OfflineCommentRow>(
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
        route_id,
        rating
      FROM comments
      WHERE id = ?
      `,
    [commentId]
  );

  if (!comment) {
    throw new Error("Inserted comment not found.");
  }

  return comment;
}

/**
 * Update ANY comment (author only, offline).
 * Mirrors PATCH /api/comments/:commentId (offline).
 *
 * Returns the updated comment, or `null` if unchanged
 * (e.g., same content as before).
 */
export async function updateCommentOffline(
  commentId: number,
  userId: number,
  content: string
): Promise<OfflineCommentRow | null> {
  const id = Number(commentId);
  const user_id = Number(userId);
  const trimmed = (content ?? "").trim();

  if (!user_id) {
    throw new Error("Missing or invalid user id.");
  }
  if (!trimmed) {
    throw new Error("Content cannot be empty.");
  }
  if (trimmed.length > 5000) {
    throw new Error("Content too long.");
  }

  const result = await dbRun(
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

  if (!result.rowsAffected) {
    // Check if comment exists and belongs to this user
    const exists = await dbGet<{ id: number; user_id: number }>(
      "SELECT id, user_id FROM comments WHERE id = ?",
      [id]
    );

    if (!exists) {
      throw new Error("Comment not found.");
    }
    if (Number(exists.user_id) !== Number(user_id)) {
      throw new Error("Not your comment.");
    }

    // No changes (content same)
    return null;
  }

  const updated = await dbGet<OfflineCommentRow>(
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
        route_id,
        rating
      FROM comments
      WHERE id = ?
      `,
    [id]
  );

  if (!updated) {
    throw new Error("Updated comment not found.");
  }

  return updated;
}

/**
 * Delete ANY comment (author only, offline).
 * Mirrors DELETE /api/comments/:commentId (offline).
 *
 * Returns the deleted id on success.
 */
export async function deleteCommentOffline(
  commentId: number,
  userId: number
): Promise<number> {
  const id = Number(commentId);
  const user_id = Number(userId);

  if (!user_id) {
    throw new Error("Missing or invalid user id.");
  }

  const existing = await dbGet<{
    id: number;
    user_id: number;
    sync_status: string | null;
  }>(
    "SELECT id, user_id, sync_status FROM comments WHERE id = ? AND user_id = ?",
    [id, user_id]
  );

  if (!existing) {
    throw new Error("Not your comment.");
  }

  if (existing.sync_status === "new") {
    await dbRun("DELETE FROM comments WHERE id = ?", [id]);
  } else {
    await dbRun("UPDATE comments SET sync_status = 'deleted' WHERE id = ?", [
      id,
    ]);
  }

  return id;
}
