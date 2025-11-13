// src/lib/api.ts
import { API_BASE, OFFLINE_API_BASE } from "../config/env";

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// This will be set by OfflineContext at app startup.
let dynamicApiBase = "";

/**
 * Called from OfflineProvider whenever mode changes.
 */
export function setApiBase(base: string) {
  dynamicApiBase = base;
}

/**
 * Resolve the base URL to use.
 * - Prefer dynamicApiBase set by OfflineContext
 * - Fallback to env API_BASE (online) as a safety net
 */
function getBase(): string {
  if (dynamicApiBase) return dynamicApiBase;
  if (!API_BASE) {
    console.error("[boot] ❌ No API_BASE found. Check your .env.");
    throw new Error("Missing API_BASE");
  }
  return API_BASE;
}

/**
 * GET /api/routes
 * (shared online/offline)
 */
export async function fetchRouteList() {
  const base = getBase();
  const url = new URL(`${base}/api/routes`);

  const res = await fetch(url.toString());
  const text = await res.text();
  const json = safeJson(text);

  if (!res.ok || !json?.ok) {
    throw new Error(`Failed to load routes (${res.status}) :: ${text.slice(0, 200)}`);
  }
  return json.items ?? [];
}

/**
 * GET /api/routes/:id/gpx
 * Returns FeatureCollection (shared online/offline)
 */
export async function fetchRouteGeo(id: number) {
  const base = getBase();
  const res = await fetch(`${base}/api/routes/${id}/gpx`);
  const text = await res.text();
  const json = safeJson(text);

  if (!res.ok || !json) {
    throw new Error(`geo error ${res.status} :: ${text.slice(0, 200)}`);
  }

  if (json.ok && json.geojson) return json.geojson;
  if (json.type === "FeatureCollection") return json;

  throw new Error(`Unexpected geometry payload: ${text.slice(0, 200)}`);
}

/**
 * BELOW: /users/me* endpoints are ONLINE ONLY.
 * If we’re pointed at the offline base, we short-circuit and
 * return a safe “offline” response instead of throwing.
 */

export async function fetchUserRoutes(token: string) {
  const base = getBase();

  // Offline DB: don't even try, just return safe shape
  if (base === OFFLINE_API_BASE) {
    return { ok: false, offline: true, routes: [] };
  }

  const res = await fetch(`${base}/api/users/me/routes`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to load user routes (${res.status})`);
  }

  return res.json();
}

export async function fetchUserWaypoints(token: string) {
  const base = getBase();

  if (base === OFFLINE_API_BASE) {
    return { ok: false, offline: true, waypoints: [] };
  }

  const res = await fetch(`${base}/api/users/me/waypoints`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to load user waypoints (${res.status})`);
  }

  return res.json();
}

export async function fetchUserComments(token: string) {
  const base = getBase();

  if (base === OFFLINE_API_BASE) {
    return { ok: false, offline: true, comments: [] };
  }

  const res = await fetch(`${base}/api/users/me/comments`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to load user comments (${res.status})`);
  }

  return res.json();
}

export async function fetchCurrentUser(token: string) {
  const base = getBase();

  if (base === OFFLINE_API_BASE) {
    // In offline mode we simply can't load the profile.
    // Returning null makes it easy for the UI to hide account-specific stuff.
    return null;
  }

  const res = await fetch(`${base}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  const json = await res.json();
  return json.user;
}
