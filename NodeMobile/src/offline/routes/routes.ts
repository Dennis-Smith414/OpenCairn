// src/offline/routes/routes.ts
//
// React Native offline equivalents of offline/routes/routes.js.
// No Express, no HTTP – just direct SQLite access.

import { dbAll, dbGet, dbRun } from "../sqlite";

const toInt = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Basic route shape as stored in SQLite
export interface OfflineRoute {
  id: number;
  slug: string;
  name: string;
  region: string | null;
  user_id: number | null;
  username: string | null;
  rating: number | null;
  created_at: string;
  updated_at: string;
}

// List item shape (adds counts)
export interface OfflineRouteListItem extends OfflineRoute {
  waypoint_count: number;
  gpx_count: number;
}

export interface OfflineRouteListResult {
  items: OfflineRouteListItem[];
  nextOffset: number;
}

/**
 * List routes from the offline DB with optional search + pagination.
 * Mirrors GET /api/routes on the offline server.
 */
export async function listRoutesOffline(options?: {
  limit?: number;
  offset?: number;
  q?: string;
}): Promise<OfflineRouteListResult> {
  const limitRaw = options?.limit ?? 20;
  const offsetRaw = options?.offset ?? 0;
  const q = (options?.q ?? "").trim().toLowerCase();

  const limit = Math.min(limitRaw, 100);
  const offset = Math.max(offsetRaw, 0);

  const params: any[] = [];
  let where = "";

  if (q) {
    params.push(`%${q}%`);
    where = "WHERE LOWER(r.name) LIKE ?";
  }

  params.push(limit, offset);

  const sql = `
    SELECT
      r.id,
      r.slug,
      r.name,
      r.region,
      r.user_id,
      r.username,
      r.rating,
      r.created_at,
      r.updated_at,
      COALESCE(
        (SELECT COUNT(*) FROM waypoints w WHERE w.route_id = r.id),
        0
      ) AS waypoint_count,
      COALESCE(
        (SELECT COUNT(*) FROM gpx g WHERE g.route_id = r.id),
        0
      ) AS gpx_count
    FROM routes r
    ${where}
    ORDER BY r.updated_at DESC
    LIMIT ? OFFSET ?
  `;

  const items = await dbAll<OfflineRouteListItem>(sql, params);
  return {
    items,
    nextOffset: offset + items.length,
  };
}

/**
 * Fetch a single route (without GPX).
 * Mirrors GET /api/routes/:id without include_gpx=true.
 */
export async function getRouteOffline(
  id: number
): Promise<OfflineRoute | null> {
  const rid = toInt(id);
  if (!rid) throw new Error("bad-route-id");

  const route = await dbGet<OfflineRoute>(
    `
    SELECT
      id,
      slug,
      name,
      region,
      user_id,
      username,
      rating,
      created_at,
      updated_at
    FROM routes
    WHERE id = ?
    `,
    [rid]
  );

  return route ?? null;
}

/**
 * Fetch route + GPX as FeatureCollection.
 * Mirrors GET /api/routes/:id?include_gpx=true on the offline server.
 */
export async function getRouteDetailOffline(
  id: number,
  options?: { includeGpx?: boolean }
): Promise<{ route: OfflineRoute; gpx?: any }> {
  const rid = toInt(id);
  if (!rid) throw new Error("bad-route-id");

  const route = await getRouteOffline(rid);
  if (!route) {
    throw new Error("not-found");
  }

  if (!options?.includeGpx) {
    return { route };
  }

  const rows = await dbAll<{ geometry: string | null; name: string | null }>(
    `
    SELECT geometry, name
    FROM gpx
    WHERE route_id = ?
    ORDER BY id ASC
    `,
    [rid]
  );

  const features = rows.map((row, idx) => {
    let geometry: any = null;
    try {
      if (row.geometry) {
        geometry = JSON.parse(row.geometry);
      }
    } catch {
      geometry = null;
    }

    return {
      type: "Feature",
      properties: {
        route_id: rid,
        segment: idx,
        name: row.name ?? null,
      },
      geometry,
    };
  });

  return {
    route,
    gpx: {
      type: "FeatureCollection",
      features,
    },
  };
}

/**
 * Create a route offline.
 * Mirrors POST /api/routes on offline server (but we pass user info directly).
 */
