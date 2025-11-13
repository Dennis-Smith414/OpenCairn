const express = require("express");
const { init, DB_PATH } = require("./db/init");
const commentsRoutes = require("./routes/comments");

const PORT = process.env.OFFLINE_PORT || 5101;

async function start() {
  await init({ withSeed: true }); // or false

  const app = express();
  app.use(express.json());

  app.get("/ping", (_req, res) => {
    res.json({ ok: true, service: "offline-db", dbPath: DB_PATH });
  });

  app.use("/comments", commentsRoutes);

  app.listen(PORT, () => {
    console.log(`[offline] listening on port ${PORT}`);
  });
}

start();
