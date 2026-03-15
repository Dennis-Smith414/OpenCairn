// __tests__/route-ratings.test.js
const { login, BASE_URL } = require('./setup');
const { execSync } = require('child_process');

let token;
let routeId;
let initialRating;

beforeAll(async () => {
	token = await login();

	const createRes = await fetch(`${BASE_URL}/api/routes`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({ name: 'Route Rating Test', region: 'Wisconsin' }),
	});
	const createData = await createRes.json();
	routeId = createData.route.id;

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

test('route exists', async () => {
	const res = await fetch(`${BASE_URL}/api/routes/${routeId}`);
	const data = await res.json();

	expect(data.ok).toBe(true);
	expect(data.route.id).toBe(routeId);
});

test('get initial route rating', async () => {
	const res = await fetch(`${BASE_URL}/api/ratings/route/${routeId}`, {
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const data = await res.json();

	expect(data.ok).toBe(true);
	initialRating = Number(data.total);
	expect(typeof initialRating).toBe('number');
});

test('upvote increments rating by 1', async () => {
	const res = await fetch(`${BASE_URL}/api/ratings/route/${routeId}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({ val: 1 }),
	});
	const data = await res.json();
	expect(data.ok).toBe(true);

	const checkRes = await fetch(`${BASE_URL}/api/ratings/route/${routeId}`, {
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const checkData = await checkRes.json();
	expect(Number(checkData.total)).toBe(initialRating + 1);
});

test('downvote returns rating to initial', async () => {
	const res = await fetch(`${BASE_URL}/api/ratings/route/${routeId}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({ val: -1 }),
	});
	const data = await res.json();
	expect(data.ok).toBe(true);

	const checkRes = await fetch(`${BASE_URL}/api/ratings/route/${routeId}`, {
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const checkData = await checkRes.json();
	expect(Number(checkData.total)).toBe(initialRating);
});
