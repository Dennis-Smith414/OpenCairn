// src/offline/routes/unsynced.ts
//
// RN equivalent of the old offline `/api/sync/route/:id/changes` and
// `/api/sync/route/:id/mark-clean` endpoints, matching offline/routes/unsynced.js.

import { dbAll, dbRun } from "../sqlite";

/**
 * Types reflecting what the OFFLINE DB returns for unsynced rows.
 * These mirror src/lib/syncOnline.ts types structurally.
 */

export interface OfflineWaypoint {
  id: number;
  route_id: number;
  sync_status: string;
  [key: string]: any;
}

export interface OfflineComment {
  id: number;
  kind: "waypoint" | "route";
  waypoint_id: number | null;
  route_id: number | null;
  sync_status: string;
  content: string;
  [key: string]: any;
}

export interface OfflineWaypointRating {
  user_id: number;
  waypoint_id: number;
  val: number;
  sync_status: string;
  [key: string]: any;
}

export interface OfflineRouteRating {
  user_id: number;
  route_id: number;
  val: number;
  sync_status: string;
  [key: string]: any;
}

export interface OfflineCommentRating {
  user_id: number;
  comment_id: number;
  val: number;
  sync_status: string;
  [key: string]: any;
}

export interface OfflineRouteFavorite {
  user_id: number;
  route_id: number;
  sync_status: string;
  [key: string]: any;
}

/**
 * Bundle shape identical to what the old offline route returned:
 *  GET /api/sync/route/:id/changes
 */
export interface OfflineChangeBundle {
  ok?: boolean;

  route_id: number;

  waypoints: OfflineWaypoint[];
  comments: OfflineComment[];

  ratings: {
    waypoint: OfflineWaypointRating[];
    route: OfflineRouteRating[];
    comment: OfflineCommentRating[];
  };

  favorites?: {
    route: OfflineRouteFavorite[];
  };
}

/**
 * Get all unsynced changes for a given route from the offline DB.
 * Equivalent to the old /api/sync/route/:id/changes endpoint.
 */
export async function getRouteChangesForRoute(
  routeId: number
): Promise<OfflineChangeBundle> {
  // 1) Unsynced waypoints for this route
  const waypoints = await dbAll<OfflineWaypoint>(
    `
    SELECT *
      FROM waypoints
     WHERE route_id = ?
       AND sync_status != 'clean'
    `,
    [routeId]
  );

// 2) Unsynced comments (route-level OR waypoint-level on this route)
const comments = await dbAll<OfflineComment>(
  `
    SELECT c.*
      FROM comments c
      LEFT JOIN waypoints w
        ON c.waypoint_id = w.id
     WHERE c.sync_status != 'clean'
       AND (
         c.route_id = ?
         OR (c.kind = 'waypoint' AND w.route_id = ?)
       )
  `,
  [routeId, routeId]
);


  // 3) Unsynced waypoint ratings for waypoints on this route
  const waypointRatings = await dbAll<OfflineWaypointRating>(
    `
    SELECT wr.*
      FROM waypoint_ratings wr
      JOIN waypoints w
        ON w.id = wr.waypoint_id
     WHERE w.route_id = ?
       AND wr.sync_status != 'clean'
    `,
    [routeId]
  );

  // 4) Unsynced route ratings for this route
  const routeRatings = await dbAll<OfflineRouteRating>(
    `
    SELECT *
      FROM route_ratings
     WHERE route_id = ?
       AND sync_status != 'clean'
    `,
    [routeId]
  );

// 5) Unsynced comment ratings for comments on this route
//    (route comments OR waypoint comments for this route)
const commentRatings = await dbAll<OfflineCommentRating>(
  `
    SELECT cr.*
      FROM comment_ratings cr
      JOIN comments c
        ON c.id = cr.comment_id
      LEFT JOIN waypoints w
        ON c.waypoint_id = w.id
     WHERE cr.sync_status != 'clean'
       AND (
         c.route_id = ?
         OR (c.kind = 'waypoint' AND w.route_id = ?)
       )
  `,
  [routeId, routeId]
);


  // 6) Unsynced route favorites for this route
  const routeFavorites = await dbAll<OfflineRouteFavorite>(
    `
    SELECT *
      FROM route_favorites
     WHERE route_id = ?
       AND sync_status != 'clean'
    `,
    [routeId]
  );

  return {
    ok: true,
    route_id: routeId,
    waypoints,
    comments,
    ratings: {
      waypoint: waypointRatings,
      route: routeRatings,
      comment: commentRatings,
    },
    favorites: {
      route: routeFavorites,
    },
  };
}

