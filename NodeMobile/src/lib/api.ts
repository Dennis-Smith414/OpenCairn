// src/lib/api.ts
//import { API_BASE as ENV_API_BASE } from '@env';
import { API_BASE } from '../config/env';

if (!API_BASE) {
  console.error("[boot] ❌ No API_BASE found. Check your .env file path and contents.");
  throw new Error("Missing API_BASE");
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

//export const API_BASE = ENV_API_BASE;

/**
 * NEW: use GET /api/routes with optional pagination/search
 * (keeps same signature/return shape as before)
 */
export async function fetchRouteList() {

  const res = await fetch(`${API_BASE}/api/routes/`);

  const url = new URL(`${API_BASE}/api/routes`);
  // If you later add search/pagination, set params here:
  // url.searchParams.set("q", q);
  // url.searchParams.set("limit", String(limit));
  // url.searchParams.set("offset", String(offset));

  const res = await fetch(url.toString());
>>>>>>> 6e0094c4f4fa20f553c84f244ab3f34d38a78a8a
  const text = await res.text();
  const json = safeJson(text);

  if (!res.ok || !json?.ok) {
    throw new Error(`Failed to load routes (${res.status}) :: ${text.slice(0, 200)}`);
  }
  return json.items ?? [];
}

/**
 * NEW: use GET /api/routes/:id/gpx
 * Returns FeatureCollection
 */
export async function fetchRouteGeo(id: number) {
  //const r = await fetch(`${API_BASE}/api/routes/${id}.geojson`);
  const r = await fetch(`${API_BASE}/api/routes/${id}/gpx`);
  if (!r.ok) throw new Error(`geo error ${r.status}`);
  return r.json();

  const res = await fetch(`${API_BASE}/api/routes/${id}/gpx`);
  const text = await res.text();
  const json = safeJson(text);

  if (!res.ok || !json) {
    throw new Error(`geo error ${res.status} :: ${text.slice(0, 200)}`);
  }

  // Server returns { ok: true, geojson: FeatureCollection }
  // (Compat: if server ever returns raw FeatureCollection, handle that too)
  if (json.ok && json.geojson) return json.geojson;
  if (json.type === "FeatureCollection") return json; // fallback compat

  throw new Error(`Unexpected geometry payload: ${text.slice(0, 200)}`);
>>>>>>> 6e0094c4f4fa20f553c84f244ab3f34d38a78a8a
}

export async function fetchUserRoutes(token: string) {
  const res = await fetch(`${API_BASE}/api/users/me/routes`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load user routes (${res.status})`);
  }

  return res.json();
}

export async function fetchUserWaypoints(token: string) {
  const res = await fetch(`${API_BASE}/api/users/me/waypoints`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load user waypoints (${res.status})`);
  }

  return res.json();
}

export async function fetchUserComments(token: string) {
  const res = await fetch(`${API_BASE}/api/users/me/comments`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load user comments (${res.status})`);
  }

  return res.json();
}

export async function fetchCurrentUser(token: string) {
  const res = await fetch(`${API_BASE}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  const json = await res.json();
  return json.user;
}
