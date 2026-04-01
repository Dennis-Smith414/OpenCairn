// __tests__/waypoint-ratings.test.js
const { login, BASE_URL } = require('./setup');
const { execSync } = require('child_process');

let token;
let routeId;
let waypointId;
let initialRating;

beforeAll(async () => {
	token = await login();

	const createRes = await fetch(`${BASE_URL}/api/routes`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({ name: 'Rating Test Route', region: 'Wisconsin' }),
	});
	const createData = await createRes.json();
	routeId = createData.route.id;

	execSync(
		`curl -s -X POST ${BASE_URL}/api/routes/${routeId}/gpx \
    -H "Authorization: Bearer ${token}" \
    -F "file=@${__dirname}/Downer_Woods.gpx"`
	);

	const wpRes = await fetch(`${BASE_URL}/api/waypoints`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({
			route_id: routeId,
			name: 'Rating Test Cairn',
			lat: 43.07,
			lon: -87.88,
			type: 'generic',
		}),
	});
	const wpData = await wpRes.json();
	waypointId = wpData.waypoint.id;
});

afterAll(async () => {
	if (waypointId) {
		await fetch(`${BASE_URL}/api/waypoints/${waypointId}`, {
			method: 'DELETE',
			headers: { 'Authorization': `Bearer ${token}` },
		});
	}
	await fetch(`${BASE_URL}/api/routes/${routeId}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
});

test('waypoint exists', async () => {
	const res = await fetch(`${BASE_URL}/api/waypoints/${waypointId}`);
	const data = await res.json();

	expect(data.ok).toBe(true);
	expect(data.waypoint.id).toBe(waypointId);
});

test('get initial waypoint rating', async () => {
	const res = await fetch(`${BASE_URL}/api/ratings/waypoint/${waypointId}`, {
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const data = await res.json();

	expect(data.ok).toBe(true);
	initialRating = Number(data.total);
	expect(typeof initialRating).toBe('number');
});

test('upvote increments rating by 1', async () => {
	const res = await fetch(`${BASE_URL}/api/ratings/waypoint/${waypointId}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({ val: 1 }),
	});
	const data = await res.json();

	expect(data.ok).toBe(true);

	// verify by fetching the rating separately
	const checkRes = await fetch(`${BASE_URL}/api/ratings/waypoint/${waypointId}`, {
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const checkData = await checkRes.json();
	expect(Number(checkData.total)).toBe(initialRating + 1);
});

test('downvote returns rating to initial', async () => {
	const res = await fetch(`${BASE_URL}/api/ratings/waypoint/${waypointId}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({ val: -1 }),
	});
	const data = await res.json();

	expect(data.ok).toBe(true);

	const checkRes = await fetch(`${BASE_URL}/api/ratings/waypoint/${waypointId}`, {
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const checkData = await checkRes.json();
	expect(Number(checkData.total)).toBe(initialRating);
});

test('delete waypoint', async () => {
	const res = await fetch(`${BASE_URL}/api/waypoints/${waypointId}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const data = await res.json();

	expect(res.status).toBe(200);
	expect(data.ok).toBe(true);
	waypointId = null;
});

test('waypoint is gone', async () => {
	const res = await fetch(`${BASE_URL}/api/waypoints/route/${routeId}`);
	const data = await res.json();

	const found = data.items.find(w => w.id === waypointId);
	expect(found).toBeUndefined();
});