/**
 * Mark all rows for this route as "clean" and remove tombstones.
 * Equivalent to the old /api/sync/route/:id/mark-clean endpoint.
 */
export async function markRouteCleanForRoute(routeId: number): Promise<void> {
  // --- WAYPOINTS (owned by this route) ---
  // Delete waypoint tombstones
  await dbRun(
    `
    DELETE FROM waypoints
     WHERE route_id = ?
       AND sync_status = 'deleted'
    `,
    [routeId]
  );

  // Mark remaining new/dirty waypoints as clean
  await dbRun(
    `
    UPDATE waypoints
       SET sync_status = 'clean'
     WHERE route_id = ?
       AND sync_status IN ('new','dirty')
    `,
    [routeId]
  );

// --- COMMENTS (route-level + waypoint-level for this route) ---
await dbRun(
  `
    DELETE FROM comments
     WHERE sync_status = 'deleted'
       AND (
         route_id = ?
         OR (kind = 'waypoint' AND waypoint_id IN (
               SELECT id FROM waypoints WHERE route_id = ?
             ))
       )
  `,
  [routeId, routeId]
);

await dbRun(
  `
    UPDATE comments
       SET sync_status = 'clean'
     WHERE sync_status IN ('new','dirty')
       AND (
         route_id = ?
         OR (kind = 'waypoint' AND waypoint_id IN (
               SELECT id FROM waypoints WHERE route_id = ?
             ))
       )
  `,
  [routeId, routeId]
);


  // --- WAYPOINT RATINGS (ratings for waypoints on this route) ---
  // delete tombstones
  await dbRun(
    `
    DELETE FROM waypoint_ratings
     WHERE waypoint_id IN (
           SELECT id FROM waypoints WHERE route_id = ?
         )
       AND sync_status = 'deleted'
    `,
    [routeId]
  );

  // mark new/dirty as clean
  await dbRun(
    `
    UPDATE waypoint_ratings
       SET sync_status = 'clean'
     WHERE waypoint_id IN (
           SELECT id FROM waypoints WHERE route_id = ?
         )
       AND sync_status IN ('new','dirty')
    `,
    [routeId]
  );

  // --- ROUTE RATINGS (ratings for this route) ---
  await dbRun(
    `
    DELETE FROM route_ratings
     WHERE route_id = ?
       AND sync_status = 'deleted'
    `,
    [routeId]
  );

  await dbRun(
    `
    UPDATE route_ratings
       SET sync_status = 'clean'
     WHERE route_id = ?
       AND sync_status IN ('new','dirty')
    `,
    [routeId]
  );

 // --- COMMENT RATINGS (ratings for comments on this route) ---
 await dbRun(
   `
     DELETE FROM comment_ratings
      WHERE comment_id IN (
            SELECT c.id
              FROM comments c
              LEFT JOIN waypoints w ON c.waypoint_id = w.id
             WHERE c.route_id = ?
                OR (c.kind = 'waypoint' AND w.route_id = ?)
          )
        AND sync_status = 'deleted'
   `,
   [routeId, routeId]
 );

 await dbRun(
   `
     UPDATE comment_ratings
        SET sync_status = 'clean'
      WHERE comment_id IN (
            SELECT c.id
              FROM comments c
              LEFT JOIN waypoints w ON c.waypoint_id = w.id
             WHERE c.route_id = ?
                OR (c.kind = 'waypoint' AND w.route_id = ?)
          )
        AND sync_status IN ('new','dirty')
   `,
   [routeId, routeId]
 );


  // --- ROUTE FAVORITES (favorites for this route) ---
  await dbRun(
    `
    DELETE FROM route_favorites
     WHERE route_id = ?
       AND sync_status = 'deleted'
    `,
    [routeId]
  );

  await dbRun(
    `
    UPDATE route_favorites
       SET sync_status = 'clean'
     WHERE route_id = ?
       AND sync_status IN ('new','dirty')
    `,
    [routeId]
  );

  // --- ROUTE METADATA (offline routes table) ---
  await dbRun(
    `
    UPDATE routes
       SET sync_status   = 'clean',
           last_synced_at = datetime('now')
     WHERE id = ?
    `,
    [routeId]
  );
}
