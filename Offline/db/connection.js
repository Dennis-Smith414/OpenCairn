// offline/db/connection.js
const sqlite3 = require("sqlite3").verbose();
const { DB_PATH } = require("./init");

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("[offline-db] Failed to open database connection:", err.message);
  } else {
    console.log("[offline-db] SQLite connection opened at", DB_PATH);
  }
});

// optional: avoid "database is locked" issues under light contention
db.configure("busyTimeout", 5000);

module.exports = db;
