// src/lib/comments.ts
import { getBaseUrl } from "./api";
import { OFFLINE_API_BASE } from "../config/env";
import {
  fetchRouteCommentsOffline,
  fetchWaypointCommentsOffline,
  createRouteCommentOffline,
  createWaypointCommentOffline,
  updateCommentOffline as updateCommentOfflineDb,
  deleteCommentOffline as deleteCommentOfflineDb,
} from "../offline/routes/comments";

type CommentKind = "waypoint" | "route";
type RateValue = -1 | 0 | 1;

// ---------- MODE DETECTION ----------

function isOfflineBase(apiBase: string): boolean {
  return apiBase === OFFLINE_API_BASE;
}

interface JwtPayload {
  id?: number;
  username?: string;
  [key: string]: any;
}

/**
 * Very simple JWT decoder to recover user id / username from the token.
 * This mirrors what your offline Node `authorize` middleware did.
 * If decoding fails, we just return null.
 */
function decodeUserFromToken(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];

    // Handle URL-safe base64
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded =
      typeof atob === "function"
        ? atob(normalized)
        : Buffer.from(normalized, "base64").toString("utf8");

    return JSON.parse(decoded);
  } catch (e) {
    console.warn("[comments] Failed to decode JWT payload", e);
    return null;
  }
}

// ---------- INTERNAL HELPERS ----------

async function fetchCommentsInternal(
  id: number,
  kind: CommentKind,
  token?: string
) {
  const API_BASE = getBaseUrl();

  // OFFLINE path → use SQLite layer directly
  if (isOfflineBase(API_BASE)) {
    if (kind === "route") {
      return fetchRouteCommentsOffline(id);
    } else {
      return fetchWaypointCommentsOffline(id);
    }
  }

  // REMOTE path (as before)
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}/api/comments/${kind}s/${id}`, {
    headers,
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to fetch comments");
    return json.comments;
  } catch (err) {
    console.error(`Error fetching ${kind} comments:`, err, text);
    throw new Error("Failed to fetch comments");
  }
}

async function postCommentInternal(
  id: number,
  content: string,
  token: string,
  kind: CommentKind
) {
  const API_BASE = getBaseUrl();

  // OFFLINE path → write directly to SQLite
  if (isOfflineBase(API_BASE)) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user id from token while in offline mode."
      );
    }

    if (kind === "route") {
      return createRouteCommentOffline(id, {
        userId: user.id,
        username: user.username,
        content,
      });
    } else {
      return createWaypointCommentOffline(id, {
        userId: user.id,
        username: user.username,
        content,
      });
    }
  }

  // REMOTE path (original behavior)
  const res = await fetch(`${API_BASE}/api/comments/${kind}s/${id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to post comment");
    return json.comment;
  } catch (err) {
    console.error("Error posting comment:", err, text);
    throw new Error("Failed to post comment");
  }
}

// ---------- PUBLIC API (GENERAL) ----------

export async function fetchComments(id: number, kind: CommentKind) {
  return fetchCommentsInternal(id, kind);
}

export async function postComment(
  id: number,
  content: string,
  token: string,
  kind: CommentKind
) {
  return postCommentInternal(id, content, token, kind);
}

// Delete a comment (author only)
export async function deleteComment(commentId: number, token: string) {
  const API_BASE = getBaseUrl();

  // OFFLINE path
  if (isOfflineBase(API_BASE)) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user id from token while in offline mode."
      );
    }
    const deletedId = await deleteCommentOfflineDb(commentId, user.id);
    return deletedId;
  }

  // REMOTE path (original behavior)
  const res = await fetch(`${API_BASE}/api/comments/${commentId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to delete comment");
    return json.deleted_id;
  } catch (err) {
    console.error("Error deleting comment:", err, text);
    throw new Error("Failed to delete comment");
  }
}

// UPDATE / PATCH a comment (author only)
export async function updateComment(
  commentId: number,
  content: string,
  token: string
) {
  const API_BASE = getBaseUrl();

  // OFFLINE path
  if (isOfflineBase(API_BASE)) {
    const user = decodeUserFromToken(token);
    if (!user?.id) {
      throw new Error(
        "Cannot determine user id from token while in offline mode."
      );
    }

    // Returns updated comment, or null if unchanged
    const updated = await updateCommentOfflineDb(commentId, user.id, content);
    return updated;
  }

  // REMOTE path (original behavior)
  const res = await fetch(`${API_BASE}/api/comments/${commentId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to update comment");
    return json.comment;
  } catch (err) {
    console.error("Error updating comment:", err, text);
    throw new Error("Failed to update comment");
  }
}

// ---------- ROUTE / WAYPOINT CONVENIENCE HELPERS ----------

export async function fetchRouteComments(routeId: number, token?: string) {
  return fetchCommentsInternal(routeId, "route", token);
}

export async function fetchWaypointComments(waypointId: number, token?: string) {
  return fetchCommentsInternal(waypointId, "waypoint", token);
}

export async function postRouteComment(
  routeId: number,
  content: string,
  token: string
) {
  return postCommentInternal(routeId, content, token, "route");
}

export async function postWaypointComment(
  waypointId: number,
  content: string,
  token: string
) {
  return postCommentInternal(waypointId, content, token, "waypoint");
}

// ---------- RATING (UPVOTE / DOWNVOTE) ----------

/**
 * Rate a comment.
 * value: 1 = upvote, -1 = downvote, 0 = clear vote
 *
 * NOTE: Still goes to the *remote* server. If you want
 * offline ratings too, we’ll port the offline ratings route next.
 */
export async function rateComment(
  commentId: number,
  value: RateValue,
  token: string
): Promise<{ score?: number; user_rating?: RateValue }> {
  const API_BASE = getBaseUrl();
  const res = await fetch(`${API_BASE}/api/comments/${commentId}/rate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ value }),
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to rate comment");
    if (json.comment) {
      return {
        score: json.comment.score,
        user_rating: json.comment.user_rating as RateValue,
      };
    }
    return {
      score: json.score as number | undefined,
      user_rating: json.user_rating as RateValue | undefined,
    };
  } catch (err) {
    console.error("Error rating comment:", err, text);
    throw new Error("Failed to rate comment");
  }
}
