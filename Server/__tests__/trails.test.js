const request = require('supertest');
const { app } = require('../index');   
const { init, run } = require('../Postgres');

beforeAll(async () => {
  process.env.POSTGRES_URL = process.env.POSTGRES_URL || 'postgres://app:pass@localhost:5432/trails';
  await init();
  await run('DELETE FROM trails', []);
});

test('rejects missing fields', async () => {
  const res = await request(app).post('/api/trails').send({ slug: 'abc' });
  expect(res.status).toBe(400);
});

test('creates and lists a trail', async () => {
  const create = await request(app)
    .post('/api/trails')
    .send({ slug: 'pine-loop', name: 'Pine Loop Trail', region: 'WI' });
  expect(create.status).toBe(200);

  const list = await request(app).get('/api/trails');
  expect(list.status).toBe(200);
  expect(Array.isArray(list.body)).toBe(true);
  expect(list.body.find(t => t.slug === 'pine-loop')).toBeTruthy();
});
