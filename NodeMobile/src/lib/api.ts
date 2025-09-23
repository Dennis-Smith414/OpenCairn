// NodeMobile/src/lib/api.ts
const USE_EMBEDDED = false; // true if using the device-embedded server on :8080

export const API_BASE = USE_EMBEDDED
  ? "http://127.0.0.1:8080/api"
  : "http://10.0.2.2:5000/api";

function p(path: string) {
  if (!path) throw new Error("apiJson called without a path");
  return path.startsWith("/") ? path : `/${path}`;
}

export async function apiJson<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${p(path)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} at ${path}\n${body}`);
  }
  return res.json() as Promise<T>;
}

export type TrailRow = { id: number; slug: string; name: string; region?: string };

export const fetchTrailList = () => apiJson<TrailRow[]>("/trails");
export const fetchTrailGeo  = (id: number) => apiJson<any>(`/trails/${id}.geojson`);
