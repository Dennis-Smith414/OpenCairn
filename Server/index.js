/**
 * @file index.js
 * App bootstrap: loads env, middleware, mounts routers, starts server.
 */
require("dotenv").config({ override: true }); // Loads in the environment variables from .env into process.env

// Debugging Log
console.log("ENV POSTGRES_URL loaded?", !!process.env.POSTGRES_URL);
if (process.env.POSTGRES_URL) {
  console.log(process.env.POSTGRES_URL.slice(0, 60) + "...");
}

const express = require("express"); // Express web framework for defining routes 
const cors = require("cors"); // Allows the React frontend can call the API from a different domain 
const { init } = require("./Postgres"); // initalizes a helper that connects to Postgres and set up tables

// Import the API's
const healthRouter = require("./api/health");
const trailsRouter = require("./api/trails");
const dbinfoRouter  = require("./api/dbinfo");
const authRouter = require("./api/auth");
const gpxRoutes = require("./routes/gpx");

const app = express(); // Starts the app, central object that routes and middleware are attached to 
app.use(cors()); // Allows cross origin requests 
app.use(express.json()); // adds JSON parsing 

// Mount versioned API
app.use("/api/health", healthRouter);
app.use("/api/trails", trailsRouter);
app.use("/api/dbinfo", dbinfoRouter);
app.use("/api/auth", authRouter);
app.use("/api", gpxRoutes);
console.log("Mounted GPX routes at /api");
app.get("/api/routes/ping2", (_req, res) => res.json({ ok: true, where: "index" }));


// ------------ start / stop -------------
const PORT = process.env.PORT || 5000; // Server port, either .env variable or default 5000
let server; // Declaring Server early makes it accessible to other parts of the file if needed 



async function start() {
  try {
    await init(); // Waits for Database to start 
    console.log("Postgres ready"); // Prints when Database is up 
    server = app.listen(PORT, () => // Start the express server 
      console.log(`Backend listening on http://localhost:${PORT}`) 
    );
    const shutdown = (sig) => { // Declares a function, takes sig ("SIGINT") 
      console.log(`\n${sig} received; shutting down...`);
      if (server) server.close(() => process.exit(0)); // server.close() stops the HTTP server from accepting new connections,
      else process.exit(0); 
    };
    // These lines “catch” shutdown signals (Ctrl+C, Docker stop, etc.) and hand them off to your graceful shutdown function
    // That way,  backend always turns off cleanly instead of just being killed mid-request
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    console.error("Postgres init failed:", err);
    process.exit(1);
  }
}


if (require.main === module) start();

module.exports = { app, start };
