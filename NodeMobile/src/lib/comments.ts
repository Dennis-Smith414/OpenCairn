// src/lib/comments.ts
//import { API_BASE } from "./api";
import { getBaseUrl } from "./api";


// Fetch comments for either a waypoint or a route
export async function fetchComments(id: number, kind: "waypoint" | "route") {
  const API_BASE = getBaseUrl();
  const res = await fetch(`${API_BASE}/api/comments/${kind}s/${id}`);
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


//Post a new comment for a route or waypoint(requires auth)
export async function postComment(
  id: number,
  content: string,
  token: string,
  kind: "waypoint" | "route"
) {
  const API_BASE = getBaseUrl();
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


// Delete a comment (author only)
export async function deleteComment(commentId: number, token: string) {
  const API_BASE = getBaseUrl();
  const res = await fetch(`${API_BASE}/api/comments/${commentId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
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
export async function updateComment(commentId: number, content: string, token: string) {
  const API_BASE = getBaseUrl();
  const res = await fetch(`${API_BASE}/api/comments/${commentId}`, {
    method: "PATCH", // if your server expects PUT, change to PUT
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
