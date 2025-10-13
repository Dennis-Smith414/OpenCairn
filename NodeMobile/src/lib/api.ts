// src/lib/api.ts
/* import { API_BASE } from "@env";

if (!API_BASE) {
  console.error("[boot] ❌ No API_BASE found. Check your .env file path and contents.");
  throw new Error("Missing API_BASE");
} */
export const API_BASE = 'http://10.0.2.2:5100'

export async function fetchRouteList() {
  const res = await fetch(`${API_BASE}/api/routes/list`);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return json.items ?? [];
  } catch {
    throw new Error(`Bad JSON from /routes/list: ${text.slice(0,200)}`);
  }
}

export async function fetchRouteGeo(id: number) {
  const r = await fetch(`${API_BASE}/api/routes/${id}.geojson`);
  if (!r.ok) throw new Error(`geo error ${r.status}`);
  return r.json();
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
