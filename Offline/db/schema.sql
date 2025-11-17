PRAGMA foreign_keys = ON;

-- Users: we keep this offline so current user (and any synced users)
-- can be stored with the SAME id as in the remote DB. New users can
-- omit "id" and let SQLite assign one.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,        -- matches remote id when provided
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                       -- can be NULL if we don't store it offline
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Routes
CREATE TABLE IF NOT EXISTS routes (
  id          INTEGER PRIMARY KEY,          -- can match remote id or auto-generate
  user_id     INTEGER,                      -- remote user id; no FK offline
  username    TEXT,                         -- creator's username (denormalized)
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  region      TEXT,
  rating      INTEGER NOT NULL DEFAULT 0,   -- aggregated score: sum of votes
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_synced_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'clean'
);

CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes(user_id);

-- Waypoints
CREATE TABLE IF NOT EXISTS waypoints (
  id          INTEGER PRIMARY KEY,          -- can match remote id or auto-generate
  route_id    INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id     INTEGER,                      -- remote user id; no FK offline
  username    TEXT,                         -- creator's username (denormalized)
  name        TEXT NOT NULL,
  description TEXT,
  lat         REAL,
  lon         REAL,
  type        TEXT,
  rating      INTEGER NOT NULL DEFAULT 0,   -- aggregated score
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  sync_status TEXT NOT NULL DEFAULT 'clean'
);

CREATE INDEX IF NOT EXISTS idx_waypoints_route_id ON waypoints(route_id);
CREATE INDEX IF NOT EXISTS idx_waypoints_user_id  ON waypoints(user_id);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY,          -- can match remote id or auto-generate
  user_id     INTEGER,                      -- remote user id; no FK offline
  username    TEXT,                         -- creator's username (denormalized)
  kind        TEXT NOT NULL CHECK (kind IN ('waypoint','route')),
  waypoint_id INTEGER REFERENCES waypoints(id) ON DELETE CASCADE ON UPDATE CASCADE,
  route_id    INTEGER REFERENCES routes(id)   ON DELETE CASCADE ON UPDATE CASCADE,
  content     TEXT NOT NULL,
  rating      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  edited      INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'clean'

  CHECK (
    (kind = 'waypoint' AND waypoint_id IS NOT NULL AND route_id IS NULL) OR
    (kind = 'route'    AND route_id    IS NOT NULL AND waypoint_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comments_waypoint_id ON comments(waypoint_id);
CREATE INDEX IF NOT EXISTS idx_comments_route_id    ON comments(route_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id     ON comments(user_id);

-- Ratings (still keyed by remote user_id + local object id)
CREATE TABLE IF NOT EXISTS waypoint_ratings (
  user_id     INTEGER NOT NULL,                      -- remote user id; no FK offline
  waypoint_id INTEGER NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE ON UPDATE CASCADE,
  val         INTEGER NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'clean',
  PRIMARY KEY (user_id, waypoint_id)
);

CREATE INDEX IF NOT EXISTS idx_wp_ratings_waypoint_id
  ON waypoint_ratings(waypoint_id);

CREATE TABLE IF NOT EXISTS route_ratings (
  user_id  INTEGER NOT NULL,                         -- remote user id; no FK offline
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  val      INTEGER NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'clean',
  PRIMARY KEY (user_id, route_id)
);

CREATE INDEX IF NOT EXISTS idx_route_ratings_route_id
  ON route_ratings(route_id);

CREATE TABLE IF NOT EXISTS comment_ratings (
  user_id    INTEGER NOT NULL,                       -- remote user id; no FK offline
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  val        INTEGER NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'clean',
  PRIMARY KEY (user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_ratings_cmt_id
  ON comment_ratings(comment_id);

-- GPX
CREATE TABLE IF NOT EXISTS gpx (
  id         INTEGER PRIMARY KEY,                    -- can match remote id or auto-generate
  route_id   INTEGER REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name       TEXT,
  geometry   TEXT NOT NULL,     -- e.g. GeoJSON LineString or encoded polyline
  file       BLOB NOT NULL,     -- original GPX content (or TEXT if you prefer)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gpx_route_id ON gpx(route_id);

-- Sync state (for timestamps, schema version, etc.)
CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
