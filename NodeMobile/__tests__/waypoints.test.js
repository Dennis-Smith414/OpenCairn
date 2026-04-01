const { login, BASE_URL } = require('./setup');
const { execSync } = require('child_process');
const fs = require('fs');

let token;
let routeId;
let waypointId;

beforeAll(async () => {
	token = await login();

	// Create route
	const createRes = await fetch(`${BASE_URL}/api/routes`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({ name: 'Waypoint Test Route', region: 'Wisconsin' }),
	});
	const createData = await createRes.json();
	routeId = createData.route.id;

	// Upload GPX
	execSync(
		`curl -s -X POST ${BASE_URL}/api/routes/${routeId}/gpx \
    -H "Authorization: Bearer ${token}" \
    -F "file=@${__dirname}/Downer_Woods.gpx"`
	);
});

afterAll(async () => {
	await fetch(`${BASE_URL}/api/routes/${routeId}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
});

test('create a waypoint on the route', async () => {
	const res = await fetch(`${BASE_URL}/api/waypoints`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({
			route_id: routeId,
			name: 'Test Cairn',
			lat: 43.07,
			lon: -87.88,
			type: 'generic',
		}),
	});
	const data = await res.json();

	expect(res.status).toBe(200);
	expect(data.ok).toBe(true);
	waypointId = data.waypoint.id;
	expect(waypointId).toBeDefined();
});

test('route data includes the waypoint', async () => {
	const res = await fetch(`${BASE_URL}/api/waypoints/route/${routeId}`);
	const data = await res.json();

	expect(data.ok).toBe(true);
	expect(Array.isArray(data.items)).toBe(true);
	const found = data.items.find(w => w.id === waypointId);
	expect(found).toBeDefined();
	expect(found.name).toBe('Test Cairn');
	expect(found.lat).toBeDefined();
	expect(found.lon).toBeDefined();
});

test('waypoint has all required fields', async () => {
	const res = await fetch(`${BASE_URL}/api/waypoints/${waypointId}`);
	const data = await res.json();

	expect(data.ok).toBe(true);
	expect(data.waypoint.id).toBeDefined();
	expect(data.waypoint.name).toBe('Test Cairn');
	expect(data.waypoint.lat).toBeDefined();
	expect(data.waypoint.lon).toBeDefined();
	expect(data.waypoint.route_id).toBe(routeId);
	expect(data.waypoint.username).toBeDefined();
});

test('delete the waypoint', async () => {
	const res = await fetch(`${BASE_URL}/api/waypoints/${waypointId}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const data = await res.json();

	expect(res.status).toBe(200);
	expect(data.ok).toBe(true);
});

test('waypoint no longer appears on route', async () => {
	const res = await fetch(`${BASE_URL}/api/waypoints/route/${routeId}`);
	const data = await res.json();

	const found = data.items.find(w => w.id === waypointId);
	expect(found).toBeUndefined();
});
