// offline/db/queries.js
const db = require("./connection");

/**
 * Run a write statement (INSERT/UPDATE/DELETE).
 * Resolves with { changes, lastID }.
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        console.error("[offline-db] run error:", err.message, "\nSQL:", sql, "\nParams:", params);
        return reject(err);
      }
      resolve({
        changes: this.changes,
        lastID: this.lastID,
      });
    });
  });
}

/**
 * Read many rows.
 * Resolves with an array of rows.
 */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error("[offline-db] all error:", err.message, "\nSQL:", sql, "\nParams:", params);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

/**
 * Read one row (or null).
 */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error("[offline-db] get error:", err.message, "\nSQL:", sql, "\nParams:", params);
        return reject(err);
      }
      resolve(row || null);
    });
  });
}

module.exports = {
  run,
  all,
  get,
};
