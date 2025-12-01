// src/lib/syncOnline.ts
import { apiFetch } from "./http";
import {
  getRouteChangesForRoute,
  markRouteCleanForRoute,
  OfflineChangeBundle,
} from "../offline/routes/unsynced";

/**
 * Types reflecting what the OFFLINE server returns.
 * (We keep these here for now; they structurally match the unsynced module.)
 */

export interface OfflineWaypoint {
  id: number;
  route_id: number;
  sync_status: string;
  // other fields (name, description, lat, lon, etc.) are forwarded as-is
  [key: string]: any;
}

export interface OfflineComment {
  id: number;
  kind: "waypoint" | "route";
  waypoint_id: number | null;
  route_id: number | null;
  sync_status: string;
  content: string;
  // other fields (user_id, username, rating, created_at, etc.)
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
 * Shape returned by OFFLINE route:
 *   GET /api/sync/route/:id/changes
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
 * Payload shape expected by REMOTE upload endpoint:
 *   POST /api/upload/push
 */
export interface UploadRatingsPayloadEntry {
  target_id: number;
  rating: number;
  sync_status: string;
  [key: string]: any;
}

export interface UploadFavoritesPayloadEntry {
  target_id: number;
  sync_status: string;
  [key: string]: any;
}

export interface UploadPayload {
  waypoints: OfflineWaypoint[];
  comments: OfflineComment[];
  ratings: {
    waypoint: UploadRatingsPayloadEntry[];
    route: UploadRatingsPayloadEntry[];
    comment: UploadRatingsPayloadEntry[];
  };
  favorites: {
    route: UploadFavoritesPayloadEntry[];
  };
}

/**
 * Push local offline edits for a route back to the REMOTE server.
 *
 * - routeId: route to sync
 * - token: JWT from your online login
 */
export async function syncRouteToOnline(
  routeId: number,
  token: string
): Promise<void> {
  if (!token) {
    throw new Error("syncRouteToOnline: token is required.");
  }

  // 1) Ask OFFLINE DB (not HTTP) for all unsynced changes on this route
  const changes = await getRouteChangesForRoute(routeId);

  // Guard in case ratings/favorites objects are missing
  const ratings = changes.ratings || {
    waypoint: [],
    route: [],
    comment: [],
  };
  const favorites = changes.favorites || {
    route: [],
  };

  // Short-circuit: nothing to do
  const hasWaypointChanges = (changes.waypoints?.length ?? 0) > 0;
  const hasCommentChanges = (changes.comments?.length ?? 0) > 0;

  const hasRatingChanges =
    (ratings.waypoint?.length ?? 0) > 0 ||
    (ratings.route?.length ?? 0) > 0 ||
    (ratings.comment?.length ?? 0) > 0;

  const hasFavoriteChanges = (favorites.route?.length ?? 0) > 0;

  if (
    !hasWaypointChanges &&
    !hasCommentChanges &&
    !hasRatingChanges &&
    !hasFavoriteChanges
  ) {
    console.log("[syncRouteToOnline] no changes to push");
    return;
  }

  // 2) Build payload for REMOTE upload endpoint
  const uploadPayload: UploadPayload = {
    waypoints: changes.waypoints,
    comments: changes.comments,
    ratings: {
      waypoint: (ratings.waypoint || []).map((r) => ({
        target_id: r.waypoint_id,
        rating: r.val,
        sync_status: r.sync_status,
      })),
      route: (ratings.route || []).map((r) => ({
        target_id: r.route_id,
        rating: r.val,
        sync_status: r.sync_status,
      })),
      comment: (ratings.comment || []).map((r) => ({
        target_id: r.comment_id,
        rating: r.val,
        sync_status: r.sync_status,
      })),
    },
    favorites: {
      route: (favorites.route || []).map((f) => ({
        target_id: f.route_id,
        sync_status: f.sync_status,
      })),
    },
  };

  // 3) Push those changes to the REMOTE server
  await apiFetch<{ ok: boolean }>("remote", `/api/upload/push`, {
    method: "POST",
    body: JSON.stringify(uploadPayload),
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // 4) Mark all those rows as "clean" in the OFFLINE DB
  await markRouteCleanForRoute(routeId);

  console.log("[syncRouteToOnline] sync complete for route", routeId);
}
