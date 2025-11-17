// src/lib/waypoints.ts
//import { API_BASE } from "./api";
//import { API_BASE } from '../config/env';
import { getBaseUrl } from "./api";

export interface Waypoint {
  id?: number;
  route_id: number;
  route_name?: string;
  user_id?: number;
  username?: string;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  type?: string;
  created_at?: string;
}

//Get all waypoints for a route
export async function fetchWaypoints(routeId: number): Promise<Waypoint[]> {
  const API_BASE = getBaseUrl();
  const res = await fetch(`${API_BASE}/api/waypoints/route/${routeId}`);
  const data = await res.json();
  return data.items ?? [];
}

// GET one waypoint via waypoint id
export async function fetchWaypoint(id: number): Promise<Waypoint> {
  const API_BASE = getBaseUrl();
  const r = await fetch(`${API_BASE}/api/waypoints/${id}`);
  const text = await r.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to fetch waypoint");
    return json.waypoint;
  } catch (e) {
    console.error("fetchWaypoint error:", e, text);
    throw new Error("Failed to fetch waypoint");
  }
}

export async function createWaypoint(
  token: string,
  waypoint: Omit<Waypoint, "id" | "created_at" | "user_id">
): Promise<Waypoint> {
  const API_BASE = getBaseUrl();
  const res = await fetch(`${API_BASE}/api/waypoints`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(waypoint),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Failed to create waypoint");
  return data.waypoint;
}

export async function deleteWaypoint(waypointId: number, token: string) {
  const API_BASE = getBaseUrl();
  const res = await fetch(`${API_BASE}/api/waypoints/${waypointId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });

  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch {}

  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Failed to delete waypoint ${waypointId}`);
  }
  return json; // { ok: true }
}

// PATCH update waypoint (author only)
export async function updateWaypoint(
  token: string,
  id: number,
  payload: Partial<Pick<Waypoint, "route_id" | "name" | "description" | "lat" | "lon" | "type">>
): Promise<Waypoint> {
  const API_BASE = getBaseUrl();
  const r = await fetch(`${API_BASE}/api/waypoints/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to update waypoint");
    return json.waypoint;
  } catch (e) {
    console.error("updateWaypoint error:", e, text);
    throw new Error("Failed to update waypoint");
  }
}