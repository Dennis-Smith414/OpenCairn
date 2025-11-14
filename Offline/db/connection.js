// offline/db/connection.js
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { DB_PATH } = require("./init");


const db = new sqlite3.Database(
  DB_PATH,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error("[offline-db] Failed to open DB (connection):", err.message);
    } else {
      console.log("[offline-db] Connection open at", DB_PATH);
    }
  }
);

module.exports = db;
