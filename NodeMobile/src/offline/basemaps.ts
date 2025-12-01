// src/offline/basemaps.ts
import RNFS from "react-native-fs";
import { dbAll, dbGet, dbRun } from "./sqlite";

export interface OfflineBasemap {
  id: number;
  name: string;
  path: string;
  size_bytes: number | null;
  min_zoom: number | null;
  max_zoom: number | null;
  bounds_json: string | null;
  is_active: 0 | 1;
  created_at: string;
}

/**
 * List all PMTiles basemaps, newest first.
 */
export async function listBasemapsOffline(): Promise<OfflineBasemap[]> {
  return dbAll<OfflineBasemap>(
    `
    SELECT
      id,
      name,
      path,
      size_bytes,
      min_zoom,
      max_zoom,
      bounds_json,
      is_active,
      created_at
    FROM offline_basemaps
    ORDER BY created_at DESC
    `
  );
}

/**
 * Import a PMTiles file into app storage and register it in the DB.
 * - Copies the file to DocumentDirectory/pmtiles/
 * - Stores path + size in offline_basemaps
 */
export async function importBasemapFromUri(params: {
  uri: string;
  name?: string;
}): Promise<OfflineBasemap> {
  const { uri } = params;
  const baseName =
    params.name ||
    uri.split("/").pop() ||
    `basemap-${Date.now().toString(36)}.pmtiles`;

  const destDir = `${RNFS.DocumentDirectoryPath}/pmtiles`;
  await RNFS.mkdir(destDir);

  const destPath = `${destDir}/${baseName}`;

  // Copy into app sandbox
  await RNFS.copyFile(uri, destPath);

  // Try to get file size
  let sizeBytes: number | null = null;
  try {
    const stat = await RNFS.stat(destPath);
    sizeBytes = Number(stat.size);
  } catch (err) {
    console.warn("[pmtiles] stat failed for", destPath, err);
  }

  const result = await dbRun(
    `
    INSERT INTO offline_basemaps (name, path, size_bytes)
    VALUES (?, ?, ?)
    `,
    [baseName, destPath, sizeBytes]
  );

  const insertedId =
    (result as any).insertId ??
    (result as any).lastInsertRowId ??
    (result as any).lastID;

  const basemap = await dbGet<OfflineBasemap>(
    `SELECT * FROM offline_basemaps WHERE id = ?`,
    [insertedId]
  );

  if (!basemap) {
    throw new Error("Basemap not found after insert.");
  }

  return basemap;
}

/**
 * Set the active basemap by id.
 * Pass null to clear all (no active basemap).
 */
export async function setActiveBasemap(id: number | null): Promise<void> {
  // Clear all first
  await dbRun(`UPDATE offline_basemaps SET is_active = 0`);

  if (id != null) {
    await dbRun(`UPDATE offline_basemaps SET is_active = 1 WHERE id = ?`, [
      id,
    ]);
  }
}

/**
 * Fetch the currently active basemap, or null if none.
 */
export async function getActiveBasemap(): Promise<OfflineBasemap | null> {
  const row = await dbGet<OfflineBasemap>(
    `
    SELECT
      id,
      name,
      path,
      size_bytes,
      min_zoom,
      max_zoom,
      bounds_json,
      is_active,
      created_at
    FROM offline_basemaps
    WHERE is_active = 1
    LIMIT 1
    `
  );
  return row ?? null;
}

/**
 * Delete a basemap (DB row + underlying file).
 */
export async function deleteBasemapOffline(id: number): Promise<void> {
  const row = await dbGet<Pick<OfflineBasemap, "path">>(
    `SELECT path FROM offline_basemaps WHERE id = ?`,
    [id]
  );

  if (row?.path) {
    try {
      const exists = await RNFS.exists(row.path);
      if (exists) {
        await RNFS.unlink(row.path);
      }
    } catch (err) {
      console.warn("[pmtiles] failed to delete file", row.path, err);
    }
  }

  await dbRun(`DELETE FROM offline_basemaps WHERE id = ?`, [id]);
}
