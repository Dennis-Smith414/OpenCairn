// NodeMobile/src/lib/api.ts

// Point API_BASE at your backend.
// On Android emulator, "localhost" is NOT valid → use 10.0.2.2
export const API_BASE =
  __DEV__ ? "http://10.0.2.2:5000" : "https://your-prod-backend.com";

export async function fetchRouteList() {
  const r = await fetch(`${API_BASE}/api/routes/list?limit=100`);
  const j = await r.json();
  return j.items ?? [];
}

export async function fetchRouteGeo(id: number) {
  const r = await fetch(`${API_BASE}/api/routes/${id}.geojson`);
  if (!r.ok) throw new Error(`geo failed ${r.status}`);
  return r.json();
}
