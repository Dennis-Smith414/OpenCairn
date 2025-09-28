// Server/Api/routes.js
const { all, get } = require('../Postgres');

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Handle /api/routes/* endpoints for the embedded http server.
 * Returns true if the request was handled (so caller can `return` early).
 */
module.exports = async function handleTrails(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname, searchParams } = url;

  // GET /api/routes/list?limit=100
  if (req.method === 'GET' && pathname === '/api/routes/list') {
    const limit = Number(searchParams.get('limit') ?? 50);
    try {
      const rows = await all(
        `SELECT id, slug, name, region, updated_at
         FROM routes
         ORDER BY updated_at DESC
         LIMIT $1`,
        [limit]
      );
      json(res, 200, { items: rows });
    } catch (e) {
      console.error('routes/list error:', e);
      json(res, 500, { error: 'Failed to fetch route list' });
    }
    return true;
  }

  // GET /api/routes/:id.geojson
  const geo = pathname.match(/^\/api\/routes\/(\d+)\.geojson$/);
  if (req.method === 'GET' && geo) {
    const id = Number(geo[1]);
    try {
      const row = await get(
        `SELECT ST_AsGeoJSON(geometry) AS geojson
         FROM gpx
         WHERE route_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [id]
      );
      if (!row) {
        json(res, 404, { error: 'Route geometry not found' });
        return true;
      }
      const featureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { route_id: id },
            geometry: JSON.parse(row.geojson),
          },
        ],
      };
      json(res, 200, featureCollection);
    } catch (e) {
      console.error(`geojson error route ${id}:`, e);
      json(res, 500, { error: 'Failed to fetch geojson' });
    }
    return true;
  }

  // GET /api/routes/:id.gpx
  const gpx = pathname.match(/^\/api\/routes\/(\d+)\.gpx$/);
  if (req.method === 'GET' && gpx) {
    const id = Number(gpx[1]);
    try {
      const row = await get(
        `SELECT file FROM gpx
         WHERE route_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [id]
      );
      if (!row || !row.file) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('GPX not found');
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/gpx+xml' });
      res.end(row.file.toString());
    } catch (e) {
      console.error(`gpx error route ${id}:`, e);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Failed to fetch GPX');
    }
    return true;
  }

  return false; // not handled
};
