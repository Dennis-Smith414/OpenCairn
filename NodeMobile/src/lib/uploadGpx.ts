// utils/uploadGpx.ts
import RNFS from 'react-native-fs';
import { API_BASE } from "../config/env";

console.log("[uploadGpxFile] module loaded; API_BASE =", API_BASE);

export async function uploadGpxFile(fileUri: string, token?: string) {
  if (!fileUri) throw new Error('Invalid file URI');

  // Ensure the URI is absolute (Android sometimes omits 'file://')
  const safeUri = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;

  // Derive filename from the URI
  const filename = safeUri.split('/').pop() || 'route.gpx';

  const formData = new FormData();

  // Use a broadly accepted MIME to avoid strict server/proxy checks
  formData.append('file', {
    uri: safeUri,
    type: 'application/octet-stream',
    name: filename,
  } as any);

  console.log('[uploadGpxFile] Uploading:', filename);
  console.log('[uploadGpxFile] Safe URI:', safeUri);
  console.log('[uploadGpxFile] about to POST', `${API_BASE}/api/routes/upload`);

  // Set explicit multipart header (RN will add the boundary)
  const res = await fetch(`${API_BASE}/api/routes/upload`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'multipart/form-data',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  // Safely parse response text as JSON
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    console.error('[uploadGpxFile] Non-JSON response:', text);
    throw new Error(`Unexpected server response: ${text}`);
  }

  if (!res.ok || !json.ok) {
    throw new Error(json?.error || `Upload failed (${res.status})`);
  }

  console.log('[uploadGpxFile] Upload successful:', json);
  return json;
}
