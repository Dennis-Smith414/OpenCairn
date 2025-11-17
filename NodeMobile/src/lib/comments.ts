// src/lib/comments.ts
import { API_BASE } from "../config/env";

type CommentKind = "waypoint" | "route";

type RateValue = -1 | 0 | 1;

// ---------- INTERNAL HELPERS ----------

// Core fetcher, with optional token so the backend can return user_rating
async function fetchCommentsInternal(
  id: number,
  kind: CommentKind,
  token?: string
) {
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
    // Expect json.comments = Comment[]
    return json.comments;
  } catch (err) {
    console.error(`Error fetching ${kind} comments:`, err, text);
    throw new Error("Failed to fetch comments");
  }
}

// Core poster
async function postCommentInternal(
  id: number,
  content: string,
  token: string,
  kind: CommentKind
) {
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

// Original generic fetch (no auth) – keep for existing callers
export async function fetchComments(id: number, kind: CommentKind) {
  return fetchCommentsInternal(id, kind);
}

// Original generic post – keep for existing callers
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
  const res = await fetch(`${API_BASE}/api/comments/${commentId}`, {
    method: "PATCH", // change to PUT if your server expects that
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
    // Expect json.comment (updated)
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
 * Returns whatever the server sends – ideally { score, user_rating }.
 */
export async function rateComment(
  commentId: number,
  value: RateValue,
  token: string
): Promise<{ score?: number; user_rating?: RateValue }> {
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

    // Support both shapes:
    // { ok, score, user_rating } OR { ok, comment: {...} }
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
