const express = require("express"); // Web Framework for Node -- Used for routing, middleware, JSON Parsing
const multer = require("multer"); // Middleware to handle file uploads in Express 
const crypto = require("crypto"); // Node's built-in crypto utilities 
const bbox = require("@turf/bbox").default; // Computes cordinates for GeoJSON 
const { featureCollection, lineString } = require("@turf/helpers"); // Helpers to build GeoJSON Objects 
const gpxParse = require("gpx-parse"); // Parses .gpx XML into JS objects 
const { Pool } = require("pg"); // Manages Postgres connections 

const router = express.Router(); // A mini Express app just for 'routes' endpoints


const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // Used for file uploading 
const pool = new Pool({ connectionString: process.env.POSTGRES_URL }); // PostgreSQL connection manager, connects us to the online database


/**
 * Compute the great-circle distance between two geographic points
 * using the Haversine formula.
 * Takes two points: [lon1, lat1] and [lon2, lat2].
 * Converts them from degrees → radians (because trig functions use radians).
 * Uses the haversine formula to compute the arc distance across the Earth’s surface.
 * Returns the straight-line “as the crow flies” distance in meters.
 */
function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000; // earth radius m
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// GET /api/routes/list?offset=0&limit=20&q=smith
router.get("/routes/list", async (req, res) => {
  const { offset = 0, limit = 20, q = "" } = req.query;
  const lim = Math.min(parseInt(limit,10)||20, 100);  // Takes the limit query parameter and turns it into a number, use 20 as default, never go above 100
  const off = parseInt(offset,10)||0; // Takes clients offset query parameter, turns it into a number, default is 0 

  // If a search query `q` exists, add a WHERE clause that matches trail names (case-insensitive).
  // Otherwise, leave it blank so all routes are selected.
  const where = q
    ? `WHERE name ILIKE $1`
    : ``;

  // Build the array of parameters to safely pass into the SQL query.
  // If searching, params = [search string with wildcards, limit, offset].
  // If not searching, params = [limit, offset].
  const params = q ? [`%${q}%`, lim, off] : [lim, off];

  // Construct the SQL query as a string.
  // - Select specific columns from the `routes` table.
  // - Insert the `WHERE` clause if needed.
  // - Always order results by `updated_at` (newest first).
  // - Apply LIMIT and OFFSET for pagination.
  //   placeholder numbers ($1, $2, $3) depend on whether `q` is present.
  //   - If q exists: $1 = search term, $2 = limit, $3 = offset
  //   - If q doesn’t exist: $1 = limit, $2 = offset
  const sql = `
    SELECT id, slug, name, distance_m, points_n, updated_at
    FROM routes
    ${where}
    ORDER BY updated_at DESC
    LIMIT $${q ? 2 : 1} OFFSET $${q ? 3 : 2}
  `;

  // Run the SQL query against Postgres using the pool connection.
  // Pass in the query string and the parameter array (params).
  // The result contains a `.rows` property which is an array of JS objects (one per row).
  const { rows } = await pool.query(sql, params);

  // Send a JSON response back to the client.
  // - `items`: the rows fetched from Postgres
  // - `nextOffset`: helps the frontend know where to start for the next page
  //   (current offset + number of rows actually returned).
  res.json({ items: rows, nextOffset: off + rows.length });

});





// Define a GET endpoint at /api/routes/:id/meta
// Example: GET /api/routes/42/meta
router.get("/routes/:id/meta", async (req, res) => {
  // Extract the "id" parameter from the URL path (":id").
  // If the request was /api/routes/42/meta, then id = "42".
  const { id } = req.params;

  // Run a SQL query to fetch metadata for the given route ID.
  // - $1 is a parameter placeholder (safe from SQL injection).
  // - [id] is the parameter array, so Postgres substitutes id for $1.
  const q = await pool.query(
    `SELECT id, slug, name, distance_m, points_n, updated_at
     FROM routes WHERE id=$1`,
    [id]
  );

  // If no rows were found (rowCount = 0), the route ID doesn’t exist.
  // Respond with HTTP 404 (Not Found).
  if (!q.rowCount) return res.sendStatus(404);

  // Otherwise, send back the first row (q.rows[0]) as JSON.
  // Example response:
  // {
  //   "id": 42,
  //   "slug": "pine-loop",
  //   "name": "Pine Loop Trail",
  //   "distance_m": 3200,
  //   "points_n": 58,
  //   "updated_at": "2025-09-21T18:42:00Z"
  // }
  res.json(q.rows[0]);
});





