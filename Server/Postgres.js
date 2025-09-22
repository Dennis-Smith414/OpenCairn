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
  // --- base tables ---
  await run(`
    CREATE TABLE IF NOT EXISTS trails (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      region TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // helpful index (UNIQUE already on slug; this is idempotent)
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS trails_slug_key ON trails(slug)`);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // case-insensitive lookups (match your LOWER(...) checks)
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users ((LOWER(username)))`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users ((LOWER(email)))`);
}

module.exports = { init, run, all, get, pool };
