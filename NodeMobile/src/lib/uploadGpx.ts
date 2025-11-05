// utils/uploadGpx.ts
import RNFS from "react-native-fs";
import { API_BASE } from "../config/env";

// ---------- Types ----------
type ServerOk = { ok: true };
type ServerErr = { ok: false; error?: string };

export type CreateRouteResponse = ServerOk & {
  route: { id: number; slug: string; name: string; region: string | null };
};

export type UploadGpxResponse = ServerOk & {
  gpx: { id: number; route_id: number; name: string; created_at: string };
};

// ---------- Helpers ----------

// Normalize a file URI for FormData (RN needs file:// and a real path)
// If it's a content:// URI (Android), copy it to a temp file first.
async function normalizeFileUri(fileUri: string): Promise<{ uri: string; name: string }> {
  if (!fileUri) throw new Error("Invalid file URI");

  let src = fileUri;
  if (src.startsWith("content://")) {
    // Copy to a temp file RNFS can read
    const name = `upload-${Date.now()}.gpx`;
    const dest = `${RNFS.CachesDirectoryPath}/${name}`;
    await RNFS.copyFile(src, dest);
    src = `file://${dest}`;
    return { uri: src, name };
  }

  const safeUri = src.startsWith("file://") ? src : `file://${src}`;
  const name = safeUri.split("/").pop() || "route.gpx";
  return { uri: safeUri, name };
}

// Build FormData with the GPX file
async function buildGpxFormData(fileUri: string): Promise<FormData> {
  const { uri, name } = await normalizeFileUri(fileUri);
  const fd = new FormData();
  fd.append("file", {
    uri,
    name,
    type: "application/gpx+xml", // don’t set Content-Type header yourself; let fetch do the boundary
  } as any);
  return fd;
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unexpected server response: ${text}`);
  }
}

// ---------- Public API ----------

/**
 * Upload a GPX file to an existing route.
 * Server: POST /api/routes/:routeId/gpx
 */
export async function uploadGpxToRoute(
  routeId: number,
  fileUri: string,
  token: string
): Promise<UploadGpxResponse> {
  if (!routeId || routeId <= 0) throw new Error("Invalid route id");
  const formData = await buildGpxFormData(fileUri);

  const res = await fetch(`${API_BASE}/api/routes/${routeId}/gpx`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const text = await res.text();
  const json = parseJson(text) as UploadGpxResponse | ServerErr;

  if (!res.ok || (json as ServerErr).ok === false) {
    throw new Error((json as ServerErr).error || `Upload failed (${res.status})`);
  }
  return json as UploadGpxResponse;
}

/**
 * Create a route, then upload its first GPX file.
 * Server: POST /api/routes  →  POST /api/routes/:id/gpx
 */
export async function createRouteAndUpload(
  name: string,
  fileUri: string,
  token: string,
  region?: string | null
): Promise<{ route: CreateRouteResponse["route"]; gpx: UploadGpxResponse["gpx"] }> {
  // 1) Create route
  const createRes = await fetch(`${API_BASE}/api/routes`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, region: region ?? null }),
  });

  const createText = await createRes.text();
  const createJson = parseJson(createText) as CreateRouteResponse | ServerErr;
  if (!createRes.ok || (createJson as ServerErr).ok === false) {
    throw new Error((createJson as ServerErr).error || `Create route failed (${createRes.status})`);
  }
  const route = (createJson as CreateRouteResponse).route;

  // 2) Upload GPX to that route
  const uploadJson = await uploadGpxToRoute(route.id, fileUri, token);

  return { route, gpx: uploadJson.gpx };
}
