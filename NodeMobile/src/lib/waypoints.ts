// src/lib/waypoint.ts
//import { API_BASE } from "./api";
import { API_BASE } from '../config/env';

export interface Waypoint {
  id?: number;
  route_id: number;
  user_id?: number;
  username?: string;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  type?: string;
  created_at?: string;
}

export async function fetchWaypoints(routeId: number): Promise<Waypoint[]> {
  const res = await fetch(`${API_BASE}/api/waypoints/route/${routeId}`);
  const data = await res.json();
  return data.items ?? [];
}

export async function createWaypoint(
  token: string,
  waypoint: Omit<Waypoint, "id" | "created_at" | "user_id">
): Promise<Waypoint> {
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
