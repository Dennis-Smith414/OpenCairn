// src/offline/routes/waypoints.ts
//
// React Native offline equivalents of the old offline/routes/waypoints.js
// endpoints. No Express, no HTTP – just plain functions over SQLite.

import { dbAll, dbGet, dbRun } from "../sqlite";
import { OfflineWaypointRow } from "../types";

export interface OfflineWaypointInsertOptions {
  routeId: number;
  userId: number;
  username?: string | null;
  name: string;
  description?: string | null;
  lat: number;
  lon: number;
  type?: string | null;
}

/**
 * Get all NON-DELETED waypoints for a given route (offline).
 * Mirrors GET /api/waypoints/route/:route_id (offline).
 */
export async function fetchWaypointsByRouteOffline(
  routeId: number
): Promise<OfflineWaypointRow[]> {
  const result = await dbAll<OfflineWaypointRow & { route_name?: string }>(
    `
      SELECT
        w.*,
        r.name AS route_name
      FROM waypoints w
      LEFT JOIN routes r ON r.id = w.route_id
      WHERE w.route_id = ?
        AND (w.sync_status IS NULL OR w.sync_status != 'deleted')
      ORDER BY w.created_at DESC
    `,
    [Number(routeId)]
  );

  return result;
}

/**
 * Fetch a single NON-DELETED waypoint by id (offline).
 * Mirrors GET /api/waypoints/:id (offline).
 */
export async function fetchWaypointOffline(
  id: number
): Promise<OfflineWaypointRow & { route_name?: string }> {
  const waypoint = await dbGet<OfflineWaypointRow & { route_name?: string }>(
    `
      SELECT
        w.*,
        r.name AS route_name
      FROM waypoints w
      LEFT JOIN routes r ON r.id = w.route_id
      WHERE w.id = ?
        AND (w.sync_status IS NULL OR w.sync_status != 'deleted')
    `,
    [Number(id)]
  );

  if (!waypoint) {
    throw new Error("Waypoint not found.");
  }

  return waypoint;
}

/**
 * Create a waypoint (offline).
 * Mirrors POST /api/waypoints (offline).
 */
export async function createWaypointOffline(
  opts: OfflineWaypointInsertOptions
): Promise<OfflineWaypointRow & { route_name?: string }> {
  const route_id = Number(opts.routeId);
  const user_id = Number(opts.userId);
  const name = (opts.name ?? "").trim();
  const description =
    opts.description === undefined || opts.description === null
      ? null
      : String(opts.description) || null;
  const lat = Number(opts.lat);
  const lon = Number(opts.lon);
  const type = (opts.type ?? "generic").toString();
  const username = (opts.username ?? "").trim() || "UnknownUser";

  if (!route_id || !name || Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error("Missing required fields: route_id, name, lat, lon.");
  }
  if (!user_id) {
    throw new Error("Missing or invalid user id.");
  }

  const result = await dbRun(
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
        created_at,
        updated_at,
        sync_status
      )
      VALUES (
        NULL,
        ?, ?, ?, ?, ?, ?, ?, ?,
        datetime('now'),
        datetime('now'),
        'new'
      )
    `,
    [route_id, user_id, username, name, description, lat, lon, type]
  );

  const insertedId = result.insertId;
  if (!insertedId) {
    throw new Error("Failed to insert waypoint.");
  }

  const waypoint = await dbGet<OfflineWaypointRow & { route_name?: string }>(
    `
      SELECT
        w.*,
        r.name AS route_name
      FROM waypoints w
      LEFT JOIN routes r ON r.id = w.route_id
      WHERE w.id = ?
    `,
    [insertedId]
  );

  if (!waypoint) {
    throw new Error("Inserted waypoint not found.");
  }

  return waypoint;
}

/**
 * Update a waypoint (owner-only, partial update, offline).
 * Mirrors PATCH /api/waypoints/:id (offline).
 */
export async function updateWaypointOffline(
  id: number,
  userId: number,
  patch: Partial<{
    route_id: number;
    name: string;
    description: string | null;
    lat: number;
    lon: number;
    type: string;
  }>
): Promise<OfflineWaypointRow & { route_name?: string }> {
  const waypointId = Number(id);
  const user_id = Number(userId);

  if (!waypointId) {
    throw new Error("Invalid waypoint id.");
  }
  if (!user_id) {
    throw new Error("Missing or invalid user id.");
  }

  let { route_id, name, description, lat, lon, type } = patch;

  if (route_id != null) route_id = Number(route_id);
  if (name != null) name = String(name).trim();
  if (description !== undefined) {
    description = description === "" ? null : String(description);
  }
  if (lat != null) lat = Number(lat);
  if (lon != null) lon = Number(lon);
  if (type != null) type = String(type);

  const sets: string[] = [];
  const params: any[] = [];

  const add = (fragment: string, value: any) => {
    sets.push(fragment);
    params.push(value);
  };

  if (route_id != null) add("route_id = ?", route_id);
  if (name != null) add("name = ?", name);
  if (description !== undefined) add("description = ?", description);
  if (lat != null) add("lat = ?", lat);
  if (lon != null) add("lon = ?", lon);
  if (type != null) add("type = ?", type);

  if (sets.length === 0) {
    throw new Error("No fields to update.");
  }

  // Always bump updated_at + adjust sync_status
  sets.push("updated_at = datetime('now')");
  sets.push(
    `sync_status = CASE
       WHEN sync_status = 'new' THEN 'new'
       ELSE 'dirty'
     END`
  );

  const sql = `
    UPDATE waypoints
       SET ${sets.join(", ")}
     WHERE id = ?
       AND user_id = ?
  `;
  params.push(waypointId, user_id);

  const result = await dbRun(sql, params);

  if (!result.rowsAffected) {
    throw new Error("Not found or not permitted.");
  }

  const waypoint = await dbGet<OfflineWaypointRow & { route_name?: string }>(
    `
      SELECT
        w.*,
        r.name AS route_name
      FROM waypoints w
      LEFT JOIN routes r ON r.id = w.route_id
      WHERE w.id = ?
    `,
    [waypointId]
  );

  if (!waypoint) {
    throw new Error("Updated waypoint not found.");
  }

  return waypoint;
}

/**
 * Delete a waypoint (owner-only, offline).
 * Mirrors DELETE /api/waypoints/:id (offline).
 *
 * Returns the deleted id.
 */
export async function deleteWaypointOffline(
  id: number,
  userId: number
): Promise<number> {
  const waypointId = Number(id);
  const user_id = Number(userId);

  if (!waypointId) {
    throw new Error("Missing or invalid waypoint id.");
  }
  if (!user_id) {
    throw new Error("Missing or invalid user id.");
  }

  const existing = await dbGet<{
    id: number;
    user_id: number;
    sync_status: string | null;
  }>(
    `
      SELECT id, user_id, sync_status
      FROM waypoints
      WHERE id = ?
        AND user_id = ?
    `,
    [waypointId, user_id]
  );

  if (!existing) {
    throw new Error("Not found or not permitted.");
  }

  if (existing.sync_status === "new") {
    const result = await dbRun(
      `
        DELETE FROM waypoints
         WHERE id = ?
           AND user_id = ?
      `,
      [waypointId, user_id]
    );

    if (!result.rowsAffected) {
      throw new Error("Not found or not permitted.");
    }
  } else {
    await dbRun(
      `
        UPDATE waypoints
           SET sync_status = 'deleted',
               updated_at  = datetime('now')
         WHERE id = ?
           AND user_id = ?
      `,
      [waypointId, user_id]
    );
  }

  return waypointId;
}
