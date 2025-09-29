const request = require('supertest');
const { app } = require('../index');
const { init, run } = require('../Postgres');

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://app:pass@localhost:5432/trails';
  await init();
});

beforeEach(async () => {
  // clean table so tests are deterministic
  await run('DELETE FROM trails', []);
});

// --- helpers to reduce repetition
async function postTrail(body) {
  return request(app).post('/api/trails').send(body);
}

// Missing fields
test('POST /api/trails → 400 when slug is missing', async () => {
  const res = await postTrail({ name: 'Some Trail', region: 'WI' });
  expect(res.status).toBe(400);
});

test('POST /api/trails → 400 when name is missing', async () => {
  const res = await postTrail({ slug: 'some-trail', region: 'WI' });
  expect(res.status).toBe(400);
});

// Empty strings
test('POST /api/trails → 400 when slug is empty string', async () => {
  const res = await postTrail({ slug: '', name: 'Trail', region: 'WI' });
  expect(res.status).toBe(400);
});

test('POST /api/trails → 400 when name is empty string', async () => {
  const res = await postTrail({ slug: 'trail', name: '', region: 'WI' });
  expect(res.status).toBe(400);
});

// Whitespace-only
test('POST /api/trails → 400 when slug is whitespace-only', async () => {
  const res = await postTrail({ slug: '   ', name: 'Trail', region: 'WI' });
  expect(res.status).toBe(400);
});

test('POST /api/trails → 400 when name is whitespace-only', async () => {
  const res = await postTrail({ slug: 'trail', name: '   ', region: 'WI' });
  expect(res.status).toBe(400);
});

// Wrong types
test('POST /api/trails → 400 when slug is not a string', async () => {
  const res = await postTrail({ slug: 123, name: 'Trail', region: 'WI' });
  expect(res.status).toBe(400);
});

test('POST /api/trails → 400 when name is not a string', async () => {
  const res = await postTrail({ slug: 'trail', name: null, region: 'WI' });
  expect(res.status).toBe(400);
});
