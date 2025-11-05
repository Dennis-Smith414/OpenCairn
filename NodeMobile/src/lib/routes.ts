// src/lib/routes.ts
import { API_BASE } from "../config/env";

export interface Route {
  id?: number;
  name: string;
  description?: string;
  region?: string;
  user_id?: number;
  distance_km?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Delete a route (owner only).
 * Expects server to return { ok: true } on success.
 */
export async function deleteRoute(routeId: number, token: string) {
  const res = await fetch(`${API_BASE}/api/routes/${routeId}`, {
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
    // ignore parse errors; we'll still check res.ok
  }

  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Failed to delete route ${routeId}`);
  }
  return json; // { ok: true }
}

/*
// Optional: add as you migrate other calls here for consistency

export async function createRoute(token: string, payload: Omit<Route, "id" | "created_at" | "updated_at" | "user_id">) {
  const res = await fetch(`${API_BASE}/api/routes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Failed to create route");
  return data.route as Route;
}

*/
