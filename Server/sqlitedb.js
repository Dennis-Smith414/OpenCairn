const path = require("path"); // Loads Node's built-in path module

// Loads the SQLite library 
// .verbose() just makes SQLite print more detailed error messages, useful for debugging
const sqlite3 = require("sqlite3").verbose(); 

// Sets the filename of the database we use
// "hike.db" is the SQLite file that will store all the tables and data 
const DB_FILE = path.join(__dirname, "hike.db");

// Opens the database file "hike.db"
// 'db' becomes the connection option to run queries 
const db = new sqlite3.Database(DB_FILE);


/**
 * Execute an INSERT/UPDATE/DELETE SQL statement against the SQLite database.
 *
 * This is a helper that wraps `db.run` inside a Promise,
 * so we can use modern `async/await` syntax instead of nesting callbacks.
 *
 * @param {string} sql - the instruction you want SQLite to run.
 * Example: INSERT INTO trails (name, route, length) VALUES (?, ?, ?) 
 * 
 * @param {Array} [params=[]] - this is the array of values that get plugged into the ? placeholders in the SQL string.
 * Example: ["Evergreen Loop", "lat/lon coords", 4.2]
 * 
 * @returns {Promise<object>} - Resolves with the SQLite statement context (`this`),
 *                              which contains useful properties:
 *   - `lastID`: the ID of the last inserted row (if the query was an INSERT)
 *   - `changes`: the number of rows changed (for UPDATE/DELETE)
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this); // 'this' holds metadata about what just happened (the new row’s ID, or how many rows changed).
    });
  });
}


/**
 * Execute a SELECT SQL statement that returns multiple rows from the SQLite database.
 *
 * This is a helper that wraps `db.all` inside a Promise,
 * so we can use modern `async/await` syntax instead of nesting callbacks.
 *
 * @param {string} sql - the SELECT query you want SQLite to run.
 * Example: SELECT * FROM trails WHERE region = ?
 * 
 * @param {Array} [params=[]] - the array of values that get plugged into the ? placeholders in the SQL string.
 * Example: ["CO"]
 * 
 * @returns {Promise<Array<object>>} - Resolves with an array of row objects.
 * Each row is a plain JavaScript object with keys matching the column names.
 */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows); // rows is an array of objects (one per row returned)
    });
  });
}


/**
 * Execute a SELECT SQL statement that returns a single row from the SQLite database.
 *
 * This is a helper that wraps `db.get` inside a Promise,
 * so we can use modern `async/await` syntax instead of nesting callbacks.
 *
 * @param {string} sql - the SELECT query you want SQLite to run.
 * Example: SELECT * FROM trails WHERE id = ?
 * 
 * @param {Array} [params=[]] - the array of values that get plugged into the ? placeholders in the SQL string.
 * Example: [1]
 * 
 * @returns {Promise<object|null>} - Resolves with a single row object if a match is found,
 *                                   or `null` if no row matches the query.
 */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row); // row is a single object or null if no row matched
    });
  });
}



async function init() {
  await run("PRAGMA foreign_keys = ON;"); // Turns on foreign keys for relations 
  await run("PRAGMA journal_mode = WAL;"); // Turns on Write-Ahead logging, which improves performance for concurrent reads/writes
  await run("PRAGMA synchronous = NORMAL;"); // Tweaks durability vs speed, NORMAL is the middle ground


  // Creates table if it does not exisit 
  // id: Route ID
  // slug: URL formatted route name ---> "Evergreen Trail" would be "Evergreen-Trail" Example: Hikingapp.com/Evergreen-Trail 
  // name: Actual Route Name --> "Evergreen Trail"
  // region: region for route
  await run(`
    CREATE TABLE IF NOT EXISTS trails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,  
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      region TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

}

module.exports = { db, init, run, all, get }; // Makes db, init, run, all, and get available to any other file that imports this one
