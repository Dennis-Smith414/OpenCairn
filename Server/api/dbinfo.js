const express = require("express");
const router = express.Router();
const { get } = require("../Postgres");

/**
 * GET /api/dbinfo
 * Shows current DB + version (handy for debugging)
 */
router.get("/", async (_req, res) => {
  try {
    const row = await get(`SELECT current_database() AS db, version() AS version`);
    res.json({ ok: true, ...row });
  } catch (e) {
    console.error("GET /api/dbinfo error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

module.exports = router;
