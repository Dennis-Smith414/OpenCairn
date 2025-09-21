/*
 * Endpoints:
 *   GET  /api/health              → { ok, db:true, startedAt }
 *   GET  /api/kv/:key             → read KV from SQLite
 *   POST /api/kv/:key {value}     → upsert KV into SQLite
 *   GET  /api/routes              → list routes
 *   POST /api/routes {slug,name,region} → insert route
 *   POST /api/_migrate_kv         → one-shot: import old kv.json into SQLite (if present)
 */




/**
 * sample-main.js (NodeMobile embedded backend)
 *
 * This file boots a tiny HTTP server inside the React Native app and provides an
 * offline SQLite database using sql.js (WASM). Data is persisted to a binary
 * file on the device so it survives app restarts.
 *
 * - sql.js (WASM): SQLite compiled to WebAssembly, runs entirely in-process
 * - DB persistence: we export the in-memory DB to `<DATA_DIR>/hike.sqlite`
 * - DATA_DIR: writable app-private directory provided by NodeMobile
 *
 * Files expected next to this script (in nodejs-assets/nodejs-project/):
 *   - sample-main.js       (this file)
 *   - sql-wasm.wasm        (WASM binary required by sql.js)
 *
 * Note on DATA_DIR:
 *   NODEJS_MOBILE_APPDATADIR is set by NodeMobile to the app’s private "files/"
 *   directory. If not set (rare), we fall back to __dirname (the nodejs-project
 *   folder). Both locations are writable in the embedded runtime.
 */
const rn_bridge = require('rn-bridge'); // Node message channel for debug logs 

// In our app, it runs a tiny REST API that listens on port 8080.
// Instead of serving HTML webpages, it serves JSON data
// so the React Native app (or curl) can hit endpoints like /api/health or /api/routes.
const http = require('http');

const fs = require('fs'); // Allows Node.js to read and write files on the devices system, without fs, data would vanish when the app closes
const path = require('path'); // Safely builds file system paths 



// ------
//
// Used for debugging to confirm the SQL Database is firing up
//
// ------
// const send = (tag, data) => { try { rn_bridge.channel.send(data ? `${tag}: ${JSON.stringify(data)}` : tag); } catch {} };
// send('NODE:BOOT');

const STARTED_AT = Date.now(); 
// Timestamp (ms since epoch) when the Node backend started.
// Used by /api/health to report uptime.


const DATA_DIR = process.env.NODEJS_MOBILE_APPDATADIR || __dirname; // Points to the app private writable storage directory 

// SQLite handles:
// - SQL = the sql.js module (loaded from WASM, contains Database class)
// - db  = the current Database instance (in-memory, saved to disk with export())
let SQL = null;
let db = null;

// Full path where we store the actual SQLite database file.
// - DATA_DIR = writable folder (app-private storage on device, __dirname on dev)
// - "hike.sqlite" = filename of the DB
const DB_PATH = path.join(DATA_DIR, 'hike.sqlite');
const WASM_PATH = path.join(__dirname, 'sql-wasm.wasm'); /// Full path to the WebAssembly binary required by sql.js

