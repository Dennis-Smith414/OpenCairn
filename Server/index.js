/**
 * @file index.js
 * @description Minimal Express API backed by SQLite.
 * Exposes demo endpoints to verify the backend is running and can read/write trails.
 *
 * Routes:
 *   GET  /api/health  -> lightweight health check
 *   GET  /api/trails  -> list up to 50 trails (reads from SQLite)
 *   POST /api/trails  -> create a trail (writes to SQLite)
 *
 * Startup:
 *   - Loads environment variables (dotenv)
 *   - Registers common middleware (CORS, JSON body parsing)
 *   - Initializes SQLite (tables + PRAGMAs) before serving requests
 *
 * Env:
 *   PORT (optional) - the port to bind (defaults to 5000)
 */


require("dotenv").config(); // Load variables from .env into process.env

const express = require("express");
const cors = require("cors");

// Import SQLite helpers from our local module.
// - init(): prepare DB (PRAGMAs + tables)
// - all():  SELECT returning multiple rows
// - run():  INSERT/UPDATE/DELETE returning metadata (lastID/changes)
const { init, all, run } = require("./sqlitedb");


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
 * Ensure the SQLite database file exists, PRAGMAs are set,
 * and required tables are created before we accept traffic.
 * If init() rejects, we log the error and keep the process alive so you can see it.
 */
init().then(() => console.log("SQLite ready: hike.db")).catch(console.error);


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
    db: "sqlite",
    time: new Date().toISOString(),
  });
});


/**
 * GET /api/trails
 * Read up to 50 trails from SQLite, newest first.
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
    res.status(500).json({ ok: false, error: String(e) });
  }
});


/**
 * Start the HTTP server.
 * Default port 5000; override with PORT in environment or .env file.
 */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Backend listening on http://localhost:${PORT}`)
);
