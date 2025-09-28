// scripts/seed-gpx.js
//
// Seeds a route and its associated GPX track into the Neon Postgres DB
// using the 714-pre-lunch.gpx file stored in this folder.

require('dotenv').config({ path: '../.env' }); // load root .env
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const xml2js = require('xml2js');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    console.log('🌱 Seeding route + GPX into database...');

    // 1️⃣ Read GPX file
    const gpxPath = path.join(__dirname, '714-pre-lunch.gpx');
    const gpxXml = fs.readFileSync(gpxPath, 'utf8');

    // 2️⃣ Parse GPX XML to extract coordinates for PostGIS
    const parsed = await xml2js.parseStringPromise(gpxXml);
    const trkpts = parsed?.gpx?.trk?.[0]?.trkseg?.[0]?.trkpt;
    if (!trkpts || trkpts.length === 0) {
      throw new Error('No track points found in GPX file');
    }

    const coords = trkpts.map(pt => {
      const lat = parseFloat(pt.$.lat);
      const lon = parseFloat(pt.$.lon);
      return `${lon} ${lat}`; // PostGIS expects lon lat order
    });
    const linestringWKT = `LINESTRING(${coords.join(', ')})`;

    // 3️⃣ Insert a route (or reuse existing one)
    const routeName = '714 Pre-Lunch Trail';
    const routeSlug = '714-pre-lunch';
    const routeRegion = 'WI';

    const routeRes = await pool.query(
      `INSERT INTO routes (slug, name, region)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [routeSlug, routeName, routeRegion]
    );
    const routeId = routeRes.rows[0].id;
    console.log(`✅ Route upserted with id=${routeId}`);

    // 4️⃣ Insert GPX file + geometry
    await pool.query(
      `INSERT INTO gpx (route_id, name, geometry, file)
       VALUES ($1, $2, ST_GeomFromText($3, 4326), $4)
       ON CONFLICT DO NOTHING`,
      [routeId, '714-pre-lunch.gpx', linestringWKT, gpxXml]
    );

    console.log('✅ GPX file inserted successfully!');
  } catch (err) {
    console.error('❌ Seed failed:', err);
  } finally {
    await pool.end();
  }
}

main();
