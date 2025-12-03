// src/lib/waypoints.ts
import { getBaseUrl } from "./api";
import { OFFLINE_API_BASE } from "../config/env";
import {
  fetchWaypointsByRouteOffline,
  fetchWaypointOffline,
  createWaypointOffline,
  updateWaypointOffline,
  deleteWaypointOffline,
} from "../offline/routes/waypoints";

export interface Waypoint {
  id?: number;
  route_id: number;
  route_name?: string;
  user_id?: number;
  username?: string;
  name: string;
  description?: string | null;
  lat: number;
  lon: number;
  type?: string;
  created_at?: string;
  updated_at?: string;
  rating?: number;
}

/* ---------- MODE DETECTION + JWT HELPERS ---------- */

function isOfflineBase(apiBase: string): boolean {
  return apiBase === OFFLINE_API_BASE;
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

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded =
      typeof atob === "function"
        ? atob(normalized)
        : Buffer.from(normalized, "base64").toString("utf8");

    return JSON.parse(decoded);
  } catch (e) {
    console.warn("[waypoints] Failed to decode JWT payload", e);
    return null;
  }
}

/* ---------- PUBLIC API ---------- */

// Get all waypoints for a route
export async function fetchWaypoints(routeId: number): Promise<Waypoint[]> {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (isOfflineBase(API_BASE)) {
    const rows = await fetchWaypointsByRouteOffline(routeId);
    return rows as unknown as Waypoint[];
  }

  // ONLINE → HTTP
  const res = await fetch(`${API_BASE}/api/waypoints/route/${routeId}`);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to fetch waypoints");
    return (json.items ?? []) as Waypoint[];
  } catch (e) {
    console.error("fetchWaypoints error:", e, text);
    throw new Error("Failed to fetch waypoints");
  }
}

// GET one waypoint via waypoint id
export async function fetchWaypoint(id: number): Promise<Waypoint> {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (isOfflineBase(API_BASE)) {
    const wp = await fetchWaypointOffline(id);
    return wp as unknown as Waypoint;
  }

  // ONLINE → HTTP
  const r = await fetch(`${API_BASE}/api/waypoints/${id}`);
  const text = await r.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to fetch waypoint");
    return json.waypoint as Waypoint;
  } catch (e) {
    console.error("fetchWaypoint error:", e, text);
    throw new Error("Failed to fetch waypoint");
  }
}

export async function createWaypoint(
  token: string,
  waypoint: Omit<Waypoint, "id" | "created_at" | "updated_at" | "user_id">
): Promise<Waypoint> {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (isOfflineBase(API_BASE)) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user id from token while in offline mode."
      );
    }

    const created = await createWaypointOffline({
      routeId: waypoint.route_id,
      userId: user.id,
      username: user.username,
      name: waypoint.name,
      description:
        waypoint.description === undefined ? null : waypoint.description,
      lat: waypoint.lat,
      lon: waypoint.lon,
      type: waypoint.type ?? "generic",
    });

    return created as unknown as Waypoint;
  }

  // ONLINE → HTTP
  const res = await fetch(`${API_BASE}/api/waypoints`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(waypoint),
  });

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!data.ok) throw new Error(data.error || "Failed to create waypoint");
    return data.waypoint as Waypoint;
  } catch (e) {
    console.error("createWaypoint error:", e, text);
    throw new Error("Failed to create waypoint");
  }
}

export async function deleteWaypoint(waypointId: number, token: string) {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite tombstone / delete
  if (isOfflineBase(API_BASE)) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user id from token while in offline mode."
      );
    }
    const deletedId = await deleteWaypointOffline(waypointId, user.id);
    return { ok: true, id: deletedId };
  }

  // ONLINE → HTTP
  const res = await fetch(`${API_BASE}/api/waypoints/${waypointId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response
  }

  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Failed to delete waypoint ${waypointId}`);
  }
  return json; // { ok: true }
}

// PATCH update waypoint (author only)
export async function updateWaypoint(
  token: string,
  id: number,
  payload: Partial<
    Pick<Waypoint, "route_id" | "name" | "description" | "lat" | "lon" | "type">
  >
): Promise<Waypoint> {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (isOfflineBase(API_BASE)) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user id from token while in offline mode."
      );
    }

    const updated = await updateWaypointOffline(id, user.id, {
      route_id: payload.route_id,
      name: payload.name,
      description:
        payload.description === undefined ? undefined : payload.description,
      lat: payload.lat,
      lon: payload.lon,
      type: payload.type,
    });

    return updated as unknown as Waypoint;
  }

  // ONLINE → HTTP
  const r = await fetch(`${API_BASE}/api/waypoints/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to update waypoint");
    return json.waypoint as Waypoint;
  } catch (e) {
    console.error("updateWaypoint error:", e, text);
    throw new Error("Failed to update waypoint");
  }
}
