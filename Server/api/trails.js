// routes/trails.js
const express = require("express");
const router = express.Router();

// Replace these with real DB reads:
const mock = [
  { id: 1, name: "Demo Trail", distance_m: 5234, points_n: 137 },
];

router.get("/list", (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  res.json({ items: mock.slice(0, limit) });
});

// GeoJSON for Leaflet (TrailView.tsx consumes this)
router.get("/:id.geojson", (req, res) => {
  const id = Number(req.params.id);
  // Minimal valid LineString demo; swap for DB result
  const geo = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id },
        geometry: {
          type: "LineString",
          coordinates: [
            [-121.50, 44.11],
            [-121.48, 44.13],
            [-121.46, 44.12],
          ],
        },
      },
    ],
  };
  res.json(geo);
});

// GPX download link shown in TrailsList.tsx
router.get("/:id.gpx", (req, res) => {
  const id = Number(req.params.id);
  res.setHeader("Content-Type", "application/gpx+xml");
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OpenCairn">
  <trk><name>Trail ${id}</name><trkseg>
    <trkpt lat="44.110" lon="-121.500"></trkpt>
    <trkpt lat="44.130" lon="-121.480"></trkpt>
    <trkpt lat="44.120" lon="-121.460"></trkpt>
  </trkseg></trk>
</gpx>`;
  res.send(gpx);
});

module.exports = router;
