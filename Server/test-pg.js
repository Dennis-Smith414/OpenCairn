const { Pool } = require("pg");

// Use the env var POSTGRES_URL you set earlier
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    const r = await pool.query("SELECT 1 AS ok");
    console.log(r.rows); // should print [ { ok: 1 } ]
  } catch (err) {
    console.error("DB error:", err);
  } finally {
    await pool.end();
  }
})();
