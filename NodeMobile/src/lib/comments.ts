// src/lib/comments.ts
//import { API_BASE } from "./api";
import { API_BASE } from "../config/env";

//Fetch comments for a given waypoint
export async function fetchComments(waypointId: number) {
  const res = await fetch(`${API_BASE}/api/comments/${waypointId}`);
  const text = await res.text();

  try {
    const json = JSON.parse(text);
    if (!json.ok) throw new Error(json.error || "Failed to fetch comments");
    return json.comments;
  } catch (err) {
    console.error("Error fetching comments:", err, text);
    throw new Error("Failed to fetch comments");
  }
}

//Post a new comment (requires auth)
export async function postComment(
  waypointId: number,
  content: string,
  token: string
) {
  const res = await fetch(`${API_BASE}/api/comments/${waypointId}`, {
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
