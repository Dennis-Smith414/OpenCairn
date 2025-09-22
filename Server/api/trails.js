const express = require("express");
const router = express.Router();
const { all, run } = require("../Postgres");

// Helper: Cleans up Trail inputs, and verifies the input is a string 
const isNonEmptyString = (x) => typeof x === "string" && x.trim().length > 0;

/**
 * GET /api/trails
 * List newest first, up to 50
 */
router.get("/", async (_req, res) => {
  try {
    // 1. Query the database for trails
    const rows = await all(
      `SELECT id, slug, name, region, created_at
         FROM trails
        ORDER BY created_at DESC
        LIMIT 50`
    );

    // 2. Send the results back as JSON
    res.json(rows);
  } catch (e) {
    // 3. If something goes wrong, log it and return an error response
    console.error("GET /api/trails error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});


router.post("/", async (req, res) => {
  try {
    // 1. Pull data out of the request body
    const { slug, name, region } = req.body || {};

    // 2. Validate that slug + name are non-empty strings
    if (!isNonEmptyString(slug) || !isNonEmptyString(name)) {
      return res
        .status(400)
        .json({ ok: false, error: "slug and name are required non-empty strings" });
    }

    // 3. Insert into database
    await run(
      `INSERT INTO trails (slug, name, region)
       VALUES ($1,$2,$3)
       ON CONFLICT (slug) DO NOTHING`,
      [slug.trim(), name.trim(), typeof region === "string" ? region : ""]
    );

    // 4. Respond with success
    res.json({ ok: true });

  } catch (e) {
    // 5. Handle errors
    console.error("POST /api/trails error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});


/**
 * GET /api/trails/delta?since=ISO&limit=500
 * Incremental sync window by updated_at
 */
router.get("/delta", async (req, res) => {
  try {
    // 1. Parse query params
    const since = req.query.since ? new Date(req.query.since) : new Date(0);
    const limit = Math.min(Number(req.query.limit || 500), 2000);

    // 2. Query DB for rows updated after "since"
    const rows = await all(
      `SELECT id, slug, name, region, created_at, updated_at, deleted_at
         FROM trails
        WHERE updated_at > $1
        ORDER BY updated_at ASC
        LIMIT $2`,
      [since, limit]
    );

    // 3. Find the newest "updated_at" in this batch
    const nextSince = rows.length ? rows[rows.length - 1].updated_at : since;

    // 4. Return rows plus the new "cursor"
    res.json({ ok: true, rows, nextSince });

  } catch (e) {
    console.error("GET /api/trails/delta error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});


module.exports = router;
