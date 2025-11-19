// src/lib/favorites.ts
import { getBaseUrl } from "./api";

/**
 * Get the current user's favorite route IDs.
 * Requires auth token; backend infers user from token.
 */
export async function getFavorites(token: string): Promise<number[]> {
  const API_BASE = getBaseUrl();
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
      json.route_ids ||
      json.routes ||
      json.items ||
      []
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
