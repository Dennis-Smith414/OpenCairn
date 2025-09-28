// src/lib/api.ts
const USE_ONLINE = true; // 👈 later replace with real connectivity check

export const API_BASE = USE_ONLINE
  ? "http://10.0.2.2:5000"  // Express + Neon backend
  : "http://localhost:5050"; // Embedded SQLite server

export async function fetchRouteList() {
  const r = await fetch(`${API_BASE}/api/routes`);
  const j = await r.json();
  // Adjust depending on backend shape (Neon uses {routes: []}, SQLite too)
  return j.items ?? j.routes ?? [];
}

export async function fetchRouteGeo(id: number) {
  const r = await fetch(`${API_BASE}/api/routes/${id}.geojson`);
  if (!r.ok) throw new Error(`geo error ${r.status}`);
  return r.json();
}
