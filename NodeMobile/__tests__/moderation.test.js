const { login, BASE_URL, createRoute, deleteRoute, createWaypoint } = require('./setup');

async function parseJSON(res) {
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`Expected JSON response but got (status ${res.status}): ${text.slice(0, 200)}`);
	}
}

let token;
let routeId;
let waypointId;

beforeAll(async () => {
	token = await login();
	routeId = await createRoute(token);
	waypointId = await createWaypoint(token, routeId);
});

afterAll(async () => {
	await deleteRoute(token, routeId);
});

// --- Routes ---

test('POST /api/routes rejects profane name', async () => {
	const res = await fetch(`${BASE_URL}/api/routes`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
		body: JSON.stringify({ name: 'shit trail', region: 'Wisconsin' }),
	});
	const data = await parseJSON(res);

	expect(res.status).toBe(400);
	expect(data.ok).toBe(false);
	expect(data.error).toBe('Inappropriate content.');
});

test('PATCH /api/routes/:id rejects profane name', async () => {
	const res = await fetch(`${BASE_URL}/api/routes/${routeId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
		body: JSON.stringify({ name: 'shit trail' }),
	});
	const data = await parseJSON(res);

	expect(res.status).toBe(400);
	expect(data.ok).toBe(false);
});

// --- Waypoints ---

test('POST /api/waypoints rejects profane name', async () => {
	const res = await fetch(`${BASE_URL}/api/waypoints`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
		body: JSON.stringify({ route_id: routeId, name: 'shit cairn', lat: 43.07, lon: -87.88 }),
	});
	const data = await parseJSON(res);

	expect(res.status).toBe(400);
	expect(data.ok).toBe(false);
});

test('PATCH /api/waypoints/:id rejects profane name', async () => {
	const res = await fetch(`${BASE_URL}/api/waypoints/${waypointId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
		body: JSON.stringify({ name: 'shit cairn' }),
	});
	const data = await parseJSON(res);

	expect(res.status).toBe(400);
	expect(data.ok).toBe(false);
});

// --- Comments ---

test('POST /api/comments/routes/:id rejects profane content', async () => {
	const res = await fetch(`${BASE_URL}/api/comments/routes/${routeId}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
		body: JSON.stringify({ content: 'this trail is shit' }),
	});
	const data = await parseJSON(res);

	expect(res.status).toBe(400);
	expect(data.ok).toBe(false);
});

test('POST /api/comments/waypoints/:id rejects profane content', async () => {
	const res = await fetch(`${BASE_URL}/api/comments/waypoints/${waypointId}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
		body: JSON.stringify({ content: 'this cairn is shit' }),
	});
	const data = await parseJSON(res);

	expect(res.status).toBe(400);
	expect(data.ok).toBe(false);
});

test('PATCH /api/comments/:id rejects profane content', async () => {
	const create = await fetch(`${BASE_URL}/api/comments/routes/${routeId}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
		body: JSON.stringify({ content: 'nice trail' }),
	});
	const created = await parseJSON(create);
	const commentId = created.comment.id;

	const res = await fetch(`${BASE_URL}/api/comments/${commentId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
		body: JSON.stringify({ content: 'this trail is shit' }),
	});
	const data = await parseJSON(res);

	expect(res.status).toBe(400);
	expect(data.ok).toBe(false);

	await fetch(`${BASE_URL}/api/comments/${commentId}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
});