// LIST endpoint: GET /api/routes/list
// Returns a paginated list of routes from the database.
router.get("/routes/list", async (req, res) => {
  // Pull `offset` and `limit` from the query string (?offset=20&limit=10).
  // If not provided, defaults are 0 (start at beginning) and 20 (20 items).
  const { offset = 0, limit = 20 } = req.query;

  // Sanitize the limit:
  // - parseInt() converts limit to a number
  // - if invalid, fall back to 20
  // - cap at 100 so clients can’t request unlimited rows
  const lim = Math.min(parseInt(limit, 10) || 20, 100);

  // Sanitize the offset:
  // - parseInt() converts offset to a number
  // - if invalid, fall back to 0 (start at the first row)
  const off = parseInt(offset, 10) || 0;

  // SQL query:
  // - Selects route metadata from the `routes` table
  // - Orders by `updated_at` (newest first)
  // - Applies LIMIT (max rows) and OFFSET (skip rows for pagination)
  const sql = `
    SELECT id, slug, name, distance_m, points_n, updated_at
    FROM routes
    ORDER BY updated_at DESC
    LIMIT $1 OFFSET $2
  `;

  // Execute the query with safe parameter substitution.
  // $1 = lim, $2 = off
  const { rows } = await pool.query(sql, [lim, off]);

  // Respond with JSON:
  // - items: the array of rows fetched
  // - nextOffset: helps client know where to start the next page
  res.json({ items: rows, nextOffset: off + rows.length });
});





// META endpoint: GET /api/routes/:id/meta
// Returns metadata for a single route by its ID.
router.get("/routes/:id/meta", async (req, res) => {
  // Extract the route ID from the URL path parameter.
  // Example: GET /api/routes/42/meta → id = "42"
  const { id } = req.params;

  // Query the Postgres database for the route with that ID.
  // $1 is a parameter placeholder → safe against SQL injection.
  // [id] supplies the actual value for $1.
  const q = await pool.query(
    `SELECT id, slug, name, distance_m, points_n, updated_at
     FROM routes WHERE id=$1`,
    [id]
  );

  // If no rows were returned, that route ID does not exist.
  // Send back HTTP 404 (Not Found).
  if (!q.rowCount) return res.sendStatus(404);

  // Otherwise, return the single row as JSON.
  // q.rows[0] is the first (and only) row found.
  res.json(q.rows[0]);
});








// GET /api/routes/:id.geojson → returns a single route as GeoJSON
// Example: GET /api/routes/42.geojson
router.get("/routes/:id.geojson", async (req, res) => {
  try {
    // Extract the route ID from the URL path.
    // Example: /api/routes/42.geojson → id = "42"
    const { id } = req.params;

    // Query Postgres for the geometry of that route.
    // - `geom` is assumed to be a PostGIS geometry column in your `routes` table.
    // - `ST_AsGeoJSON(geom::geometry)` converts the geometry into a GeoJSON string.
    // - The `::json` cast makes Postgres hand it back as JSON instead of text.
    const q = await pool.query(
      `SELECT id, name, ST_AsGeoJSON(geom::geometry)::json AS geometry
       FROM routes WHERE id = $1`,
      [id]
    );

    // If no rows found, the route ID doesn’t exist → return HTTP 404.
    if (!q.rowCount) return res.sendStatus(404);

    // Grab the first (and only) result row.
    const r = q.rows[0];

    // Respond with a valid GeoJSON Feature object.
    // Leaflet (and most map libraries) expect this format:
    // {
    //   "type": "Feature",
    //   "properties": { "id": ..., "name": ... },
    //   "geometry": { ...GeoJSON geometry from PostGIS... }
    // }
    res.json({
      type: "Feature",
      properties: { id: r.id, name: r.name },
      geometry: r.geometry
    });
  } catch (e) {
    // If something goes wrong (DB error, bad geom, etc.), log it
    // and respond with a generic 500 (internal server error).
    console.error("geojson failed:", e);
    res.status(500).json({ error: "geojson-failed" });
  }
});







