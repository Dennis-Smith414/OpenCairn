const express = require("express"); // Imports express so routes can be created
const bcrypt = require("bcryptjs"); // Built in hashing functions 
const { get, run } = require("../Postgres"); // Pulls out helpers 'get', 'run' from the Postgres module 

const router = express.Router(); // Creates an object for creating routes to keep things modular 

const isNonEmpty = (s) => typeof s === "string" && s.trim().length > 0; // Returns true if the input is a real, non-empty string 

const strongPwd = (s) => 
  typeof s === "string" && // Makes sure the input is a string 
  s.length >= 8 && // Password most be at least 8 characters 
  /[A-Z]/.test(s) && // Checks for atleast 1 uppercase 
  /[^A-Za-z0-9]/.test(s); // Checks for atleast 1 symbol

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/**
 * POST /api/auth/register
 * Body: { username, email, password }
 */
router.post("/register", async (req, res) => {
  try {
    let { username, email, password } = req.body || {};
    username = (username || "").trim();
    email = (email || "").trim();

    if (!isNonEmpty(username) || !isNonEmpty(email) || !isNonEmpty(password)) {
      return res.status(400).json({ ok: false, error: "All fields are required." });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ ok: false, error: "Invalid email format." });
    }
    if (!strongPwd(password)) {
      return res.status(400).json({
        ok: false,
        error: "Password must be ≥ 8 chars with 1 uppercase and 1 symbol.",
      });
    }

    // Uniqueness (case-insensitive)
    const existing = await get(
      `SELECT id FROM users WHERE LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($2)`,
      [username, email]
    );
    if (existing) {
      return res.status(409).json({ ok: false, error: "Username or email already in use." });
    }

    const hash = await bcrypt.hash(password, 10);
    const inserted = await get(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, created_at`,
      [username, email, hash]
    );

    return res.status(201).json({ ok: true, user: inserted });
  } catch (e) {
    console.error("POST /api/auth/register error:", e);
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

module.exports = router;
