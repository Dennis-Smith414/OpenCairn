//import { API_BASE } from "../config/env";
import { getBaseUrl, safeJson } from "./api";
import { uploadGpxToExistingRoute } from "./uploadGpx";

export interface Route {
  id?: number;
  slug?: string;
  name: string;
  description?: string;
  region?: string;
  user_id?: number;
  distance_km?: number;
  created_at?: string;
  updated_at?: string;
  username?: string;
}

export interface RouteDetail {
  route: Route;
  gpx?: any;
}


/**
 * GET /api/routes
 * (shared online/offline)
 */
export async function fetchRouteList() {
  const base = getBaseUrl();
  const url = new URL(`${base}/api/routes`);
  const res = await fetch(url.toString());
  const text = await res.text();
  const json = safeJson(text);
  if (!res.ok || !json?.ok) {
    throw new Error(`Failed to load routes (${res.status}) :: ${text.slice(0, 200)}`);
  }
  return json.items ?? [];
}


/** Create a route (owner = current user). */
export async function createRoute(
  token: string,
  payload: { name: string; region?: string; slug?: string }
): Promise<Route> {
  const API_BASE = getBaseUrl();
  const res = await fetch(`${API_BASE}/api/routes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to create route");
  return data.route as Route;
}

/** Delete a route (owner only). */
export async function deleteRoute(routeId: number, token: string) {
  const API_BASE = getBaseUrl();
  const res = await fetch(`${API_BASE}/api/routes/${routeId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Failed to delete route ${routeId}`);
  }
  return json as { ok: true; deleted_id: number };
}


/** Create a route, then attach a GPX file to it. */
export async function createRouteWithGpx(
  token: string,
  route: { name: string; region?: string },
  fileUri: string
) {
  const API_BASE = getBaseUrl();
  const newRoute = await createRoute(token, route);
  const upload = await uploadGpxToExistingRoute(newRoute.id!, fileUri, token);
  return { route: newRoute, upload };
}

/**
 * GET /api/routes/:id
 * Optional: include_gpx=true to fetch GeoJSON FeatureCollection.
 */
export async function fetchRouteDetail(
  id: number,
  options?: { includeGpx?: boolean }
): Promise<RouteDetail> {
  const base = getBaseUrl();
  const url = new URL(`${base}/api/routes/${id}`);

  if (options?.includeGpx) {
    url.searchParams.set("include_gpx", "true");
  }

  const res = await fetch(url.toString());
  const text = await res.text();
  const json = safeJson(text);

  if (!res.ok || !json?.ok) {
    throw new Error(
      `Failed to load route ${id} (${res.status}) :: ${text.slice(0, 200)}`
    );
  }

  if (!json.route) {
    throw new Error(`Route ${id} not found`);
  }

  return {
    route: json.route as Route,
    gpx: json.gpx,
  };
}
