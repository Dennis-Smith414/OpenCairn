// src/lib/bringOffline.ts
import { apiFetch } from "./http";

type Target = "remote" | "offline";

/* ============================
 *  Remote types
 * ============================ */

interface RemoteRoute {
  id: number;
  slug: string;
  name: string;
  region: string | null;
  user_id: number | null;
  created_at: string;
  updated_at: string;
}

interface RemoteRouteWithGpxResponse {
  ok: boolean;
  route: RemoteRoute;
  gpx?: {
    type: "FeatureCollection";
    features: any[];
  };
}

export interface RemoteWaypoint {
  id: number;
  route_id: number;
  user_id: number | null;
  name: string;
  description: string | null;
  lat: number;
  lon: number;
  type: string | null;
  created_at: string;
  updated_at: string;
  username: string; // from JOIN users u
}

interface WaypointsByRouteResponse {
  ok: boolean;
  items: RemoteWaypoint[];
}

export interface RemoteComment {
  id: number;
  user_id: number | null;
  username: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
  kind: "waypoint" | "route";
  waypoint_id: number | null;
  route_id: number | null;
}

interface CommentsResponse {
  ok: boolean;
  comments: RemoteComment[];
}

/** Rating summaries returned by ratings.js */
interface RatingSummary {
  total: number;
  user_rating: number | null;
}

interface RatingResponse {
  ok: boolean;
  total: number;
  user_rating: number | null;
}

/* ============================
 *  Offline row shapes
 * ============================ */

export interface OfflineRouteRow {
  id: number;
  user_id: number | null;
  slug: string;
  name: string;
  description: string | null;
  region: string | null;
  rating: number;
  created_at: string;
  updated_at: string;
}

// SQLite schema:
// id, route_id, user_id, username, name, description, lat, lon, type, rating, created_at, updated_at
export interface OfflineWaypointRow {
  id: number;
  route_id: number;
  user_id: number | null;
  username: string | null;
  name: string;
  description: string | null;
  lat: number;
  lon: number;
  type: string | null;
  rating: number;      // aggregated rating
  created_at: string;
  updated_at: string;
}

export interface OfflineCommentRow {
  id: number;
  user_id: number | null;
  username: string | null;
  kind: "waypoint" | "route";
  waypoint_id: number | null;
  route_id: number | null;
  content: string;
  rating: number;       // aggregated score
  created_at: string;
  updated_at: string;
  edited: number;       // 0/1 in SQLite
}

export interface OfflineGpxRow {
  id?: number;
  route_id: number;
  name: string | null;
  geometry: string;      // stored as TEXT (GeoJSON string)
  file: string | null;   // we’ll just store GeoJSON for now
  created_at: string;
}

export interface RouteSyncPayload {
  route: OfflineRouteRow;
  gpx: OfflineGpxRow[];
  waypoints: OfflineWaypointRow[];
  comments: OfflineCommentRow[];
}

/* ============================
 *  Remote helpers
 * ============================ */

/**
 * GET /api/routes/:id?include_gpx=true
 */
async function remoteFetchRouteWithGeo(
  routeId: number
): Promise<{ route: RemoteRoute; geojson: any }> {
  const res = await apiFetch<RemoteRouteWithGpxResponse>(
    "remote",
    `/api/routes/${routeId}?include_gpx=true`
  );

  if (!res.ok || !res.route) {
    throw new Error(`remoteFetchRouteWithGeo: failed for route ${routeId}`);
  }

  const geojson =
    res.gpx ?? ({ type: "FeatureCollection", features: [] as any[] });

  return { route: res.route, geojson };
}

/**
 * GET /api/waypoints/route/:route_id (REMOTE only)
 */
async function remoteFetchWaypoints(
  routeId: number
): Promise<RemoteWaypoint[]> {
  const res = await apiFetch<WaypointsByRouteResponse>(
    "remote",
    `/api/waypoints/route/${routeId}`
  );

  if (!res.ok) {
    throw new Error(`remoteFetchWaypoints: failed for route ${routeId}`);
  }

  return res.items ?? [];
}

// Fetch comments for a ROUTE from the REMOTE server
async function remoteFetchRouteComments(
  routeId: number
): Promise<RemoteComment[]> {
  const res = await apiFetch<CommentsResponse>(
    "remote",
    `/api/comments/routes/${routeId}`
  );
  if (!res.ok) {
    throw new Error(`remoteFetchRouteComments: failed for route ${routeId}`);
  }
  return res.comments ?? [];
}

// Fetch comments for a WAYPOINT from the REMOTE server
async function remoteFetchWaypointComments(
  waypointId: number
): Promise<RemoteComment[]> {
  const res = await apiFetch<CommentsResponse>(
    "remote",
    `/api/comments/waypoints/${waypointId}`
  );
  if (!res.ok) {
    throw new Error(
      `remoteFetchWaypointComments: failed for waypoint ${waypointId}`
    );
  }
  return res.comments ?? [];
}

/**
 * GET /api/ratings/route/:id  (requires auth)
 */
