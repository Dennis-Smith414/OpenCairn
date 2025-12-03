// src/lib/ratings.ts
// Shared ratings API: automatically routes to online HTTP or offline SQLite.

import { getBaseUrl } from "./api";
import { OFFLINE_API_BASE } from "../config/env";
import {
  getWaypointRatingOffline,
  setWaypointRatingOffline,
  getRouteRatingOffline,
  setRouteRatingOffline,
  getCommentRatingOffline,
  setCommentRatingOffline,
} from "../offline/routes/ratings";

type VoteVal = 1 | -1;

interface JwtPayload {
  id?: number;
  username?: string;
  [key: string]: any;
}

function decodeUserFromToken(token?: string): JwtPayload | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded =
      typeof atob === "function"
        ? atob(normalized)
        : Buffer.from(normalized, "base64").toString("utf8");

    return JSON.parse(decoded);
  } catch (e) {
    console.warn("[ratings] Failed to decode JWT payload", e);
    return null;
  }
}

/**
 * Fetch the total and user-specific rating for a given waypoint.
 */
export async function fetchWaypointRating(waypointId: number, token?: string) {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (API_BASE === OFFLINE_API_BASE) {
    const user = decodeUserFromToken(token);
    return getWaypointRatingOffline(waypointId, user?.id ?? null);
  }

  // ONLINE → HTTP
  const url = `${API_BASE}/api/ratings/waypoint/${waypointId}`;

  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();

    if (!res.ok) throw new Error(`Failed to fetch waypoint rating: ${text}`);

    const json = JSON.parse(text);
    return {
      total: json.total ?? 0,
      user_rating: json.user_rating ?? null,
    };
  } catch (err) {
    console.error("[fetchWaypointRating] error:", err);
    throw err;
  }
}

/**
 * Submit an upvote or downvote for a waypoint.
 * If the same vote is sent again, the backend/offline DB will undo it.
 */
export async function submitWaypointVote(
  waypointId: number,
  val: VoteVal,
  token: string
) {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (API_BASE === OFFLINE_API_BASE) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user identity from token while in offline mode."
      );
    }
    return setWaypointRatingOffline(waypointId, user.id, val);
  }

  // ONLINE → HTTP
  const url = `${API_BASE}/api/ratings/waypoint/${waypointId}`;

  try {
    console.log("[submitWaypointVote] →", {
      url,
      val,
      tokenStart: token?.slice(0, 10) + "...",
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ val }),
    });
    const text = await res.text();

    if (!res.ok) throw new Error(`Failed to post waypoint vote: ${text}`);

    const json = JSON.parse(text);

    return {
      total: json.total ?? 0,
      user_rating: json.user_rating ?? null,
    };
  } catch (err) {
    console.error("❌ [submitWaypointVote] error:", err);
    throw err;
  }
}

/**
 * Fetch the total and user-specific rating for a given ROUTE.
 */
export async function fetchRouteRating(routeId: number, token?: string) {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (API_BASE === OFFLINE_API_BASE) {
    const user = decodeUserFromToken(token);
    return getRouteRatingOffline(routeId, user?.id ?? null);
  }

  // ONLINE → HTTP
  const url = `${API_BASE}/api/ratings/route/${routeId}`;

  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();

    if (!res.ok) throw new Error(`Failed to fetch route rating: ${text}`);

    const json = JSON.parse(text);
    return {
      total: json.total ?? 0,
      user_rating: json.user_rating ?? null,
    };
  } catch (err) {
    console.error("[fetchRouteRating] error:", err);
    throw err;
  }
}

/**
 * Submit an upvote or downvote for a ROUTE.
 * If the same vote is sent again, the backend/offline DB will undo it.
 */
export async function submitRouteVote(
  routeId: number,
  val: VoteVal,
  token: string
) {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (API_BASE === OFFLINE_API_BASE) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user identity from token while in offline mode."
      );
    }
    return setRouteRatingOffline(routeId, user.id, val);
  }

  // ONLINE → HTTP
  const url = `${API_BASE}/api/ratings/route/${routeId}`;

  try {
    console.log("[submitRouteVote] →", {
      url,
      val,
      tokenStart: token?.slice(0, 10) + "...",
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ val }),
    });
    const text = await res.text();

    if (!res.ok) throw new Error(`Failed to post route vote: ${text}`);

    const json = JSON.parse(text);

    return {
      total: json.total ?? 0,
      user_rating: json.user_rating ?? null,
    };
  } catch (err) {
    console.error("❌ [submitRouteVote] error:", err);
    throw err;
  }
}

/* ============================================================
 * Comment Rating Functions
 * ============================================================
 */

/**
 * Fetch total and user-specific rating for a comment.
 */
export async function fetchCommentRating(commentId: number, token?: string) {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (API_BASE === OFFLINE_API_BASE) {
    const user = decodeUserFromToken(token);
    return getCommentRatingOffline(commentId, user?.id ?? null);
  }

  // ONLINE → HTTP
  const url = `${API_BASE}/api/ratings/comment/${commentId}`;

  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();

    if (!res.ok) throw new Error(`Failed to fetch comment rating: ${text}`);

    const json = JSON.parse(text);
    return {
      total: json.total ?? 0,
      user_rating: json.user_rating ?? null,
    };
  } catch (err) {
    console.error("[fetchCommentRating] error:", err);
    throw err;
  }
}

/**
 * Submit an upvote or downvote for a comment.
 * If the same vote is sent again, the backend/offline DB will undo it.
 */
export async function submitCommentVote(
  commentId: number,
  val: VoteVal,
  token: string
) {
  const API_BASE = getBaseUrl();

  // OFFLINE → SQLite
  if (API_BASE === OFFLINE_API_BASE) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user identity from token while in offline mode."
      );
    }
    return setCommentRatingOffline(commentId, user.id, val);
  }

  // ONLINE → HTTP
  const url = `${API_BASE}/api/ratings/comment/${commentId}`;

  try {
    console.log("[submitCommentVote] →", {
      url,
      val,
      tokenStart: token?.slice(0, 10) + "...",
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ val }),
    });
    const text = await res.text();

    if (!res.ok) throw new Error(`Failed to post comment vote: ${text}`);

    const json = JSON.parse(text);
    return {
      total: json.total ?? 0,
      user_rating: json.user_rating ?? null,
    };
  } catch (err) {
    console.error("❌ [submitCommentVote] error:", err);
    throw err;
  }
}
