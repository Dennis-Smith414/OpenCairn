// src/lib/api.ts
export const API_BASE = 'http://172.18.96.1:5100';

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