export async function createRouteOffline(params: {
  userId: number;
  username: string;
  name: string;
  region?: string;
  slug?: string;
}): Promise<OfflineRoute> {
  const userId = toInt(params.userId);
  const username = (params.username ?? "").trim();
  const name = (params.name ?? "").trim();
  const region = (params.region ?? null) || null;

  if (!userId || !username || !name) {
    throw new Error("user_id, username, and name are required.");
  }

  // Generate slug if not provided
  const baseSlug =
    params.slug ??
    `route-${Math.random().toString(36).slice(2, 6)}-${Date.now().toString(36)}`;
  const slug = baseSlug.toLowerCase();

  try {
    const result = await dbRun(
      `
      INSERT INTO routes (id, user_id, username, slug, name, region)
      VALUES (
        NULL,      -- let SQLite assign id
        ?, ?, ?, ?, ?
      )
      `,
      [userId, username, slug, name, region]
    );

    const id = result.insertId ?? result.lastInsertRowId ?? result.lastID;
    if (!id) {
      throw new Error("Failed to obtain inserted route id.");
    }

    const route = await getRouteOffline(Number(id));
    if (!route) {
      throw new Error("Route not found after insert.");
    }
    return route;
  } catch (err: any) {
    // Likely slug uniqueness violation
    console.error("[offline] createRouteOffline insert error:", err?.message);
    throw new Error("slug-conflict");
  }
}

/**
 * Update a route (owner only).
 * Mirrors PATCH /api/routes/:id offline.
 */
export async function updateRouteOffline(params: {
  id: number;
  userId: number;
  name?: string | null;
  region?: string | null;
}): Promise<OfflineRoute> {
  const id = toInt(params.id);
  const userId = toInt(params.userId);
  const name = params.name ?? null;
  const region = params.region ?? null;

  if (!id) throw new Error("bad-route-id");
  if (!userId) throw new Error("Missing or invalid user id");

  const owner = await dbGet<{ user_id: number }>(
    `SELECT user_id FROM routes WHERE id = ?`,
    [id]
  );
  if (!owner) throw new Error("not-found");
  if (Number(owner.user_id) !== Number(userId)) throw new Error("not-owner");

  await dbRun(
    `
    UPDATE routes
       SET name       = COALESCE(?, name),
           region     = COALESCE(?, region),
           updated_at = datetime('now')
     WHERE id = ?
    `,
    [name, region, id]
  );

  const route = await getRouteOffline(id);
  if (!route) {
    throw new Error("Route not found after update.");
  }

  return route;
}

/**
 * Delete a route (owner only).
 * Mirrors DELETE /api/routes/:id offline.
 */
export async function deleteRouteOffline(
  id: number,
  userId: number
): Promise<{ deleted_id: number }> {
  const rid = toInt(id);
  const uid = toInt(userId);

  if (!rid) throw new Error("bad-route-id");
  if (!uid) throw new Error("Missing or invalid user id");

  const owner = await dbGet<{ user_id: number }>(
    `SELECT user_id FROM routes WHERE id = ?`,
    [rid]
  );
  if (!owner) throw new Error("not-found");
  if (Number(owner.user_id) !== Number(uid)) throw new Error("not-owner");

  await dbRun(`DELETE FROM routes WHERE id = ?`, [rid]); // assume FKs cascade
  return { deleted_id: rid };
}

/**
 * Get GeoJSON FeatureCollection for a route's GPX.
 * Mirrors GET /api/routes/:id/gpx offline.
 */
export async function getRouteGeoOffline(
  id: number
): Promise<{ type: "FeatureCollection"; features: any[] }> {
  const rid = toInt(id);
  if (!rid) throw new Error("bad-route-id");

  const rows = await dbAll<{ geometry: string | null; name: string | null }>(
    `
    SELECT geometry, name
    FROM gpx
    WHERE route_id = ?
    ORDER BY id ASC
    `,
    [rid]
  );

  if (!rows.length) {
    return { type: "FeatureCollection", features: [] };
  }

  const features = rows.map((row, idx) => {
    let geometry: any = null;
    try {
      if (row.geometry) {
        geometry = JSON.parse(row.geometry);
      }
    } catch {
      geometry = null;
    }

    return {
      type: "Feature",
      properties: {
        route_id: rid,
        segment: idx + 1,
        name: row.name ?? null,
      },
      geometry,
    };
  });

  return { type: "FeatureCollection", features };
}