// GET /api/routes/:id.geojson → returns a single route as GeoJSON
// Example: GET /api/routes/42.geojson
router.get("/routes/:id.geojson", async (req, res) => {
  try {
    // Extract the route ID from the URL path.
    // Example: /api/routes/42.geojson → id = "42"
    const { id } = req.params;

    // Query Postgres for the geometry of that route.
    // - `geom` is assumed to be a PostGIS geometry column in your `routes` table.
    // - `ST_AsGeoJSON(geom::geometry)` converts the geometry into a GeoJSON string.
    // - The `::json` cast makes Postgres hand it back as JSON instead of text.
    const q = await pool.query(
      `SELECT id, name, ST_AsGeoJSON(geom::geometry)::json AS geometry
       FROM routes WHERE id = $1`,
      [id]
    );

    // If no rows found, the route ID doesn’t exist → return HTTP 404.
    if (!q.rowCount) return res.sendStatus(404);

    // Grab the first (and only) result row.
    const r = q.rows[0];

    // Respond with a valid GeoJSON Feature object.
    // Leaflet (and most map libraries) expect this format:
    // {
    //   "type": "Feature",
    //   "properties": { "id": ..., "name": ... },
    //   "geometry": { ...GeoJSON geometry from PostGIS... }
    // }
    res.json({
      type: "Feature",
      properties: { id: r.id, name: r.name },
      geometry: r.geometry
    });
  } catch (e) {
    // If something goes wrong (DB error, bad geom, etc.), log it
    // and respond with a generic 500 (internal server error).
    console.error("geojson failed:", e);
    res.status(500).json({ error: "geojson-failed" });
  }
});






// GET /api/routes?minX&minY&maxX&maxY[&limit] → browse routes by bounding box
// Example: /api/routes?minX=-90&minY=42&maxX=-89&maxY=43&limit=50
router.get("/routes", async (req, res) => {
  try {
    // Pull bounding box and limit values from the query string.
    // - minX = left (west) longitude
    // - minY = bottom (south) latitude
    // - maxX = right (east) longitude
    // - maxY = top (north) latitude
    // - limit = optional number of results (default 200)
    const { minX, minY, maxX, maxY, limit = 200 } = req.query;

    // If any of the four bounding box values are missing,
    // immediately return a 400 Bad Request with an error message.
    if ([minX, minY, maxX, maxY].some(v => v === undefined)) {
      return res.status(400).json({ error: "bbox required: minX,minY,maxX,maxY" });
    }

    // Build a WKT (Well-Known Text) polygon string that represents the bbox.
    // Format: POLYGON((x1 y1, x2 y2, x3 y3, x4 y4, x1 y1))
    // This forms a rectangle from the min/max coords.
    const boundsWkt =
      `POLYGON((${minX} ${minY}, ${maxX} ${minY}, ${maxX} ${maxY}, ${minX} ${maxY}, ${minX} ${minY}))`;

    // Query Postgres for all routes whose geometry intersects this polygon.
    // - ST_Intersects: true if the route’s geom overlaps the bbox
    // - ST_GeogFromText($1): convert the WKT polygon into a geography object
    // - LIMIT LEAST($2::int, 1000): use the requested limit, but cap at 1000 max
    const q = await pool.query(
      `SELECT id, name, ST_AsGeoJSON(geom::geometry)::json AS geometry
       FROM routes
       WHERE ST_Intersects(geom, ST_GeogFromText($1))
       LIMIT LEAST($2::int, 1000)`,
      [boundsWkt, limit]
    );

    // Respond with a GeoJSON FeatureCollection,
    // where each row from Postgres becomes a Feature.
    res.json({
      type: "FeatureCollection",
      features: q.rows.map(r => ({
        type: "Feature",
        properties: { id: r.id, name: r.name },
        geometry: r.geometry
      }))
    });
  } catch (e) {
    // If anything fails (SQL error, invalid input, etc.),
    // log the error and send a 500 Internal Server Error response.
    console.error("bbox browse failed:", e);
    res.status(500).json({ error: "bbox-failed" });
  }
});






