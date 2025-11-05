// src/lib/comments.ts
//import { API_BASE } from "./api";
import { API_BASE } from "../config/env";

//-------------------
//WAYPOINT COMMENTS
//-------------------


//Fetch waypoint comments for a given waypoint
export async function fetchWaypointComments(waypointId: number) {
  const res = await fetch(`${API_BASE}/api/comments/waypoints/${waypointId}`);
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

//Post a new waypoint comment (requires auth)
export async function postWaypointComment(
  waypointId: number,
  content: string,
  token: string
) {
  const res = await fetch(`${API_BASE}/api/comments/waypoints/${waypointId}`, {
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
    if (!json.ok) throw new Error(json.error || "Failed to post waypoint comment");
    return json.comment;
  } catch (err) {
    console.error("Error posting waypoint comment:", err, text);
    throw new Error("Failed to post waypoint comment");
  }
}


// Delete a waypoint comment (author only)
export async function deleteWaypointComment(commentId: number, token: string) {
  const res = await fetch(`${API_BASE}/api/comments/waypoints/${commentId}`, {
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
    console.error("Error deleting waypoint comment:", err, text);
    throw new Error("Failed to delete waypoint comment");
  }
}


// UPDATE / PATCH a waypoint comment (author only)
export async function updateWaypointComment(commentId: number, content: string, token: string) {
  const res = await fetch(`${API_BASE}/api/comments/waypoints/${commentId}`, {
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
    // Expect json.comment (updated)
    return json.comment;
  } catch (err) {
    console.error("Error updating comment:", err, text);
    throw new Error("Failed to update comment");
  }
}



//-------------------
//ROUTE COMMENTS
//-------------------


//Fetch comments for a given route
export async function fetchRouteComments(routeId: number) {
  const res = await fetch(`${API_BASE}/api/comments/routes/${routeId}`);
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

//Post a new route comment (requires auth)
export async function postRouteComment(
  routeId: number,
  content: string,
  token: string
) {
  const res = await fetch(`${API_BASE}/api/comments/routes/${routeId}`, {
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
    if (!json.ok) throw new Error(json.error || "Failed to post route comment");
    return json.comment;
  } catch (err) {
    console.error("Error posting route comment:", err, text);
    throw new Error("Failed to post route comment");
  }
}


// Delete a comment (author only)
export async function deleteRouteComment(commentId: number, token: string) {
  const res = await fetch(`${API_BASE}/api/comments/routes/${commentId}`, {
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
    console.error("Error deleting route comment:", err, text);
    throw new Error("Failed to delete route comment");
  }
}


// UPDATE / PATCH a route comment (author only)
export async function updateRouteComment(commentId: number, content: string, token: string) {
  const res = await fetch(`${API_BASE}/api/comments/routes/${commentId}`, {
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
    // Expect json.comment (updated)
    return json.comment;
  } catch (err) {
    console.error("Error updating comment:", err, text);
    throw new Error("Failed to update comment");
  }
}

