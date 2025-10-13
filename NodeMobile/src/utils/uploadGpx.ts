// utils/uploadGpx.ts
import RNFS from 'react-native-fs';

export async function uploadGpxFile(fileUri: string, token?: string) {
  if (!fileUri) throw new Error('Invalid file URI');

  // ✅ Ensure the URI is absolute (Android sometimes omits 'file://')
  const safeUri = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;

  // Derive filename from the URI
  const filename = safeUri.split('/').pop() || 'route.gpx';

  // ✅ Use your local backend running in the emulator bridge
  const API_BASE = 'http://10.0.2.2:5100';


  const formData = new FormData();

  // Append the file properly for React Native + Express + Multer
  // React Native's FormData expects the file object to contain:
  // - uri (must start with "file://")
  // - type (MIME type)
  // - name (filename)
  formData.append('file', {
    uri: safeUri,
    type: 'application/gpx+xml',
    name: filename,
  } as any);

  console.log('[uploadGpxFile] Uploading:', filename);
  console.log('[uploadGpxFile] Safe URI:', safeUri);

  // fetch() will set the correct multipart/form-data boundary automatically.
  const res = await fetch(`${API_BASE}/api/routes/upload`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
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
