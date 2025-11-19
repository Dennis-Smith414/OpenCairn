// Server/Postgres.js
require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool
  .connect()
  .then((client) => {
    console.log("[Postgres] Connected to database successfully");
    client.release();
  })
  .catch((err) => {
    console.error("[Postgres] Connection error:", err.message);
  });

// enforce search_path per connection
pool.on("connect", (client) => {
  client.query("SET search_path = opencairn;").catch((e) => {
    console.error("[Postgres] failed to set search_path:", e.message);
  });
});

/** Write (INSERT/UPDATE/DELETE). Returns { rowCount, rows }. */
async function run(sql, params = []) {
  const res = await pool.query(sql, params);
  return { rowCount: res.rowCount, rows: res.rows };
}

/** Read many rows. */
async function all(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

/** Read one row (or null). */
async function get(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows[0] || null;
}

/** Ensure schema exists. Call this once from index.js before listening. */
async function init() {
  // POSTGIS extension (needed for gpx.geometry)
  try {
    await run(`CREATE EXTENSION IF NOT EXISTS postgis;`);
  } catch (e) {
    console.warn("[Postgres] Could not create postgis extension:", e.message);
  }

  // USERS
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // ROUTES
  await run(`
    CREATE TABLE IF NOT EXISTS routes (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      region TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes(user_id);
  `);

  // WAYPOINTS
  await run(`
    CREATE TABLE IF NOT EXISTS waypoints (
      id SERIAL PRIMARY KEY,
      route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      lat DOUBLE PRECISION,
      lon DOUBLE PRECISION,
      type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_waypoints_route_id ON waypoints(route_id);
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_waypoints_user_id ON waypoints(user_id);
  `);

  // WAYPOINT RATINGS
  await run(`
    CREATE TABLE IF NOT EXISTS waypoint_ratings (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      waypoint_id INT NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE ON UPDATE CASCADE,
      val SMALLINT NOT NULL,
      PRIMARY KEY (user_id, waypoint_id)
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_wp_ratings_waypoint_id ON waypoint_ratings(waypoint_id);
  `);

  // ROUTE RATINGS
  await run(`
    CREATE TABLE IF NOT EXISTS route_ratings (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
      val SMALLINT NOT NULL,
      PRIMARY KEY (user_id, route_id)
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_route_ratings_route_id ON route_ratings(route_id);
  `);

// ROUTE FAVORITES
  await run(`
    CREATE TABLE IF NOT EXISTS route_favorites (
      user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, route_id)
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_route_favorites_route_id
      ON route_favorites(route_id);
  `);

  // COMMENTS
  await run(`
    CREATE TABLE IF NOT EXISTS comments (
      id          SERIAL PRIMARY KEY,
      -- pick ONE of the two lines below depending on desired behavior when a user is deleted:
        user_id   INT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,

      kind        TEXT NOT NULL CHECK (kind IN ('waypoint','route')),
      waypoint_id INT REFERENCES waypoints(id) ON DELETE CASCADE ON UPDATE CASCADE,
      route_id    INT REFERENCES routes(id)   ON DELETE CASCADE ON UPDATE CASCADE,
      content     TEXT NOT NULL,
      CHECK (
        (kind = 'waypoint' AND waypoint_id IS NOT NULL AND route_id IS NULL) OR
        (kind = 'route'    AND route_id    IS NOT NULL AND waypoint_id IS NULL)
      ),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      edited      BOOLEAN     NOT NULL DEFAULT FALSE
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_comments_waypoint_recent
      ON comments (waypoint_id, created_at DESC)
      WHERE kind = 'waypoint';
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_comments_route_recent
      ON comments (route_id, created_at DESC)
      WHERE kind = 'route';
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_comments_user_recent
      ON comments (user_id, created_at DESC);
  `);

  // COMMENT RATINGS
  await run(`
    CREATE TABLE IF NOT EXISTS comment_ratings (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      comment_id INT NOT NULL REFERENCES comments(id) ON DELETE CASCADE ON UPDATE CASCADE,
      val SMALLINT NOT NULL,
      PRIMARY KEY (user_id, comment_id)
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_comment_ratings_cmt_id ON comment_ratings(comment_id);
  `);

  // GPX FILES
  await run(`
    CREATE TABLE IF NOT EXISTS gpx (
      id SERIAL PRIMARY KEY,
      route_id INT REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
      name TEXT,
      geometry geometry(LINESTRING, 4326) NOT NULL,
      file BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_gpx_route_id ON gpx(route_id);
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_gpx_geom_gist ON gpx USING GIST (geometry);
  `);
}

module.exports = { init, run, all, get };
