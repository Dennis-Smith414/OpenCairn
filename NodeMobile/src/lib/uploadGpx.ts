import RNFS from "react-native-fs";
import { API_BASE } from "../config/env";

/** Low-level: build FormData for a local file URI. */
function buildGpxFormData(fileUri: string) {
  if (!fileUri) throw new Error("Invalid file URI");
  const safeUri = fileUri.startsWith("file://") ? fileUri : `file://${fileUri}`;
  const filename = safeUri.split("/").pop() || "route.gpx";

  const form = new FormData();
  form.append("file", {
    uri: safeUri,
    type: "application/gpx+xml",
    name: filename,
  } as any);
  return { form, filename, safeUri };
}

/**
 * Preferred flow:
 * POST /api/routes/:id/gpx  → attaches GPX to an existing route
 */
export async function uploadGpxToExistingRoute(
  routeId: number,
  fileUri: string,
  token: string
) {
  const { form, filename } = buildGpxFormData(fileUri);
  const res = await fetch(`${API_BASE}/api/routes/${routeId}/gpx`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch {
    console.error("[uploadGpxToExistingRoute] Non-JSON:", text);
    throw new Error(`Unexpected server response: ${text}`);
  }
  if (!res.ok || !json.ok) throw new Error(json?.error || `Upload failed (${res.status})`);

  // Server returns: { ok: true, route_id, segments }
  return { routeId: json.route_id as number, segments: json.segments as number };
}

/**
 * Legacy shortcut (still supported by server):
 * POST /api/routes/upload  → creates/reuses a route by checksum, then attaches GPX.
 * Returns { id, slug, name, segments }.
 */
export async function uploadGpxAndCreateRoute(fileUri: string, token: string) {
  const { form, filename } = buildGpxFormData(fileUri);
  const res = await fetch(`${API_BASE}/api/routes/upload`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch {
    console.error("[uploadGpxAndCreateRoute] Non-JSON:", text);
    throw new Error(`Unexpected server response: ${text}`);
  }
  if (!res.ok || !json.ok) throw new Error(json?.error || `Upload failed (${res.status})`);

  // Normalize shape
  return {
    routeId: json.id as number,
    slug: json.slug as string | null,
    name: json.name as string | null,
    segments: (json.segments ?? 1) as number,
  };
}

/**
 * Backcompat alias (your old call site name).
 * If you want the new flow, swap call sites to `uploadGpxToExistingRoute`.
 */
export async function uploadGpxFile(fileUri: string, token?: string) {
  if (!token) throw new Error("Auth token required");
  return uploadGpxAndCreateRoute(fileUri, token);
}
