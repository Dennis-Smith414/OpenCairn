// src/offline/routes/download.ts
// Handles syncing a full route bundle from the REMOTE server into
// the offline SQLite DB.
// which you can call from your RN code when you receive a bundle
// from the online server.

import { dbRun } from "../sqlite";
import {
  OfflineRouteBundle,
  OfflineGpxRow,
  OfflineWaypointRow,
  OfflineCommentRow,
  OfflineRouteFavoriteRow,
} from "../types";

const toInt = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Save a full route bundle into the offline DB, replacing any
 * existing data for that route (gpx, waypoints, comments, favorites).
 *
 * Mirrors the logic of offline/routes/download.js but as a pure
 * function with explicit transaction handling.
 *
 * @throws Error if validation fails or the transaction fails
 * @returns the numeric routeId that was synced
 */
export async function saveRouteBundleToOffline(
  bundle: OfflineRouteBundle
): Promise<number> {
  const { route, gpx, waypoints, comments, favorites } = bundle || {};

  if (!route || route.id == null) {
    throw new Error("Missing route or route.id in payload");
  }

  const routeId = toInt((route as any).id);
  if (!routeId) {
    throw new Error("Invalid route.id");
  }

  const gpxRows: OfflineGpxRow[] = Array.isArray(gpx) ? gpx : [];
  const waypointRows: OfflineWaypointRow[] = Array.isArray(waypoints)
    ? waypoints
    : [];
  const commentRows: OfflineCommentRow[] = Array.isArray(comments)
    ? comments
    : [];
  const favoriteRouteRows: OfflineRouteFavoriteRow[] =
    favorites && Array.isArray(favorites.route) ? favorites.route : [];

  try {
    // Start transaction
    await dbRun("BEGIN");

    // -------------------------------------------------
    // 1) Clear existing child data for this route
    // -------------------------------------------------
    await dbRun(`DELETE FROM gpx WHERE route_id = ?`, [routeId]);
    await dbRun(`DELETE FROM waypoints WHERE route_id = ?`, [routeId]);
    await dbRun(`DELETE FROM comments WHERE route_id = ?`, [routeId]);
    // (waypoint comments + ratings are already cascade-deleted via waypoints)

    // -------------------------------------------------
    // 2) Upsert route row
    // -------------------------------------------------
    // SQLite routes schema:
    // id, user_id, username, slug, name, description, region,
    // rating, created_at, updated_at

    const {
      user_id = null,
      slug,
      name,
      description = null,
      region = null,
      rating = 0,
      created_at,
      updated_at,
    } = route;

    if (!slug || !name) {
      await dbRun("ROLLBACK");
      throw new Error("route.slug and route.name are required in payload");
    }

    await dbRun(
      `
      INSERT INTO routes (
        id,
        user_id,
        username,
        slug,
        name,
        description,
        region,
        rating,
        created_at,
        updated_at
      )
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id    = excluded.user_id,
        slug       = excluded.slug,
        name       = excluded.name,
        description= excluded.description,
        region     = excluded.region,
        rating     = excluded.rating,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
      `,
      [
        routeId,
        user_id ?? null,
        slug,
        name,
        description,
        region,
        rating ?? 0,
        created_at || new Date().toISOString(),
        updated_at || new Date().toISOString(),
      ]
    );

    // -------------------------------------------------
    // 2b) Upsert route_favorites for this route
    // -------------------------------------------------
    // route_favorites(user_id, route_id, sync_status)

    // Clear any existing favorites for this route
    await dbRun(
      `
        DELETE FROM route_favorites
         WHERE route_id = ?
      `,
      [routeId]
    );

    // Insert any favorites we got from the remote payload
    for (const fav of favoriteRouteRows) {
      const uid = toInt(fav.user_id);
      if (!uid) continue;

      await dbRun(
        `
        INSERT INTO route_favorites (user_id, route_id, sync_status)
        VALUES (?, ?, 'clean')
        ON CONFLICT(user_id, route_id) DO UPDATE SET
          sync_status = 'clean'
        `,
        [uid, routeId]
      );
    }

    // -------------------------------------------------
    // 3) Insert GPX rows
    // -------------------------------------------------
    // SQLite gpx schema:
    // id, route_id, name, geometry (TEXT), file (BLOB/TEXT), created_at

    for (const g of gpxRows) {
      const gName = g.name ?? null;
      const gGeom =
        typeof g.geometry === "string"
          ? g.geometry
          : JSON.stringify(g.geometry);
      const gFile =
        g.file != null
          ? typeof g.file === "string"
            ? g.file
            : JSON.stringify(g.file)
          : gGeom;
      const gCreated = g.created_at || new Date().toISOString();

      await dbRun(
        `
        INSERT INTO gpx (
          route_id,
          name,
          geometry,
          file,
          created_at
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [routeId, gName, gGeom, gFile, gCreated]
      );
    }

    // -------------------------------------------------
    // 4) Upsert waypoints
    // -------------------------------------------------
    // SQLite waypoints schema:
    // id, route_id, user_id, username, name, description,
    // lat, lon, type, rating, created_at, updated_at

    for (const w of waypointRows) {
      if (!w || (w as any).id == null) continue;
      const wid = toInt((w as any).id);
      if (!wid) continue;

      const wUserId = w.user_id ?? null;
      const wUserName = w.username ?? null;
      const wName = (w.name ?? "").toString().trim();
      if (!wName) continue;

      const wDesc = w.description ?? null;
      const wLat = w.lat != null ? Number(w.lat) : null;
      const wLon = w.lon != null ? Number(w.lon) : null;
      const wType = w.type ?? null;
      const wRating = w.rating ?? 0;
      const wCreated = w.created_at || new Date().toISOString();
      const wUpdated = w.updated_at || new Date().toISOString();

      await dbRun(
        `
        INSERT INTO waypoints (
          id,
          route_id,
          user_id,
          username,
          name,
          description,
          lat,
          lon,
          type,
          rating,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          route_id    = excluded.route_id,
          user_id     = excluded.user_id,
          username    = excluded.username,
          name        = excluded.name,
          description = excluded.description,
          lat         = excluded.lat,
          lon         = excluded.lon,
          type        = excluded.type,
          rating      = excluded.rating,
          created_at  = excluded.created_at,
          updated_at  = excluded.updated_at
        `,
        [
          wid,
          routeId,
          wUserId,
          wUserName,
          wName,
          wDesc,
          wLat,
          wLon,
          wType,
          wRating,
          wCreated,
          wUpdated,
        ]
      );
    }

    // -------------------------------------------------
    // 5) Upsert comments
    // -------------------------------------------------
    // SQLite comments schema:
    // id, user_id, username, kind, waypoint_id, route_id,
    // content, rating, created_at, updated_at, edited

    for (const c of commentRows) {
      if (!c || (c as any).id == null) continue;
      const cid = toInt((c as any).id);
      if (!cid) continue;

      const kind = c.kind === "waypoint" ? "waypoint" : "route";

      const waypoint_id =
        kind === "waypoint" && c.waypoint_id != null
          ? toInt(c.waypoint_id)
          : null;
      const cRouteId =
        kind === "route" && c.route_id != null ? toInt(c.route_id) : null;

      const user_id = c.user_id ?? null;
      const username = c.username ?? null;
      const content = (c.content ?? "").toString().trim();
      if (!content) continue;

      const rating = c.rating ?? 0;
      const created_at = c.created_at || new Date().toISOString();
      const updated_at = c.updated_at || new Date().toISOString();
      const edited = c.edited ? 1 : 0;

      await dbRun(
        `
        INSERT INTO comments (
          id,
          user_id,
          username,
          kind,
          waypoint_id,
          route_id,
          content,
          rating,
          created_at,
          updated_at,
          edited
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id    = excluded.user_id,
          username   = excluded.username,
          kind       = excluded.kind,
          waypoint_id= excluded.waypoint_id,
          route_id   = excluded.route_id,
          content    = excluded.content,
          rating     = excluded.rating,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          edited     = excluded.edited
        `,
        [
          cid,
          user_id,
          username,
          kind,
          waypoint_id,
          cRouteId,
          content,
          rating,
          created_at,
          updated_at,
          edited,
        ]
      );
    }

    await dbRun("COMMIT");

    return routeId;
  } catch (err) {
    console.error("[offline] saveRouteBundleToOffline error:", err);
    try {
      await dbRun("ROLLBACK");
    } catch (rollbackErr) {
      console.error("[offline] ROLLBACK error:", rollbackErr);
    }
    throw err;
  }
}