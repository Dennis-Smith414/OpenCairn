const express = require("express");
const router = express.Router();

/**
 * GET /api/health
 * Lightweight liveness probe
 */
router.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "hiking-backend",
    db: "postgres",
    time: new Date().toISOString(),
  });
});

module.exports = router;
