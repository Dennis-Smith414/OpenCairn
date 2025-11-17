// offline/routes/gpx.js
// Offline GPX router
//
// In the online server, this file handles GPX uploads and writes them
// into Postgres/PostGIS. In offline mode, the device should NOT be
// uploading GPX to itself; instead, GPX is synced from the remote
// server into the local SQLite `gpx` table and read via /routes endpoints.
//
// So here we only expose a ping + explicit "not supported offline" stubs.

const express = require("express");
const router = express.Router();

// Simple health check so you can verify this router is mounted
router.get("/routes/ping", (_req, res) => {
  res.json({ ok: true, where: "offline-gpx-router" });
});

// Stub: POST /routes/:id/gpx (not supported offline)
router.post("/routes/:id/gpx", (_req, res) => {
  res.status(501).json({
    ok: false,
    error: "gpx-upload-not-supported-offline",
    message: "Upload GPX to the online server; offline DB only stores synced/cached GPX.",
  });
});

// Stub: POST /routes/upload (not supported offline)
router.post("/routes/upload", (_req, res) => {
  res.status(501).json({
    ok: false,
    error: "gpx-upload-not-supported-offline",
    message: "Upload GPX to the online server; offline DB only stores synced/cached GPX.",
  });
});

module.exports = router;
