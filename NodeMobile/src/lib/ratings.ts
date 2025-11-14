// src/lib/ratings.ts
//import { API_BASE } from "./api";
//import { API_BASE } from "../config/env";
import { getBaseUrl } from "./api";

/**
 * Fetch the total and user-specific rating for a given waypoint.
 */
export async function fetchWaypointRating(waypointId: number, token?: string) {
  const API_BASE = getBaseUrl();
  const url = `${API_BASE}/api/ratings/waypoint/${waypointId}`;

  try {
    const res = await fetch(url, {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
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
 * If the same vote is sent again, the backend will delete the record (undo).
 */
export async function submitWaypointVote(
  waypointId: number,
  val: 1 | -1,
  token: string
) {
  const API_BASE = getBaseUrl();
  const url = `${API_BASE}/api/ratings/waypoint/${waypointId}`;

  try {
      console.log("[submitWaypointVote] →", {
        url: `${API_BASE}/api/ratings/waypoint/${waypointId}`,
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
  const url = `${API_BASE}/api/ratings/route/${routeId}`;

  try {
    const res = await fetch(url, {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
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
 * If the same vote is sent again, the backend will delete the record (undo).
 */
export async function submitRouteVote(
  routeId: number,
  val: 1 | -1,
  token: string
) {
  const API_BASE = getBaseUrl();
  const url = `${API_BASE}/api/ratings/route/${routeId}`;

  try {
      console.log("[submitRouteVote] →", {
        url: `${API_BASE}/api/ratings/route/${routeId}`,
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
 Comment Rating Functions
   ============================================================ */

/**
 * Fetch total and user-specific rating for a comment.
 */
export async function fetchCommentRating(commentId: number, token?: string) {
  const API_BASE = getBaseUrl();
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
 * If the same vote is sent again, the backend will delete the record (undo).
 */
export async function submitCommentVote(
  commentId: number,
  val: 1 | -1,
  token: string
) {
  const API_BASE = getBaseUrl();
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
