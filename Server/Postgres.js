// Server/Postgres.js
require('dotenv').config();

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
  // Users
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

  // Routes
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
  await run(`CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes(user_id);`);


  // Waypoints
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
await run(`CREATE INDEX IF NOT EXISTS idx_waypoints_route_id ON waypoints(route_id);`);
await run(`CREATE INDEX IF NOT EXISTS idx_waypoints_user_id ON waypoints(user_id);`);

  // Waypoint comments
  await run(`
    CREATE TABLE IF NOT EXISTS waypoint_comments (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      waypoint_id INT NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE ON UPDATE CASCADE,
      content TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      edited BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_wp_comments_user_id ON waypoint_comments(user_id);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_wp_comments_waypoint_id ON waypoint_comments(waypoint_id);`);

    // Route comments
    await run(`
      CREATE TABLE IF NOT EXISTS route_comments (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) SET NULL CASCADE ON UPDATE CASCADE,
        route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
        content TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        edited BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_route_comments_user_id ON route_comments(user_id);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_route_comments_route_id ON route_comments(route_id);`);

  //Waypoint ratings
  await run(`
    CREATE TABLE IF NOT EXISTS waypoint_ratings (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      waypoint_id INT NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE ON UPDATE CASCADE,
      val SMALLINT NOT NULL,
      PRIMARY KEY(user_id, waypoint_id)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_wp_ratings_waypoint_id ON waypoint_ratings(waypoint_id);`);


    //Route ratings
  await run(`
    CREATE TABLE IF NOT EXISTS route_ratings (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
      val SMALLINT NOT NULL,
      PRIMARY KEY(user_id, route_id)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_route_ratings_route_id ON route_ratings(route_id);`);

    //Waypoint comment ratings
  await run(`
    CREATE TABLE IF NOT EXISTS waypoint_comment_ratings (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      waypoint_comment_id INT NOT NULL REFERENCES waypoint_comments(id) ON DELETE CASCADE ON UPDATE CASCADE,
      val SMALLINT NOT NULL,
      PRIMARY KEY(user_id, waypoint_comment_id)
      )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_wp_comment_ratings_cmt_id ON waypoint_comment_ratings(waypoint_comment_id);`);


   //Route comment ratings
  await run(`
    CREATE TABLE IF NOT EXISTS route_comment_ratings (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      route_comment_id INT NOT NULL REFERENCES route_comments(id) ON DELETE CASCADE ON UPDATE CASCADE,
      val SMALLINT NOT NULL,
      PRIMARY KEY(user_id, route_comment_id)
      )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_route_comment_ratings_cmt_id ON route_comment_ratings(route_comment_id);`);

  // GPX
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
    await run(`CREATE INDEX IF NOT EXISTS idx_gpx_route_id ON gpx(route_id);`);
    await run(`CREATE INDEX IF NOT EXISTS idx_gpx_geom_gist ON gpx USING GIST (geometry);`);

}


module.exports = { init, run, all, get };
