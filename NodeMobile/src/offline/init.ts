// src/offline/init.ts
import { getDb } from "./sqlite";

/**
 * Minimal, comment-free schema SQL.
 * Semicolons only appear at statement boundaries so split(";") is safe.
 */
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routes (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER,
  username       TEXT,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT,
  region         TEXT,
  rating         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_synced_at TEXT,
  sync_status    TEXT NOT NULL DEFAULT 'clean'
);

CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes(user_id);

CREATE TABLE IF NOT EXISTS waypoints (
  id          INTEGER PRIMARY KEY,
  route_id    INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id     INTEGER,
  username    TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  lat         REAL,
  lon         REAL,
  type        TEXT,
  rating      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  sync_status TEXT NOT NULL DEFAULT 'clean'
);

CREATE INDEX IF NOT EXISTS idx_waypoints_route_id ON waypoints(route_id);
CREATE INDEX IF NOT EXISTS idx_waypoints_user_id  ON waypoints(user_id);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER,
  username    TEXT,
  kind        TEXT NOT NULL CHECK (kind IN ('waypoint','route')),
  waypoint_id INTEGER REFERENCES waypoints(id) ON DELETE CASCADE ON UPDATE CASCADE,
  route_id    INTEGER REFERENCES routes(id)   ON DELETE CASCADE ON UPDATE CASCADE,
  content     TEXT NOT NULL,
  rating      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  edited      INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'clean',
  CHECK (
    (kind = 'waypoint' AND waypoint_id IS NOT NULL AND route_id IS NULL) OR
    (kind = 'route'    AND route_id    IS NOT NULL AND waypoint_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comments_waypoint_id ON comments(waypoint_id);
CREATE INDEX IF NOT EXISTS idx_comments_route_id    ON comments(route_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id     ON comments(user_id);

CREATE TABLE IF NOT EXISTS waypoint_ratings (
  user_id     INTEGER NOT NULL,
  waypoint_id INTEGER NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE ON UPDATE CASCADE,
  val         INTEGER NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'clean',
  PRIMARY KEY (user_id, waypoint_id)
);

CREATE INDEX IF NOT EXISTS idx_wp_ratings_waypoint_id
  ON waypoint_ratings(waypoint_id);

CREATE TABLE IF NOT EXISTS route_ratings (
  user_id     INTEGER NOT NULL,
  route_id    INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  val         INTEGER NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'clean',
  PRIMARY KEY (user_id, route_id)
);

CREATE INDEX IF NOT EXISTS idx_route_ratings_route_id
  ON route_ratings(route_id);

CREATE TABLE IF NOT EXISTS route_favorites (
  user_id     INTEGER NOT NULL,
  route_id    INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  sync_status TEXT NOT NULL DEFAULT 'clean',
  PRIMARY KEY (user_id, route_id)
);

CREATE INDEX IF NOT EXISTS idx_route_favorites_route_id
  ON route_favorites(route_id);

CREATE TABLE IF NOT EXISTS comment_ratings (
  user_id    INTEGER NOT NULL,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  val        INTEGER NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'clean',
  PRIMARY KEY (user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_ratings_cmt_id
  ON comment_ratings(comment_id);

CREATE TABLE IF NOT EXISTS gpx (
  id         INTEGER PRIMARY KEY,
  route_id   INTEGER REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name       TEXT,
  geometry   TEXT NOT NULL,
  file       BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gpx_route_id ON gpx(route_id);

CREATE TABLE IF NOT EXISTS offline_basemaps (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  path        TEXT NOT NULL,
  size_bytes  INTEGER,
  min_zoom    INTEGER,
  max_zoom    INTEGER,
  bounds_json TEXT,
  is_active   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

/**
 * Optional seed data for development/testing.
 */
const SEED_SQL = `
-- Optional seed data for development/testing.
`;

export interface InitOptions {
  withSeed?: boolean;
}

export async function initOfflineDb(options: InitOptions = {}): Promise<void> {
  const { withSeed = false } = options;
  console.log("[offline-db] initOfflineDb() called, withSeed =", withSeed);

  const db = await getDb();

  // Enforce foreign keys (outside of schema loop is fine)
  await db.executeSql("PRAGMA foreign_keys = ON;");

  const runBatch = async (sql: string, label: string) => {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        console.log("[offline-db]", label, "exec:", stmt.slice(0, 80));
        await db.executeSql(stmt, []);
      } catch (error: any) {
        console.error(
          `[offline-db] ${label} error:`,
          error?.message || error,
          "\nSQL:",
          stmt
        );
        throw error;
      }
    }
  };

  await runBatch(SCHEMA_SQL, "schema");

  if (withSeed && SEED_SQL.trim().length > 0) {
    await runBatch(SEED_SQL, "seed");
  }

  console.log("[offline-db] Init complete (schema" + (withSeed ? " + seed" : "") + ")");
}
