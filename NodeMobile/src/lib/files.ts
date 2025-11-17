// src/lib/files.ts
import { apiFetch } from "./http";

export interface OfflineRouteInfo {
  id: number;
  user_id?: number | null;
  username?: string | null;
  slug?: string;
  name: string;
  description?: string | null;
  region?: string | null;
  rating?: number;

  waypoint_count: number;
  comment_count: number;

  last_synced_at: string | null;
  created_at?: string;
  updated_at?: string;

  sync_status?: string;
}

/**
 * Fetch all offline routes from SQLite.
 * Uses apiFetch("offline") → always hits offline server.
 */
export async function fetchOfflineRoutes(): Promise<OfflineRouteInfo[]> {
  const data = await apiFetch<{ ok: boolean; routes: OfflineRouteInfo[] }>(
    "offline",
    "/api/files/routes"
  );
  return data.routes ?? [];
}

/**
 * Mark a route as resynced (currently just updates last_synced_at).
 */
export async function requestRouteResync(routeId: number): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(
    "offline",
    `/api/files/routes/${routeId}/resync`,
    { method: "POST" }
  );
  return data.ok === true;
}
