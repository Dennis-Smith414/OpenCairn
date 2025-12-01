// src/offline/routes/files.ts
//
// React Native offline equivalents of offline/routes/files.js.
// No Express – just direct SQLite operations over the offline DB.

import { dbAll, dbGet, dbRun } from "../sqlite";

const toInt = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Shape of rows returned by our queries (matches OfflineRouteInfo-ish)
export interface OfflineRouteRow {
  id: number;
  user_id?: number | null;
  username?: string | null;
  slug?: string;
  name: string;
  description?: string | null;
  region?: string | null;
  rating?: number | null;

  waypoint_count: number;
  comment_count: number;

  last_synced_at: string | null;
  created_at?: string;
  updated_at?: string;

  sync_status?: string | null;
}

/**
 * List all offline routes + waypoint/comment counts.
 * Mirrors GET /api/files/routes (offline).
 */
export async function listOfflineRoutes(): Promise<OfflineRouteRow[]> {
  const rows = await dbAll<OfflineRouteRow>(
    `
      SELECT
        r.*,
        (SELECT COUNT(*) FROM waypoints w WHERE w.route_id = r.id) AS waypoint_count,
        (SELECT COUNT(*) FROM comments c WHERE c.route_id = r.id) AS comment_count
      FROM routes r
      ORDER BY r.name ASC
    `
  );
  return rows;
}

/**
 * Bump last_synced_at for a route and return the updated row.
 * Mirrors POST /api/files/routes/:id/resync (offline).
 */
export async function resyncOfflineRoute(
  routeId: number
): Promise<OfflineRouteRow | null> {
  const id = toInt(routeId);
  if (!id) {
    throw new Error("Invalid route id");
  }

  await dbRun(
    `
      UPDATE routes
         SET last_synced_at = datetime('now')
       WHERE id = ?
    `,
    [id]
  );

  const route = await dbGet<OfflineRouteRow>(
    `
      SELECT
        r.*,
        (SELECT COUNT(*) FROM waypoints w WHERE w.route_id = r.id) AS waypoint_count,
        (SELECT COUNT(*) FROM comments c WHERE c.route_id = r.id) AS comment_count
      FROM routes r
      WHERE r.id = ?
    `,
    [id]
  );

  return route ?? null;
}

/**
 * Remove a route and its offline data from SQLite.
 * Mirrors POST /api/files/routes/:id/remove (offline).
 */
export async function deleteOfflineRoute(routeId: number): Promise<void> {
  const id = toInt(routeId);
  if (!id) {
    throw new Error("Invalid route id");
  }

  try {
    await dbRun("BEGIN");

    // Explicit deletes for safety; you can rely on CASCADE instead if your schema supports it.
    await dbRun(`DELETE FROM comments WHERE route_id = ?`, [id]);
    await dbRun(`DELETE FROM waypoints WHERE route_id = ?`, [id]);
    await dbRun(`DELETE FROM routes WHERE id = ?`, [id]);

    await dbRun("COMMIT");
  } catch (err) {
    console.error("[offline] deleteOfflineRoute error:", err);
    try {
      await dbRun("ROLLBACK");
    } catch (rollbackErr) {
      console.error("[offline] ROLLBACK failed:", rollbackErr);
    }
    throw new Error("Failed to remove offline route");
  }
}
