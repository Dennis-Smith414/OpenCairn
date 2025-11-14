// offline/index.js
const express = require("express");
const { init, DB_PATH } = require("./db/init");

// Offline route modules
const commentsRoutes = require("./routes/comments");
const gpxRoutes = require("./routes/gpx");
const ratingsRoutes = require("./routes/ratings");
const routesRoutes = require("./routes/routes");
const waypointsRoutes = require("./routes/waypoints");
const downloadRoutes = require("./routes/download");

const PORT = process.env.OFFLINE_PORT || 5101;

async function start() {
  try {
    // 1) Initialize the SQLite DB (creates file + schema if needed)
    await init({ withSeed: false }); // set to false after testing

    // 2) Start HTTP server
    const app = express();
    app.use(express.json());

    // Simple health check endpoint for the React Native app
    app.get("/ping", (_req, res) => {
      res.json({
        ok: true,
        service: "offline-db",
        dbPath: DB_PATH,
      });
    });

    app.use("/api/comments", commentsRoutes);
    app.use("/api/ratings", ratingsRoutes);
    app.use("/api/routes", routesRoutes);
    app.use("/api/waypoints", waypointsRoutes);
    app.use("/api", gpxRoutes);
    app.use("/api/sync", downloadRoutes);

    // Optional: offline-specific health endpoint
    app.get("/api/health", (_req, res) => {
      res.json({
        ok: true,
        db: true,
        offline: true,
        startedAt: new Date().toISOString(),
      });
    });

    app.listen(PORT, () => {
      console.log(`[offline] listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("[offline] Failed to start offline server:", err);
    process.exit(1);
  }
}

start();
