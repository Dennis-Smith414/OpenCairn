// Server/index.js
require("dotenv").config({ path: __dirname + "/.env", override: true });
console.log('[boot] DATABASE_URL =', process.env.DATABASE_URL);

const express = require("express");
const cors = require("cors");
const PORT = process.env.PORT || 5050;

// Full GPX/Trails router (list, meta, geojson, bbox, upload)
const gpxRoutes = require("./routes/gpx");
const authRoutes = require("./routes/auth");

const app = express();
app.use(cors());
app.use(express.json());

// mount the routes under /api
app.use("/api", gpxRoutes);
app.use("/api/auth", authRoutes);

// health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: true, startedAt: new Date().toISOString() });
});

// (optional) DB info ping via pg directly to confirm Neon
// Uncomment if you want a runtime DB check:
//
// const { Pool } = require("pg");
// const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// app.get("/api/dbinfo", async (_req, res) => {
//   try {
//     const r = await pool.query("SELECT current_database() AS db, current_user AS usr, version()");
//     res.json({ ok: true, ...r.rows[0] });
//   } catch (e) {
//     res.status(500).json({ ok: false, error: String(e) });
//   }
// });


app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
