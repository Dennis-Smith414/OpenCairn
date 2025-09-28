// scripts/rebuild-db.js
require('dotenv').config();
const { Pool } = require('pg');
const { init } = require('../Server/Postgres');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function dropAll() {
  console.log('🚨 Dropping all tables...');
  // Drop in correct dependency order
  await pool.query(`
    DROP TABLE IF EXISTS
      comment_rating,
      route_rating,
      cairn_rating,
      comments,
      waypoints,
      gpx,
      routes,
      users
    CASCADE;
  `);
  console.log('✅ Drop complete.');
}

(async () => {
  try {
    await dropAll();
    console.log('🧱 Rebuilding schema...');
    await init();
    console.log('🎉 Rebuild finished successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Rebuild failed:', err);
    process.exit(1);
  }
})();
