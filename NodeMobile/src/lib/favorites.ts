// src/lib/favorites.ts
import { getBaseUrl } from "./api";
import { OFFLINE_API_BASE } from "../config/env";
import {
  getFavoriteRouteIdsOffline,
  addFavoriteRouteOffline,
  removeFavoriteRouteOffline,
} from "../offline/routes/favorites";

interface JwtPayload {
  id?: number;
  username?: string;
  [key: string]: any;
}

function decodeUserFromToken(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];

    // URL-safe base64 → standard base64
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded =
      typeof atob === "function"
        ? atob(normalized)
        : Buffer.from(normalized, "base64").toString("utf8");

    return JSON.parse(decoded);
  } catch (e) {
    console.warn("[favorites] Failed to decode JWT payload", e);
    return null;
  }
}

/**
 * Get the current user's favorite route IDs.
 * Requires auth token; backend (or offline layer) infers user from token.
 */
export async function getFavorites(token: string): Promise<number[]> {
  const API_BASE = getBaseUrl();

  // OFFLINE path → SQLite
  if (API_BASE === OFFLINE_API_BASE) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user id from token while in offline mode."
      );
    }
    return await getFavoriteRouteIdsOffline(user.id);
  }

  // REMOTE path (unchanged)
  const res = await fetch(`${API_BASE}/api/favorites/routes`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();
  try {
    const json = JSON.parse(text);

    if (!json.ok) throw new Error(json.error || "Failed to fetch favorites");

    // Be flexible about shape: route_ids | routes | items
    return (
      json.route_ids || json.routes || json.items || []
    ) as number[];
  } catch (err) {
    console.error("Error fetching favorites:", err, text);
    throw new Error("Failed to fetch favorites");
  }
}

/**
 * Mark a route as favorite for the current user.
 */
export async function addToFavorites(
  routeId: number,
  token: string
): Promise<void> {
  const API_BASE = getBaseUrl();

  // OFFLINE path
  if (API_BASE === OFFLINE_API_BASE) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user id from token while in offline mode."
      );
    }
    await addFavoriteRouteOffline(routeId, user.id);
    return;
  }

  // REMOTE path (unchanged)
  const res = await fetch(`${API_BASE}/api/favorites/routes/${routeId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to add favorite");
  } catch (err) {
    console.error("Error adding favorite:", err, text);
    throw new Error("Failed to add favorite");
  }
}

/**
 * Remove a route from the current user's favorites.
 */
export async function removeFromFavorites(
  routeId: number,
  token: string
): Promise<void> {
  const API_BASE = getBaseUrl();

  // OFFLINE path
  if (API_BASE === OFFLINE_API_BASE) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user id from token while in offline mode."
      );
    }
    await removeFavoriteRouteOffline(routeId, user.id);
    return;
  }

  // REMOTE path (unchanged)
  const res = await fetch(`${API_BASE}/api/favorites/routes/${routeId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to remove favorite");
  } catch (err) {
    console.error("Error removing favorite:", err, text);
    throw new Error("Failed to remove favorite");
  }
}
