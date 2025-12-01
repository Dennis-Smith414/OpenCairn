// src/lib/routes.ts

import { getBaseUrl, safeJson } from "./api";
import { uploadGpxToExistingRoute } from "./uploadGpx";
import { OFFLINE_API_BASE } from "../config/env";
import {
  listRoutesOffline,
  getRouteDetailOffline,
  createRouteOffline,
  deleteRouteOffline,
  OfflineRoute,
} from "../offline/routes/routes";

export interface Route {
  id?: number;
  slug?: string;
  name: string;
  description?: string;
  region?: string;
  user_id?: number | null;
  distance_km?: number;
  created_at?: string;
  updated_at?: string;
  username?: string | null;
  rating?: number | null;
}

export interface RouteDetail {
  route: Route;
  gpx?: any;
}

interface JwtPayload {
  id?: number;
  username?: string;
  [key: string]: any;
}

function decodeUserFromToken(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];

    // URL-safe base64 → standard base64
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded =
      typeof atob === "function"
        ? atob(normalized)
        : Buffer.from(normalized, "base64").toString("utf8");

    return JSON.parse(decoded);
  } catch (e) {
    console.warn("[routes] Failed to decode JWT payload", e);
    return null;
  }
}

/**
 * GET /api/routes
 * (shared online/offline)
 */
export async function fetchRouteList() {
  const base = getBaseUrl();

  // OFFLINE → SQLite
  if (base === OFFLINE_API_BASE) {
    const result = await listRoutesOffline();
    return result.items as Route[];
  }

  // ONLINE → HTTP
  const url = new URL(`${base}/api/routes`);
  const res = await fetch(url.toString());
  const text = await res.text();
  const json = safeJson(text);
  if (!res.ok || !json?.ok) {
    throw new Error(
      `Failed to load routes (${res.status}) :: ${text.slice(0, 200)}`
    );
  }
  return json.items ?? [];
}

/** Create a route (owner = current user). */
export async function createRoute(
  token: string,
  payload: { name: string; region?: string; slug?: string }
): Promise<Route> {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (API_BASE === OFFLINE_API_BASE) {
    const user = decodeUserFromToken(token);
    if (!user?.id || !user.username) {
      throw new Error(
        "Cannot determine user identity from token while in offline mode."
      );
    }

    const route = await createRouteOffline({
      userId: user.id,
      username: user.username,
      name: payload.name,
      region: payload.region,
      slug: payload.slug,
    });

    return route as Route;
  }

  // ONLINE → HTTP
  const res = await fetch(`${API_BASE}/api/routes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.ok)
    throw new Error(data?.error || "Failed to create route");
  return data.route as Route;
}

/** Delete a route (owner only). */
export async function deleteRoute(routeId: number, token: string) {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (API_BASE === OFFLINE_API_BASE) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user identity from token while in offline mode."
      );
    }
    return await deleteRouteOffline(routeId, user.id);
  }

  // ONLINE → HTTP
  const res = await fetch(`${API_BASE}/api/routes/${routeId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {}
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

  // OFFLINE: GPX upload is not supported (matches old offline gpx.js 501 semantics)
  if (API_BASE === OFFLINE_API_BASE) {
    throw new Error(
      "GPX upload is not supported in offline mode. Please switch to online to upload tracks."
    );
  }

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

  // OFFLINE → SQLite
  if (base === OFFLINE_API_BASE) {
    const { route, gpx } = await getRouteDetailOffline(id, {
      includeGpx: options?.includeGpx ?? false,
    });
    return { route: route as Route, gpx };
  }

  // ONLINE → HTTP
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
