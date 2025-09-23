// Server/index.js
require("dotenv").config({ path: __dirname + "/.env", override: true });
console.log("[boot] POSTGRES_URL =", (process.env.POSTGRES_URL || "").slice(0, 80) + "...");

const express = require("express");
const cors = require("cors");

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
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "hiking-backend",
    time: new Date().toISOString(),
  });
});

// (optional) DB info ping via pg directly to confirm Neon
// Uncomment if you want a runtime DB check:
//
// const { Pool } = require("pg");
// const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
// app.get("/api/dbinfo", async (_req, res) => {
//   try {
//     const r = await pool.query("SELECT current_database() AS db, current_user AS usr, version()");
//     res.json({ ok: true, ...r.rows[0] });
//   } catch (e) {
//     res.status(500).json({ ok: false, error: String(e) });
//   }
// });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
