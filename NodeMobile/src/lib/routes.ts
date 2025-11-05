// src/lib/routes.ts
import { API_BASE } from "../config/env";

export interface Route {
  id?: number;
  name: string;
  description?: string;
  region?: string | null; // <- nullable to match server
  user_id?: number;
  distance_km?: number;
  created_at?: string;
  updated_at?: string;
}

export type RouteMeta = {
  id: number;
  slug: string;
  name: string;
  region: string | null;
  created_at: string;
  updated_at: string;
};

/** List routes (metadata only). Mirrors GET /api/routes */
export async function listRoutes(opts?: { q?: string; offset?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  if (opts?.limit != null) params.set("limit", String(opts.limit));

  const url = `${API_BASE}/api/routes${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url);
  const text = await res.text();

  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`Bad response: ${text}`); }

  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Failed to load routes (${res.status})`);
  }

  const items: RouteMeta[] = json.items ?? [];
  return items;
}

/**
 * Delete a route (owner only).
 * Expects server to return { ok: true } on success.
 */
export async function deleteRoute(routeId: number, token: string) {
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
  return json; // { ok: true }
}

/* (optional) keep these handy as you build out edit screens

export async function createRoute(
  token: string,
  payload: { name: string; region?: string | null }
) {
  const res = await fetch(`${API_BASE}/api/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: payload.name, region: payload.region ?? null }),
  });
  const text = await res.text(); const json = JSON.parse(text);
  if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to create route");
  return json.route as RouteMeta;
}

export async function updateRouteMeta(
  routeId: number,
  token: string,
  payload: { name?: string; region?: string | null }
) {
  const res = await fetch(`${API_BASE}/api/routes/${routeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text(); const json = JSON.parse(text);
  if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to update route");
  return json.route as RouteMeta;
}
*/
