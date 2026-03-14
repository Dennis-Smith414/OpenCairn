const { login, BASE_URL } = require('./setup');
const fs = require('fs');
const { execSync } = require('child_process');

let token;
let routeId;

beforeAll(async () => {
	token = await login();
});

afterAll(async () => {
	if (routeId) {
		await fetch(`${BASE_URL}/api/routes/${routeId}`, {
			method: 'DELETE',
			headers: { 'Authorization': `Bearer ${token}` },
		});
	}
});

test('login succeeds and returns a token', () => {
	expect(token).toBeDefined();
});

test('upload a GPX file and create a route', async () => {
	//create route
	const createRes = await fetch(`${BASE_URL}/api/routes`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({ name: 'Test Route', region: 'Wisconsin' }),
	});
	const createData = await createRes.json();
	expect(createRes.status).toBe(201);
	routeId = createData.route.id;

	//upload GPX using curl json was mad broken
	const result = execSync(
		`curl -s -X POST ${BASE_URL}/api/routes/${routeId}/gpx \
    -H "Authorization: Bearer ${token}" \
    -F "file=@${__dirname}/Downer_Woods.gpx"`
	);
	const data = JSON.parse(result.toString());

	expect(data.ok).toBe(true);
	expect(data.segments).toBeGreaterThan(0);
});

test('route list contains the new route', async () => {
	const res = await fetch(`${BASE_URL}/api/routes`);
	const data = await res.json();

	expect(data.ok).toBe(true);
	expect(Array.isArray(data.items)).toBe(true);
	const found = data.items.find(r => r.id === routeId);
	expect(found).toBeDefined();
});

test('new route has all required fields', async () => {
	const res = await fetch(`${BASE_URL}/api/routes/${routeId}`);
	const data = await res.json();

	expect(data.ok).toBe(true);
	expect(data.route.id).toBeDefined();
	expect(data.route.name).toBeDefined();
	expect(data.route.slug).toBeDefined();
	expect(data.route.user_id).toBeDefined();
	expect(data.route.created_at).toBeDefined();
});

test('delete the route', async () => {
	const res = await fetch(`${BASE_URL}/api/routes/${routeId}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const data = await res.json();

	expect(res.status).toBe(200);
	expect(data.ok).toBe(true);
	expect(data.deleted_id).toBe(routeId);
});

test('route no longer appears in list', async () => {
	const res = await fetch(`${BASE_URL}/api/routes`);
	const data = await res.json();

	const found = data.items.find(r => r.id === routeId);
	expect(found).toBeUndefined();
});
