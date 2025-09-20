/**
 * @file index.js
 * @description Minimal Express API backed by **Postgres**.
 * Exposes demo endpoints to verify the backend is running and can read/write trails.
 *
 * Routes:
 *   GET  /api/health                    -> lightweight health check
 *   GET  /api/trails                    -> list up to 50 trails (reads from Postgres)
 *   POST /api/trails {slug,name,region} -> create a trail (writes to Postgres)
 *   GET  /api/dbinfo                    -> (optional) show current DB + version (useful for debugging)
 *
 * Startup:
 *   - Loads environment variables (dotenv)
 *   - Registers common middleware (CORS, JSON body parsing)
 *   - Initializes Postgres schema before serving requests
 *
 * Env:
 *   PORT          - port to bind (defaults to 5000)
 *   POSTGRES_URL  - connection string, e.g. postgres://app:pass@localhost:5432/trails
 *
 * How to run:
 *   1) Ensure Postgres is running (Docker example):
 *        docker run --name trails-pg ^
 *          -e POSTGRES_PASSWORD=pass -e POSTGRES_USER=app -e POSTGRES_DB=trails ^
 *          -p 5432:5432 -d postgres:16
 *   2) In Server/.env set POSTGRES_URL=postgres://app:pass@localhost:5432/trails
 *   3) npm i express cors dotenv pg
 *   4) node index.js
 */

require("dotenv").config(); // Load variables from .env into process.env

const express = require("express");
const cors = require("cors");

// Import Postgres helpers from our local module.
// - init(): prepare DB schema (CREATE TABLE IF NOT EXISTS, indexes, etc.)
// - all():  SELECT returning multiple rows
// - run():  INSERT/UPDATE/DELETE (returns rowCount/rows)
// - get():  SELECT single row (or null)
const { init, all, run, get } = require("./Postgres");

const app = express();

/**
 * Enable Cross-Origin Resource Sharing so a dev frontend
 * can call this API from a different origin during development.
 */
app.use(cors());

/**
 * Parse JSON request bodies into req.body.
 * Required for POST/PUT/PATCH when client sends JSON.
 */
app.use(express.json());

/**
 * GET /api/health
 * Lightweight liveness probe
 *
 * @returns {object} JSON: { ok, service, db, time }
 */
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "hiking-backend",
    db: "postgres",
    time: new Date().toISOString(),
  });
});

/**
 * GET /api/trails
 * Read up to 50 trails from Postgres, newest first.
 *
 * @returns {Array<object>} 200 OK with an array of trails:
 *   [{ id, slug, name, region, created_at }, ...]
 *
 * @example
 * curl http://localhost:5000/api/trails
 */
app.get("/api/trails", async (_req, res) => {
  try {
    const rows = await all(
      `SELECT id, slug, name, region, created_at
         FROM trails
        ORDER BY created_at DESC
        LIMIT 50`
    );
    res.json(rows);
  } catch (e) {
    console.error("GET /api/trails error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * POST /api/trails
 * Insert a trail into Postgres (id is auto-generated).
 * Uses Postgres placeholders ($1,$2,$3) and an upsert guard on slug.
 *
 * Body:
 *   {
 *     "slug": "evergreen",
 *     "name": "Evergreen Trail",
 *     "region": "CO"
 *   }
 *
 * @returns {object} JSON: { ok: true }
 *
 * @example
 * curl -X POST http://localhost:5000/api/trails ^
 *   -H "Content-Type: application/json" ^
 *   -d "{\"slug\":\"evergreen\",\"name\":\"Evergreen Trail\",\"region\":\"CO\"}"
 */
app.post("/api/trails", async (req, res) => {
  try {
    const { slug, name, region } = req.body || {};
    if (!slug || !name) {
      return res
        .status(400)
        .json({ ok: false, error: "slug and name are required" });
    }

    await run(
      `INSERT INTO trails (slug, name, region)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, name, region || ""]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/trails error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * (Optional) GET /api/dbinfo
 * Quick way to prove we're talking to Postgres and which DB we're on.
 *
 * @example
 * curl http://localhost:5000/api/dbinfo
 */
app.get("/api/dbinfo", async (_req, res) => {
  try {
    const row = await get(
      "SELECT current_database() AS db, version() AS version"
    );
    res.json({ ok: true, ...row });
  } catch (e) {
    console.error("GET /api/dbinfo error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * Start the HTTP server only AFTER the DB is initialized.
 * Default port 5000; override with PORT in environment or .env file.
 */
const PORT = process.env.PORT || 5000;
let server;

(async () => {
  try {
    await init();
    console.log("Postgres ready");

    server = app.listen(PORT, () =>
      console.log(`Backend listening on http://localhost:${PORT}`)
    );
  } catch (err) {
    console.error("Postgres init failed:", err);
    process.exit(1); // Exit early—no DB means no API.
  }
})();

/**
 * Graceful shutdown:
 * Close the HTTP server first; pg Pool will close when Node exits.
 */
function shutdown(signal) {
  console.log(`\n${signal} received; shutting down...`);
  if (server) {
    server.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));


app.get("/api/trails/delta", async (req, res) => {
  try {
    const since = req.query.since ? new Date(req.query.since) : new Date(0);
    const limit = Math.min(Number(req.query.limit || 500), 2000);
    const rows = await all(
      `SELECT id, slug, name, region, created_at, updated_at, deleted_at
         FROM trails
        WHERE updated_at > $1
        ORDER BY updated_at ASC
        LIMIT $2`,
      [since, limit]
    );
    const nextSince = rows.length ? rows[rows.length - 1].updated_at : since;
    res.json({ ok: true, rows, nextSince });
  } catch (e) {
    console.error("GET /api/trails/delta error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});
