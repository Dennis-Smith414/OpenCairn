// scripts/db-smoke.js
require('dotenv').config();
const { init, all, run, get } = require('../Server/Postgres');

(async () => {
  try {
    await init();
    const now = await get('SELECT now() AS ts');
    console.log('DB OK, now =', now.ts);

    // Optional: insert/read something tiny to prove write access.
    const u = await run(
      `INSERT INTO users(username, password) VALUES($1, $2) RETURNING id`,
      ['smoke_tester', 'hash']
    );
    console.log('Inserted user id:', u.rows[0].id);

    const users = await all(`SELECT id, username, create_time FROM users ORDER BY id DESC LIMIT 3`);
    console.log('Recent users:', users);
  } catch (e) {
    console.error('SMOKE TEST FAILED:', e);
    process.exit(1);
  }
})();
