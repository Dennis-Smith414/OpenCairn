// __tests__/waypoint-comments.test.js
const { login, BASE_URL } = require('./setup');
const { execSync } = require('child_process');

let token;
let routeId;
let waypointId;
let commentId;

beforeAll(async () => {
	token = await login();

	const createRes = await fetch(`${BASE_URL}/api/routes`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({ name: 'Waypoint Comment Test Route', region: 'Wisconsin' }),
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
			name: 'Comment Test Cairn',
			lat: 43.07,
			lon: -87.88,
			type: 'generic',
		}),
	});
	const wpData = await wpRes.json();
	waypointId = wpData.waypoint.id;
});

afterAll(async () => {
	await fetch(`${BASE_URL}/api/waypoints/${waypointId}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
	await fetch(`${BASE_URL}/api/routes/${routeId}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
});

test('create a comment on the waypoint', async () => {
	const res = await fetch(`${BASE_URL}/api/comments/waypoints/${waypointId}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({ content: 'test' }),
	});
	const data = await res.json();

	expect(res.status).toBe(200);
	expect(data.ok).toBe(true);
	commentId = data.comment.id;
	expect(commentId).toBeDefined();
	expect(data.comment.content).toBe('test');
});

test('comment appears on waypoint', async () => {
	const res = await fetch(`${BASE_URL}/api/comments/waypoints/${waypointId}`);
	const data = await res.json();

	expect(data.ok).toBe(true);
	expect(Array.isArray(data.comments)).toBe(true);
	const found = data.comments.find(c => c.id === commentId);
	expect(found).toBeDefined();
	expect(found.content).toBe('test');
	expect(found.username).toBeDefined();
});

test('comment has all required fields', async () => {
	const res = await fetch(`${BASE_URL}/api/comments/waypoints/${waypointId}`);
	const data = await res.json();

	const comment = data.comments.find(c => c.id === commentId);
	expect(comment.id).toBeDefined();
	expect(comment.content).toBe('test');
	expect(comment.created_at).toBeDefined();
	expect(comment.username).toBeDefined();
	expect(comment.user_id).toBeDefined();
});

test('delete the comment', async () => {
	const res = await fetch(`${BASE_URL}/api/comments/${commentId}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const data = await res.json();

	expect(res.status).toBe(200);
	expect(data.ok).toBe(true);
});

test('comment is gone', async () => {
	const res = await fetch(`${BASE_URL}/api/comments/waypoints/${waypointId}`);
	const data = await res.json();

	const found = data.comments.find(c => c.id === commentId);
	expect(found).toBeUndefined();
});
