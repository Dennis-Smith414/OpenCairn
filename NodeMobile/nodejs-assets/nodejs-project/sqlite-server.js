/*
 * sqlite-server.js
 *
 * Embedded offline backend for React Native using NodeMobile + sql.js.
 * - Mirrors Neon/Postgres schema (2025-09 version) for easier sync.
 * - Exposes local HTTP endpoints for the RN frontend.
 * - Persists SQLite database to device storage.
 */

const rn_bridge = require('rn-bridge');
const http = require('http');
const fs = require('fs');
const path = require('path');

let SQL = null;
let db = null;

const STARTED_AT = Date.now();
const DATA_DIR = process.env.NODEJS_MOBILE_APPDATADIR || __dirname;
const DB_PATH = path.join(DATA_DIR, 'hike.sqlite');
const WASM_PATH = path.join(__dirname, 'sql-wasm.wasm');

// -----------------------------------------------------------------------------
//  DB Initialization
// -----------------------------------------------------------------------------
async function openDatabase() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs({ locateFile: (file) => path.join(__dirname, file) });

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    db = new SQL.Database();
  }

  db.run(`PRAGMA foreign_keys = ON;`);

  // ---------------------------------------------------------------------------
  // Mirror Neon/Postgres schema (simplified for offline use)
  // ---------------------------------------------------------------------------
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT,
      password TEXT NOT NULL,
      create_time TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      region TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS waypoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE ON UPDATE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      ele REAL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      waypoint_id INTEGER NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE ON UPDATE CASCADE,
      content TEXT,
      create_time TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS waypoint_rating (
      user_id INTEGER NOT NULL REFERENCES users(id),
      waypoint_id INTEGER NOT NULL REFERENCES waypoints(id),
      val INTEGER NOT NULL,
      PRIMARY KEY (user_id, waypoint_id)
    );

    CREATE TABLE IF NOT EXISTS route_rating (
      user_id INTEGER NOT NULL REFERENCES users(id),
      route_id INTEGER NOT NULL REFERENCES routes(id),
      val INTEGER,
      PRIMARY KEY (user_id, route_id)
    );

    CREATE TABLE IF NOT EXISTS comment_rating (
      user_id INTEGER NOT NULL REFERENCES users(id),
      comment_id INTEGER NOT NULL REFERENCES comments(id),
      val INTEGER NOT NULL,
      PRIMARY KEY (user_id, comment_id)
    );

    CREATE TABLE IF NOT EXISTS gpx (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
      name TEXT,
      geometry TEXT NOT NULL, -- store GeoJSON string for Leaflet offline
      file BLOB NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  saveDatabase();
  rn_bridge.channel.send('[sqlite] DB ready');
}

// -----------------------------------------------------------------------------
//  Save DB to disk
// -----------------------------------------------------------------------------
function saveDatabase() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// -----------------------------------------------------------------------------
//  HTTP helpers
// -----------------------------------------------------------------------------
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 1e6) req.destroy(); // prevent abuse
    });
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

// -----------------------------------------------------------------------------
//  Routes helpers (for offline browsing)
// -----------------------------------------------------------------------------
function routesList() {
  const stmt = db.prepare(`SELECT * FROM routes ORDER BY id DESC`);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function routesInsert({ slug, name, region }) {
  const stmt = db.prepare(`
    INSERT INTO routes(slug, name, region, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  stmt.run([slug, name, region || '']);
  stmt.free();
  saveDatabase();
}

// -----------------------------------------------------------------------------
//  Waypoints helpers (offline creation & retrieval)
// -----------------------------------------------------------------------------
function waypointsList(routeId = null) {
  let stmt;
  if (routeId) {
    stmt = db.prepare(`SELECT * FROM waypoints WHERE route_id = ? ORDER BY id DESC`);
    stmt.bind([routeId]);
  } else {
    stmt = db.prepare(`SELECT * FROM waypoints ORDER BY id DESC`);
  }
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function waypointsInsert({ route_id, lat, lng, name, description, ele }) {
  const stmt = db.prepare(`
    INSERT INTO waypoints(route_id, lat, lng, name, description, ele, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run([route_id, lat, lng, name, description || '', ele || null]);
  stmt.free();
  saveDatabase();
}

// -----------------------------------------------------------------------------
//  Embedded HTTP Server (offline API)
// -----------------------------------------------------------------------------
http.createServer(async (req, res) => {
  try {
    if (!db) return json(res, 503, { ok: false, error: 'db not ready' });

    // Health check
    if (req.method === 'GET' && req.url === '/api/health') {
      return json(res, 200, { ok: true, db: true, startedAt: STARTED_AT });
    }

    // Routes list
    if (req.method === 'GET' && req.url === '/api/routes') {
      return json(res, 200, { ok: true, routes: routesList() });
    }

    // Insert route
    if (req.method === 'POST' && req.url === '/api/routes') {
      const { slug, name, region } = await readJson(req);
      if (!slug || !name) return json(res, 400, { ok: false, error: 'slug and name required' });
      try {
        routesInsert({ slug, name, region });
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 400, { ok: false, error: String(e) });
      }
    }

    // Waypoints list (optionally filtered by ?route_id)
    if (req.method === 'GET' && req.url.startsWith('/api/waypoints')) {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const routeId = urlObj.searchParams.get('route_id');
      const waypoints = waypointsList(routeId ? parseInt(routeId, 10) : null);
      return json(res, 200, { ok: true, waypoints });
    }

    // Insert waypoint
    if (req.method === 'POST' && req.url === '/api/waypoints') {
      const { route_id, lat, lng, name, description, ele } = await readJson(req);
      if (!route_id || !lat || !lng || !name) {
        return json(res, 400, { ok: false, error: 'route_id, lat, lng, and name required' });
      }
      try {
        waypointsInsert({ route_id, lat, lng, name, description, ele });
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 400, { ok: false, error: String(e) });
      }
    }

    // Future: Sync handler
    if (req.method === 'POST' && req.url === '/api/sync') {
      // TODO: implement Neon ↔ SQLite sync here
      return json(res, 200, { ok: true, synced: 0 });
    }

    json(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    json(res, 500, { ok: false, error: e.message });
  }
}).listen(5050, '0.0.0.0', () => {
  rn_bridge.channel.send('[sqlite] HTTP server listening on :5050');
});

// -----------------------------------------------------------------------------
//  Boot
// -----------------------------------------------------------------------------
(async () => {
  try {
    if (!fs.existsSync(WASM_PATH)) {
      throw new Error(`Missing sql-wasm.wasm next to sqlite-server.js`);
    }
    await openDatabase();
  } catch (e) {
    rn_bridge.channel.send('[sqlite] init failed: ' + e.message);
  }
})();
