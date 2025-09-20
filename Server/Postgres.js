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
  // Create table if missing
  await run(`
    CREATE TABLE IF NOT EXISTS trails (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      region TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Helpful index (unique already created by UNIQUE constraint on slug)
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS trails_slug_key ON trails(slug)`);
}

module.exports = { init, run, all, get };
