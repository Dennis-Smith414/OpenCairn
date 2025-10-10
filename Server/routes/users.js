const express = require("express");
const { Pool } = require("pg");
const authorize = require('../middleware/authorize');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// This route is protected. It will first run the 'authorize' middleware.
// If the token is valid, `req.user` will be populated.
router.get("/me", authorize, async (req, res) => {
  try {
    const userId = req.user.id; // Get the user ID from the decoded token

    const result = await pool.query(
      "SELECT id, username, email, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "User not found." });
    }

    res.json({ ok: true, user: result.rows[0] });

  } catch (e) {
    console.error("GET /api/users/me ", e);
    res.status(500).json({ ok: false, error: "Server error." });
  }
});

module.exports = router;