async function openDatabase() {

    const initSqlJs = require('sql.js');  // Imports the sql.js initializer function

     // Loads the WASM file into memory and returns a ready-to-use-object
    SQL = await initSqlJs({ locateFile: (file) => path.join(__dirname, file) });


      // Load existing DB if present, else create new
      if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(new Uint8Array(fileBuffer));
      } else {
        db = new SQL.Database();
      }

      // Ensure schema
      db.run(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS kv (
          k TEXT PRIMARY KEY,
          v TEXT
        );

        CREATE TABLE IF NOT EXISTS routes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          region TEXT DEFAULT '',
          created_at TEXT NOT NULL
        );
      `);

      send('NODE:SQL_READY');
}

function saveDatabase() {
  // Export in-memory DB to a binary file so it persists across app restarts
  const data = db.export(); // Uint8Array
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// --- KV helpers (backed by SQLite) ---
function kvGet(key) {
  // 1. Prepare a SQL SELECT statement
  const stmt = db.prepare('SELECT v FROM kv WHERE k = ?');

  // 2. Bind the given key into the ? placeholder
  stmt.bind([key]);

  // 3. Step the statement (advance to the first row, if any)
  const hasRow = stmt.step();

  // 4. If a row exists, grab it as a JS object { k: ..., v: ... }
  const row = hasRow ? stmt.getAsObject() : null;

  // 5. Always free resources when done
  stmt.free();

  // 6. Return just the value (v), or null if no row found
  return row ? row.v : null;
}


function kvSet(key, value) {
  // 1. Prepare an INSERT statement with "upsert" behavior
  const stmt = db.prepare(`
    INSERT INTO kv(k, v) VALUES(?, ?)
    ON CONFLICT(k) DO UPDATE SET v = excluded.v
  `);

  // 2. Run it, substituting the placeholders (?) with key + value
  stmt.run([key, value]);

  // 3. Free the statement resources
  stmt.free();

  // 4. Persist the in-memory DB to disk (hike.sqlite)
  saveDatabase();
}


// --- Routes helpers ---

/**
 * Fetch all routes from the database.
 * - Returns rows ordered newest → oldest (by ID).
 * - Each row looks like: { id, slug, name, region, created_at }.
 * Used by GET /api/routes.
 */
function routesList() {
  const rows = [];
  const stmt = db.prepare(`
    SELECT id, slug, name, region, created_at 
    FROM routes
    ORDER BY id DESC
  `);

  // Step through each row returned by SQLite
  while (stmt.step()) rows.push(stmt.getAsObject());

  stmt.free(); // release resources
  return rows; // return array of JS objects
}


/**
 * Insert a new route into the database.
 * - slug: URL-safe string (unique)
 * - name: human-readable route name
 * - region: optional text (e.g., "WI")
 * - created_at: auto-filled with current timestamp
 *
 * Example: routesInsert({ slug: "pine-loop", name: "Pine Loop Trail", region: "WI" })
 * Used by POST /api/routes.
 */
function routesInsert({ slug, name, region }) {
  const stmt = db.prepare(`
    INSERT INTO routes(slug, name, region, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `);

  // Run with provided values
  stmt.run([slug, name, region || '']);
  stmt.free();

  // Persist the updated DB to hike.sqlite on disk
  saveDatabase();
}

// --- HTTP helpers ---

/**
 * Send a JSON response.
 * - Sets the HTTP status code and content-type.
 * - Serializes the body object into JSON.
 *
 * Example: json(res, 200, { ok: true })
 */
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Read and parse a JSON request body.
 * - Buffers chunks from the request stream.
 * - Rejects if parsing fails or body is too large (>1MB).
 * - Resolves to a JS object ({} if body empty).
 *
 * Example: const { slug, name } = await readJson(req);
 */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let buf = '';

    // Accumulate chunks
    req.on('data', (c) => {
      buf += c;
      if (buf.length > 1e6) req.destroy(); // safety check
    });

    // Parse when finished
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); }
      catch (e) { reject(e); }
    });
  });
}



// -----------------------------------------------------------------------------
/**
 * Embedded HTTP server (runs inside the mobile app).
 *
 * Purpose:
 * - Exposes simple REST API endpoints (like /api/health, /api/routes).
 * - Returns JSON, not HTML → lets the React Native frontend fetch data directly.
 * - All requests stay on the device (offline-first).
 *
 * Flow:
 *   React Native (fetch) → local HTTP server → SQLite (hike.sqlite) → JSON response
 *
 * Benefits:
 * - Same "API style" as a real backend server, but works offline.
 * - App UI doesn’t need to know if data came from local SQLite or remote Postgres later.
 */

// Endpoints:
//   GET  /api/health          → liveness + DB status
//   GET  /api/kv/:key         → read a KV entry
//   POST /api/kv/:key         → upsert a KV entry  { value: "..." }
//   GET  /api/routes          → list routes (from SQLite)
//   POST /api/routes          → insert a route     { slug, name, region? }
//   POST /api/_migrate_kv     → one-shot: import old kv.json → SQLite
// -----------------------------------------------------------------------------
http.createServer(async (req, res) => {
  try {
    // If DB hasn't been opened yet, fail fast so callers can retry.
    if (!db) {
      return json(res, 503, { ok: false, error: 'db not ready' });
    }

    // ---- Health check -------------------------------------------------------
    if (req.method === 'GET' && req.url === '/api/health') {
      const dbUp = !!db;
      return json(res, 200, {
        ok: true,
        db: dbUp,           // legacy flag our RN UI reads
        sql: dbUp,          // alias for clarity
        startedAt: STARTED_AT, // epoch ms when backend started
      });
    }

    // ---- KV read: GET /api/kv/:key -----------------------------------------
    if (req.method === 'GET' && req.url.startsWith('/api/kv/')) {
      const key = decodeURIComponent(req.url.slice('/api/kv/'.length));
      return json(res, 200, { ok: true, value: kvGet(key) });
    }

    // ---- KV write: POST /api/kv/:key  body: { "value": "..." } -------------
    if (req.method === 'POST' && req.url.startsWith('/api/kv/')) {
      const key = decodeURIComponent(req.url.slice('/api/kv/'.length));
      const { value } = await readJson(req);
      kvSet(key, String(value ?? ''));
      return json(res, 200, { ok: true });
    }

    // ---- Routes list: GET /api/routes --------------------------------------
    if (req.method === 'GET' && req.url === '/api/routes') {
      return json(res, 200, { ok: true, routes: routesList() });
    }

    // ---- Routes insert: POST /api/routes -----------------------------------
    // Body: { slug, name, region? }
    if (req.method === 'POST' && req.url === '/api/routes') {
      const { slug, name, region } = await readJson(req);
      if (!slug || !name) {
        return json(res, 400, { ok: false, error: 'slug and name required' });
      }
      try {
        routes({ slug, name, region });
        return json(res, 200, { ok: true });
      } catch (e) {
        // Likely UNIQUE(slug) violation or similar
        return json(res, 400, { ok: false, error: String((e && e.message) || e) });
      }
    }

    // ---- One-shot migration: POST /api/_migrate_kv --------------------------
    // Reads kv.json (old file-based KV) from DATA_DIR and imports to SQLite.
    if (req.method === 'POST' && req.url === '/api/_migrate_kv') {
      const KV_JSON_PATH = path.join(DATA_DIR, 'kv.json');
      if (!fs.existsSync(KV_JSON_PATH)) {
        return json(res, 200, { ok: true, migrated: 0, note: 'no kv.json' });
      }
      const obj = JSON.parse(fs.readFileSync(KV_JSON_PATH, 'utf8') || '{}');
      let count = 0;
      for (const [k, v] of Object.entries(obj)) {
        kvSet(k, String(v));
        count++;
      }
      // Optional cleanup:
      // fs.unlinkSync(KV_JSON_PATH);
      return json(res, 200, { ok: true, migrated: count });
    }

    // ---- No matching route --------------------------------------------------
    json(res, 404, { error: 'not found' });

  } catch (e) {
    // Debug-only: send error back to RN console (safe to remove if send() disabled)
    // send('NODE:HTTP_ERR', { error: String(e) });
    json(res, 500, { error: 'internal' });
  }
})
// Start listening on all interfaces so the RN runtime can reach us.
.listen(8080, '0.0.0.0', () => {
  // Debug-only: signal that HTTP server is ready
  // send('NODE:HTTP_READY');
  // console.log('HTTP server ready on :8080');
});

// -----------------------------------------------------------------------------
// Boot sequence: load the sql.js engine (WASM) and open/prepare the database.
// Fails gracefully if the WASM asset is missing.
// -----------------------------------------------------------------------------
(async () => {
  try {
    if (!fs.existsSync(WASM_PATH)) {
      throw new Error('sql-wasm.wasm missing next to sample-main.js');
    }
    await openDatabase(); // loads WASM, opens/creates DB, ensures schema, etc.
  } catch (e) {
    // Debug-only: surface the reason to RN console
    // send('NODE:SQL_DISABLED', { reason: String((e && e.message) || e) });
    // console.error('SQL init failed:', e);
  }
})();
