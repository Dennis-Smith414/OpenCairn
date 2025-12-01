// src/lib/files.ts
//
// Offline File Manager API (React Native version)
// Replaces the old apiFetch("offline") HTTP calls with direct SQLite access.
//

import {
  listOfflineRoutes,
  resyncOfflineRoute,
  deleteOfflineRoute,
  OfflineRouteRow,
} from "../offline/routes/files";

// This interface is still used by screens, so we keep it.
// It simply mirrors the shape returned by listOfflineRoutes().
export interface OfflineRouteInfo extends OfflineRouteRow {}

/**
 * Fetch all offline routes from SQLite.
 * Previously hit `/api/files/routes` via the offline Express server.
 * Now uses RN SQLite directly.
 */
export async function fetchOfflineRoutes(): Promise<OfflineRouteInfo[]> {
  const rows = await listOfflineRoutes();
  return rows as OfflineRouteInfo[];
}

/**
 * Mark a route as resynced (updates last_synced_at).
 * Returns boolean to match previous behavior.
 */
export async function requestRouteResync(routeId: number): Promise<boolean> {
  const updated = await resyncOfflineRoute(routeId);
  return !!updated;
}

/**
 * Remove a route and its offline data from SQLite.
 * Matches the same return type (boolean) as before.
 */
export async function removeOfflineRoute(routeId: number): Promise<boolean> {
  await deleteOfflineRoute(routeId);
  return true;
}
