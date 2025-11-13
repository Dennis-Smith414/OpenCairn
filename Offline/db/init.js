// offline/db/init.js
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "..", "offline.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");
const SEED_PATH = path.join(__dirname, "seed.sql");

/**
 * Initialize the offline SQLite database.
 * - creates offline.db if missing
 * - runs schema.sql (idempotent)
 * - optionally runs seed.sql (dev/debug)
 *
 * @param {Object} options
 * @param {boolean} options.withSeed - whether to run seed.sql
 * @returns {Promise<void>}
 */
function init({ withSeed = false } = {}) { //set to FALSE after testing
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error("[offline-db] Failed to open database:", err.message);
        return reject(err);
      }
    });

    db.serialize(() => {
      // Always enforce foreign keys
      db.run("PRAGMA foreign_keys = ON;");

      // Load and apply schema
      const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf8");

      db.exec(schemaSql, (schemaErr) => {
        if (schemaErr) {
          console.error("[offline-db] Error applying schema.sql:", schemaErr.message);
          db.close(() => reject(schemaErr));
          return;
        }

        // Optionally run seed.sql (for development/testing)
        if (!withSeed || !fs.existsSync(SEED_PATH)) {
          db.close((closeErr) => {
            if (closeErr) {
              console.error("[offline-db] Error closing DB after init:", closeErr.message);
              return reject(closeErr);
            }
            console.log("[offline-db] Init complete (schema only)");
            resolve();
          });
          return;
        }

        const seedSql = fs.readFileSync(SEED_PATH, "utf8").trim();

        if (!seedSql) {
          db.close((closeErr) => {
            if (closeErr) {
              console.error("[offline-db] Error closing DB after init:", closeErr.message);
              return reject(closeErr);
            }
            console.log("[offline-db] Init complete (schema only, empty seed.sql)");
            resolve();
          });
          return;
        }

        db.exec(seedSql, (seedErr) => {
          if (seedErr) {
            console.error("[offline-db] Error applying seed.sql:", seedErr.message);
            db.close(() => reject(seedErr));
            return;
          }

          db.close((closeErr) => {
            if (closeErr) {
              console.error("[offline-db] Error closing DB after init+seed:", closeErr.message);
              return reject(closeErr);
            }
            console.log("[offline-db] Init complete (schema + seed)");
            resolve();
          });
        });
      });
    });
  });
}

module.exports = {
  DB_PATH,
  init,
};
