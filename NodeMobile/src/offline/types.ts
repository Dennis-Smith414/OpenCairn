// src/offline/types.ts

export type SyncStatus = "clean" | "new" | "dirty" | "deleted";

/** Route row shape as used offline. */
export interface OfflineRouteRow {
  id: number;
  user_id: number | null;
  username?: string | null;
  slug: string;
  name: string;
  description?: string | null;
  region?: string | null;
  rating?: number | null;
  created_at?: string;
  updated_at?: string;
}

/** GPX row shape. */
export interface OfflineGpxRow {
  id?: number;
  route_id: number;
  name?: string | null;
  geometry: string | object; // you store as TEXT; may originate as GeoJSON
  file?: string | object | null; // base64 or JSON stringified blob
  created_at?: string;
}

/** Waypoint row shape. */
export interface OfflineWaypointRow {
  id: number;
  route_id: number;
  user_id: number | null;
  username?: string | null;
  name: string;
  description?: string | null;
  lat: number;
  lon: number;
  type?: string | null;
  rating?: number | null;
  created_at?: string;
  updated_at?: string;
  sync_status?: SyncStatus;
}

/** Comment row shape. */
export type CommentKind = "waypoint" | "route";

export interface OfflineCommentRow {
  id: number;
  user_id: number | null;
  username?: string | null;
  kind: CommentKind;
  waypoint_id?: number | null;
  route_id?: number | null;
  content: string;
  rating?: number | null;
  created_at?: string;
  updated_at?: string;
  edited?: boolean;
  sync_status?: SyncStatus;
}

/** Favorites coming from remote when syncing a route bundle. */
export interface OfflineRouteFavoriteRow {
  user_id: number;
  route_id?: number; // often implied by the outer payload's route_id
  sync_status?: SyncStatus;
}

/** Favorites payload as seen in download.js / upload.js. */
export interface OfflineFavoritesPayload {
  route?: OfflineRouteFavoriteRow[];
}

/** Full route bundle downloaded from the remote server. */
export interface OfflineRouteBundle {
  route: OfflineRouteRow;
  gpx?: OfflineGpxRow[];
  waypoints?: OfflineWaypointRow[];
  comments?: OfflineCommentRow[];
  favorites?: OfflineFavoritesPayload;
}

/** Changes that will be pushed from offline -> online (used when we port upload logic). */
export interface OfflineRatingsPayload {
  waypoint: {
    target_id: number;
    rating: number;
    sync_status: SyncStatus;
  }[];
  route: {
    target_id: number;
    rating: number;
    sync_status: SyncStatus;
  }[];
  comment: {
    target_id: number;
    rating: number;
    sync_status: SyncStatus;
  }[];
}

export interface OfflineFavoritesChange {
  target_id: number; // route_id
  sync_status: SyncStatus;
}

export interface OfflineChangesPayload {
  waypoints: OfflineWaypointRow[];
  comments: OfflineCommentRow[];
  ratings: OfflineRatingsPayload;
  favorites: { route: OfflineFavoritesChange[] };
}
