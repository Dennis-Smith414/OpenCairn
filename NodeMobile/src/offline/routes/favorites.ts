// src/offline/routes/favorites.ts
//
// React Native offline equivalents of offline/routes/favorites.js.
// No Express, no HTTP – just SQLite operations.

import { dbAll, dbGet, dbRun } from "../sqlite";

const toInt = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Get NON-DELETED favorite route IDs for a user (offline).
 * Mirrors GET /api/favorites/routes (offline).
 */
export async function getFavoriteRouteIdsOffline(
  userId: number
): Promise<number[]> {
  const uid = toInt(userId);
  if (!uid) throw new Error("Missing or invalid user id.");

  const rows = await dbAll<{ route_id: number }>(
    `
    SELECT route_id
      FROM route_favorites
     WHERE user_id = ?
       AND (sync_status IS NULL OR sync_status != 'deleted')
     ORDER BY created_at DESC
    `,
    [uid]
  );

  return rows.map((r) => r.route_id);
}

/**
 * Mark a route as favorite for the given user (offline).
 * Mirrors POST /api/favorites/routes/:routeId (offline).
 */
export async function addFavoriteRouteOffline(
  routeId: number,
  userId: number
): Promise<void> {
  const uid = toInt(userId);
  const rid = toInt(routeId);

  if (!uid) throw new Error("Missing or invalid user id.");
  if (!rid) throw new Error("Invalid route id.");

  // Ensure route exists offline (sanity check)
  const route = await dbGet<{ id: number }>(
    `
    SELECT id
      FROM routes
     WHERE id = ?
    `,
    [rid]
  );

  if (!route) {
    throw new Error("Route not found.");
  }

  // Check if favorite already exists
  const existing = await dbGet<{ sync_status: string | null }>(
    `
    SELECT sync_status
      FROM route_favorites
     WHERE user_id = ?
       AND route_id = ?
    `,
    [uid, rid]
  );

  if (!existing) {
    // brand new favorite, not yet synced
    await dbRun(
      `
      INSERT INTO route_favorites (
        user_id,
        route_id,
        created_at,
        sync_status
      )
      VALUES (
        ?, ?, datetime('now'), 'new'
      )
      `,
      [uid, rid]
    );
  } else if (existing.sync_status === "deleted") {
    // re-favoriting something we previously deleted → mark as dirty
    await dbRun(
      `
      UPDATE route_favorites
         SET sync_status = 'dirty',
             created_at  = datetime('now')
       WHERE user_id = ?
         AND route_id = ?
      `,
      [uid, rid]
    );
  } else {
    // already favorited (new/dirty/clean) → no-op
  }
}

/**
 * Remove a route from the user's favorites (offline).
 * Mirrors DELETE /api/favorites/routes/:routeId (offline).
 */
export async function removeFavoriteRouteOffline(
  routeId: number,
  userId: number
): Promise<void> {
  const uid = toInt(userId);
  const rid = toInt(routeId);

  if (!uid) throw new Error("Missing or invalid user id.");
  if (!rid) throw new Error("Invalid route id.");

  const existing = await dbGet<{ sync_status: string | null }>(
    `
    SELECT sync_status
      FROM route_favorites
     WHERE user_id = ?
       AND route_id = ?
    `,
    [uid, rid]
  );

  if (!existing) {
    // nothing to delete; it's fine to just return
    console.warn(
      "[offline] removeFavoriteRouteOffline: nothing to delete",
      { userId: uid, routeId: rid }
    );
    return;
  }

  if (existing.sync_status === "new") {
    // never synced → hard delete
    const result = await dbRun(
      `
      DELETE FROM route_favorites
       WHERE user_id = ?
         AND route_id = ?
      `,
      [uid, rid]
    );

    if (!result.rowsAffected) {
      throw new Error("Not found or not permitted.");
    }
  } else {
    // synced → tombstone for pushOnline
    await dbRun(
      `
      UPDATE route_favorites
         SET sync_status = 'deleted',
             created_at  = datetime('now')
       WHERE user_id = ?
         AND route_id = ?
      `,
      [uid, rid]
    );
  }
}
