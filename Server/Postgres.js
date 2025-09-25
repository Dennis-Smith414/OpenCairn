// Server/Postgres.js
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  // ssl: { rejectUnauthorized: false }, // enable if your host requires SSL
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
      username VARCHAR(32) NOT NULL,
      email VARCHAR(255),
      password VARCHAR(255) NOT NULL,
      create_time TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Routes
  await run(`
    CREATE TABLE IF NOT EXISTS routes (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      create_time TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Cairns
  await run(`
    CREATE TABLE IF NOT EXISTS cairns (
      id SERIAL PRIMARY KEY,
      route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL,
      ele DOUBLE PRECISION,
      name VARCHAR(63) NOT NULL,
      description TEXT,
      create_time TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Comments
  await run(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      cairn_id INT NOT NULL REFERENCES cairns(id) ON DELETE CASCADE ON UPDATE CASCADE,
      content TEXT,
      create_time TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Ratings
  await run(`
    CREATE TABLE IF NOT EXISTS cairn_rating (
      user_id INT NOT NULL REFERENCES users(id),
      cairn_id INT NOT NULL REFERENCES cairns(id),
      val SMALLINT NOT NULL,
      PRIMARY KEY(user_id, cairn_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS route_rating (
      user_id INT NOT NULL REFERENCES users(id),
      route_id INT NOT NULL REFERENCES routes(id),
      val SMALLINT,
      PRIMARY KEY(user_id, route_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS comment_rating (
      user_id INT NOT NULL REFERENCES users(id),
      comment_id INT NOT NULL REFERENCES comments(id),
      val SMALLINT NOT NULL,
      PRIMARY KEY(user_id, comment_id)
    )
  `);

  // GPX
  await run(`
    CREATE TABLE IF NOT EXISTS gpx (
      id SERIAL PRIMARY KEY,
      route_id INT REFERENCES routes(id),
      file BYTEA
    )
  `);
}


module.exports = { init, run, all, get };
