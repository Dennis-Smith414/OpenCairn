// offline/index.js
const express = require("express");
const { init, DB_PATH } = require("./db/init");

const PORT = process.env.OFFLINE_PORT || 5101;

async function start() {
  try {
    // 1) Initialize the SQLite DB (creates file + schema if needed)
    await init({ withSeed: true }); //set to FALSE after testing

    // 2) Start a minimal HTTP server
    const app = express();
    app.use(express.json());

    // Simple health check endpoint for the React Native app
    app.get("/ping", (req, res) => {
      res.json({
        ok: true,
        service: "offline-db",
        dbPath: DB_PATH,
      });
    });

    app.listen(PORT, () => {
      console.log(`[offline] listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("[offline] Failed to start offline server:", err);
    process.exit(1);
  }
}

start();