// POST /api/routes/upload  (multipart form field: file)
// - Accepts a GPX file upload (field name: "file").
// - Parses the GPX into track coordinates.
// - Computes distance + bbox, converts geometry to WKT.
// - De-duplicates by SHA-256 checksum.
// - Stores source GPX + derived geometry into Postgres (PostGIS).
router.post("/routes/upload", upload.single("file"), async (req, res) => {
  try {
    // Ensure a file was uploaded under the "file" field.
    if (!req.file) return res.status(400).json({ error: "no-file" });

    // Read the uploaded GPX file (from Multer's memory storage) as UTF-8 text (XML).
    const xml = req.file.buffer.toString("utf8");

    // Compute a checksum of the raw XML to detect duplicates (same content).
    const checksum = crypto.createHash("sha256").update(xml).digest("hex");

    // QUICK DEDUPE: if a route with the same checksum already exists, short-circuit.
    {
      const dup = await pool.query("SELECT id FROM routes WHERE checksum=$1", [checksum]);
      if (dup.rowCount) {
        return res.json({ ok: true, id: dup.rows[0].id, dedup: true });
      }
    }

    // Parse the GPX XML into a JS object (tracks → segments → points).
    // gpxParse uses a callback API; wrap in a Promise for async/await.
    const gpx = await new Promise((resolve, reject) =>
      gpxParse.parseGpx(xml, (err, data) => (err ? reject(err) : resolve(data)))
    );

    // Collect each segment as an array of [lon, lat] pairs for geometry building.
    const multi = [];             // Array<Array<[lon, lat]>>
    let totalPoints = 0;          // Count of coordinate points across all segments
    let totalMeters = 0;          // Total length across all segments (meters)

    // Traverse all tracks/segments in the parsed GPX.
    for (const trk of gpx.tracks || []) {
      for (const seg of trk.segments || []) {
        // Map GPX points → [lon, lat]; drop any non-finite coords.
        const coords = seg
          .map((p) => [p.lon, p.lat])
          .filter((xy) => Number.isFinite(xy[0]) && Number.isFinite(xy[1]));

        // Only keep segments with at least 2 points.
        if (coords.length >= 2) {
          multi.push(coords);
          totalPoints += coords.length;

          // Accumulate distance along this segment using Haversine between successive points.
          for (let i = 1; i < coords.length; i++) {
            totalMeters += haversineMeters(coords[i - 1], coords[i]);
          }
        }
      }
    }

    // If no valid segments were found, reject the upload.
    if (!multi.length) {
      return res.status(400).json({ error: "no-track-segments" });
    }

    // Build a GeoJSON FeatureCollection from all segments to compute a bbox.
    const fc = featureCollection(multi.map((seg) => lineString(seg)));
    const [minX, minY, maxX, maxY] = bbox(fc); // [west, south, east, north]

    // Build a MULTILINESTRING WKT from all segments.
    // Example: MULTILINESTRING((x1 y1,x2 y2,...),(x1 y1,x2 y2,...),...)
    const mlsWkt =
      "MULTILINESTRING(" +
      multi
        .map((seg) => "(" + seg.map(([x, y]) => `${x} ${y}`).join(",") + ")")
        .join(",") +
      ")";

    // Build a rectangular bounds polygon WKT from the bbox.
    // POLYGON((minX minY, maxX minY, maxX maxY, minX maxY, minX minY))
    const boundsWkt = `POLYGON((${minX} ${minY}, ${maxX} ${minY}, ${maxX} ${maxY}, ${minX} ${maxY}, ${minX} ${minY}))`;

    // Pick a human-friendly name: GPX metadata name → first track name → fallback.
    const name =
      gpx?.metadata?.name ||
      (gpx?.tracks?.[0]?.name ? String(gpx.tracks[0].name) : "Uploaded Route");

    // Generate a stable slug based on the checksum prefix.
    const slug = "route-" + checksum.slice(0, 8);

    // Insert the route into Postgres:
    // - slug, name, source
    // - original GPX XML + checksum (for dedupe + provenance)
    // - derived stats: distance (meters), point count
    // - bounds (WKT polygon) as geography
    // - geometry (MULTILINESTRING WKT) as geography
    const { rows } = await pool.query(
      `
      INSERT INTO routes (slug, name, source, gpx_xml, checksum, distance_m, points_n, bounds, geom)
      VALUES ($1,$2,$3,$4,$5,$6,$7, ST_GeogFromText($8), ST_GeogFromText($9))
      RETURNING id
      `,
      [
        slug,
        name,
        "upload",
        xml,
        checksum,
        Math.round(totalMeters),
        totalPoints,
        boundsWkt,
        mlsWkt,
      ]
    );

    // Respond with success + basic metadata the client can use immediately.
    res.json({
      ok: true,
      id: rows[0].id,
      slug,
      name,
      distance_m: Math.round(totalMeters),
      points_n: totalPoints,
    });
  } catch (err) {
    // Any unexpected error (parse/DB/etc.) → log and return a generic 500.
    console.error("upload failed:", err);
    res.status(500).json({ error: "upload-failed" });
  }
});

// Make this router usable by the main app (app.use("/api", router)).
module.exports = router;

