// Server/index.js
require("dotenv").config({ path: __dirname + "/.env", override: true });

if (!process.env.DATABASE_URL) {
  console.error("[boot] ❌ No DATABASE_URL found. Check your .env");
  process.exit(1);
}

console.log("[boot] DATABASE_URL =", process.env.DATABASE_URL);

const express = require("express");
const cors = require("cors");
const db = require("./Postgres"); // <- use the shared pool + init()

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const waypointRoutes = require("./routes/waypoints");
const ratingRoutes = require("./routes/ratings");
const commentsRoutes = require("./routes/comments");
const gpxRoutes = require("./routes/gpx");       // now: uploads only
const routesRoutes = require("./routes/routes"); // new: list/meta/geojson/CRUD
const uploadRoutes = require("./routes/upload");

const PORT = process.env.PORT || 5100;
const app = express();

app.use(cors());
app.use(express.json());

// optional: catch async errors
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});

// Boot sequence
(async () => {
  try {
    // Ensure every connection has the right search_path
    // (you can also do this in Postgres.js via pool.on('connect', ...))

    // Create/verify schema objects
    await db.init();

    // Simple connectivity check using shared pool
    const now = await db.get("SELECT NOW() AS now");
    console.log("[boot] ✅ DB connection OK, time:", now.now ?? now?.now);

    // Mount routes AFTER init succeeds
    app.use("/api/auth", authRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/waypoints", waypointRoutes);
    app.use("/api/ratings", ratingRoutes);
    app.use("/api/comments", commentsRoutes);
    app.use("/api/upload", uploadRoutes);

    // Route + GPX separation
    app.use("/api/routes", routesRoutes); // GET /, GET /:id, GET /:id/gpx, POST, PATCH, DELETE
    app.use("/api", gpxRoutes);           // POST /routes/:id/gpx, POST /routes/upload, ping

    // health
    app.get("/api/health", (_req, res) => {
      res.json({ ok: true, db: true, startedAt: new Date().toISOString() });
    });

    app.listen(PORT, () =>
      console.log(`Backend listening on http://10.0.2.2:${PORT}`)
    );
  } catch (err) {
    console.error("[boot] ❌ Startup failed:", err);
    process.exit(1);
  }
})();
