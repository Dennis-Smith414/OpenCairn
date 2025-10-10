// utils/uploadGpx.ts
import RNFS from 'react-native-fs';

export async function uploadGpxFile(fileUri: string, token?: string) {
  if (!fileUri) throw new Error('Invalid file URI');

  // Derive filename
  const filename = fileUri.split('/').pop() || 'route.gpx';
  const API_BASE = 'http://10.0.2.2:5100';

  //Read file as base64, then convert to Blob-like object for FormData
  const base64Data = await RNFS.readFile(fileUri, 'base64');
  const file = {
    uri: fileUri,
    name: filename,
    type: 'application/gpx+xml',
    data: base64Data,
  };

  const formData = new FormData();

  // For Android, FormData expects a 'uri', not base64 directly.
  // But RNFS files are already 'file://' URIs now, so this is okay.
  formData.append('file', {
    uri: file.uri,
    type: file.type,
    name: file.name,
  } as any);

  console.log('[uploadGpxFile] Uploading', filename, fileUri);
  console.log('[uploadGpxFile] FormData inspection:');
  (formData as any)._parts?.forEach((part: any, i: number) => {
    console.log('  Part', i, JSON.stringify(part[0]), '=>', JSON.stringify(part[1]));
  });

  const res = await fetch(`${API_BASE}/api/routes/upload`, {
      method: 'POST',
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : undefined,
      body: formData,
    });

  let json;
  try {
    json = await res.json();
  } catch (e) {
    const text = await res.text();
    console.error('Non-JSON response:', text);
    throw new Error(`Unexpected server response: ${text}`);
  }

  if (!res.ok) {
    throw new Error(json.error || 'Upload failed');
  }

  return json;
}
