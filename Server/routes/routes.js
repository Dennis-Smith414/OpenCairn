// server/routes/routes.js
const express = require("express");
const router = express.Router();
const db = require("../Postgres");
const authorize = require("../middleware/authorize");

// POST /api/routes  -> create a route (metadata only)
router.post("/", authorize, async (req, res) => {
  try {
    const userId = req.user.id;
    const name = String(req.body?.name || "").trim();
    const region = req.body?.region ?? null;
    if (!name) return res.status(400).json({ ok: false, error: "name-required" });

    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "route";

    let attempt = 0;
    while (attempt < 3) {
      const suffix = Math.random().toString(36).slice(2, 8);
      const slug = `${base}-${suffix}`;
      try {
        const row = await db.get(
          `INSERT INTO routes (slug, name, region, user_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, slug, name, region, created_at, updated_at`,
          [slug, name, region, userId]
        );
        return res.json({ ok: true, route: row });
      } catch (err) {
        if (err.code === "23505") { // unique_violation on slug
          attempt += 1;
          continue; // try another suffix
        }
        throw err; // other errors bubble up
      }
    }
    return res.status(409).json({ ok: false, error: "slug-conflict" });
  } catch (err) {
    console.error("POST /routes error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});


// GET /api/routes  -> paginated list (metadata only)
router.get("/", async (req, res) => {
  try {
    const { offset = 0, limit = 20, q = "" } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const off = parseInt(offset, 10) || 0;
    const where = q ? `WHERE name ILIKE $1 OR slug ILIKE $1` : ``;
    const params = q ? [`%${q}%`, lim, off] : [lim, off];

    const rows = await db.all(
      `
      SELECT id, slug, name, region, created_at, updated_at
        FROM routes
        ${where}
      ORDER BY updated_at DESC
      LIMIT $${q ? 2 : 1} OFFSET $${q ? 3 : 2}
      `,
      params
    );

    res.json({ ok: true, items: rows, nextOffset: off + rows.length });
  } catch (err) {
    console.error("GET /routes error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

// GET /api/routes/:id  -> single route (metadata)
router.get("/:id", async (req, res) => {
  try {
    const row = await db.get(
      `SELECT id, slug, name, region, created_at, updated_at
         FROM routes
        WHERE id = $1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ ok: false, error: "not-found" });
    res.json({ ok: true, route: row });
  } catch (err) {
    console.error("GET /routes/:id error:", err);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

module.exports = router;