async function remoteFetchRouteRating(
  routeId: number,
  token: string
): Promise<RatingSummary> {
  const res = await apiFetch<RatingResponse>(
    "remote",
    `/api/ratings/route/${routeId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    throw new Error(`remoteFetchRouteRating: failed for route ${routeId}`);
  }
  return {
    total: res.total ?? 0,
    user_rating: res.user_rating ?? null,
  };
}

/**
 * GET /api/ratings/waypoint/:id  (requires auth)
 */
async function remoteFetchWaypointRating(
  waypointId: number,
  token: string
): Promise<RatingSummary> {
  const res = await apiFetch<RatingResponse>(
    "remote",
    `/api/ratings/waypoint/${waypointId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    throw new Error(
      `remoteFetchWaypointRating: failed for waypoint ${waypointId}`
    );
  }
  return {
    total: res.total ?? 0,
    user_rating: res.user_rating ?? null,
  };
}

/**
 * GET /api/ratings/comment/:id  (requires auth)
 */
async function remoteFetchCommentRating(
  commentId: number,
  token: string
): Promise<RatingSummary> {
  const res = await apiFetch<RatingResponse>(
    "remote",
    `/api/ratings/comment/${commentId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    throw new Error(
      `remoteFetchCommentRating: failed for comment ${commentId}`
    );
  }
  return {
    total: res.total ?? 0,
    user_rating: res.user_rating ?? null,
  };
}

/* ============================
 *  Transform REMOTE → OFFLINE
 * ============================ */

function toOfflineRouteRow(
  route: RemoteRoute,
  ratingSummary: RatingSummary
): OfflineRouteRow {
  return {
    id: route.id,
    user_id: route.user_id ?? null,
    slug: route.slug,
    name: route.name,
    // postgres routes table doesn't have description; keep null offline for now
    description: null,
    region: route.region ?? null,
    rating: ratingSummary.total ?? 0,
    created_at: route.created_at,
    updated_at: route.updated_at,
  };
}

function toOfflineWaypointRow(
  wp: RemoteWaypoint,
  ratingSummary: RatingSummary
): OfflineWaypointRow {
  return {
    id: wp.id,
    route_id: wp.route_id,
    user_id: wp.user_id,
    username: wp.username ?? null,
    name: wp.name,
    description: wp.description,
    lat: wp.lat,
    lon: wp.lon,
    type: wp.type,
    rating: ratingSummary.total ?? 0,
    created_at: wp.created_at,
    updated_at: wp.updated_at,
  };
}

function toOfflineCommentRow(
  c: RemoteComment,
  ratingSummary: RatingSummary
): OfflineCommentRow {
  return {
    id: c.id,
    user_id: c.user_id,
    username: c.username ?? null,
    kind: c.kind,
    waypoint_id: c.kind === "waypoint" ? c.waypoint_id : null,
    route_id: c.kind === "route" ? c.route_id : null,
    content: c.content,
    rating: ratingSummary.total ?? 0,
    created_at: c.created_at,
    updated_at: c.updated_at,
    edited: c.edited ? 1 : 0,
  };
}

/* ============================
 *  PUBLIC API: bring a route fully offline
 * ============================ */

export async function syncRouteToOffline(
  routeId: number,
  opts: {
    token: string;          // required for ratings
    currentUserId?: number; // reserved for future use if you want to fill *_ratings tables
  }
): Promise<void> {
  const { token } = opts;
  if (!token) {
    throw new Error(
      "syncRouteToOffline: token is required (ratings endpoints are auth-protected)."
    );
  }

  // 1. Grab the "core" bundle in parallel:
  //    - route + geojson
  //    - waypoints for route
  //    - route rating
  //    - route comments
  const [routeWithGeo, waypoints, routeRatingSummary, routeComments] =
    await Promise.all([
      remoteFetchRouteWithGeo(routeId),
      remoteFetchWaypoints(routeId),
      remoteFetchRouteRating(routeId, token),
      remoteFetchRouteComments(routeId),
    ]);

  const { route, geojson } = routeWithGeo;

  // 2. For each waypoint, fetch its rating + comments in parallel
  const waypointBundles = await Promise.all(
    waypoints.map(async (wp) => {
      const [rating, comments] = await Promise.all([
        remoteFetchWaypointRating(wp.id, token),
        remoteFetchWaypointComments(wp.id),
      ]);
      return { wp, rating, comments };
    })
  );

  // 3. Collect ALL comments (route-level + waypoint-level)
  const allComments: RemoteComment[] = [
    ...routeComments,
    ...waypointBundles.flatMap((b) => b.comments),
  ];

  // 4. Fetch ratings for all comments
  const commentRatings: RatingSummary[] = await Promise.all(
    allComments.map((c) => remoteFetchCommentRating(c.id, token))
  );

  // 5. Transform to offline rows

  const offlineRoute = toOfflineRouteRow(route, routeRatingSummary);

  const offlineWaypoints: OfflineWaypointRow[] = waypointBundles.map(
    ({ wp, rating }) => toOfflineWaypointRow(wp, rating)
  );

  const offlineComments: OfflineCommentRow[] = allComments.map((c, idx) =>
    toOfflineCommentRow(c, commentRatings[idx])
  );

  const offlineGpx: OfflineGpxRow[] = [
    {
      route_id: route.id,
      name: route.name,
      geometry: JSON.stringify(geojson),
      file: JSON.stringify(geojson),
      created_at: route.created_at,
    },
  ];

  const payload: RouteSyncPayload = {
    route: offlineRoute,
    gpx: offlineGpx,
    waypoints: offlineWaypoints,
    comments: offlineComments,
  };

  // 6. POST to the offline server to upsert into SQLite
    // bringOffline.ts (inside syncRouteToOffline)
    await apiFetch<void>("offline", `/api/sync/route`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
}
