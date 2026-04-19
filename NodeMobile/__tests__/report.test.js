// __tests__/report.test.js
const { login, BASE_URL, createRoute, deleteRoute } = require('./setup');


async function parseJSON(res) {
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`Expected JSON but got (status ${res.status}): ${text.slice(0, 200)}`);
	}
}

async function createComment(token, routeId, content) {
	const res = await fetch(`${BASE_URL}/api/comments/routes/${routeId}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
		body: JSON.stringify({ content }),
	});
	const data = await parseJSON(res);
	if (!data.ok) throw new Error(`Failed to create comment: ${JSON.stringify(data)}`);
	return data.comment.id;
}

async function deleteComment(token, commentId) {
	await fetch(`${BASE_URL}/api/comments/${commentId}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
}

async function getRouteComments(routeId) {
	const res = await fetch(`${BASE_URL}/api/comments/routes/${routeId}`);
	const data = await parseJSON(res);
	return data.comments ?? [];
}

// Poll until the comment disappears or timeout
async function waitUntilHidden(routeId, commentId, timeoutMs = 5000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		await new Promise(r => setTimeout(r, 500));
		const comments = await getRouteComments(routeId);
		if (!comments.find(c => c.id === commentId)) return true;
	}
	return false;
}

let token;
let routeId;

beforeAll(async () => {
	token = await login();
	routeId = await createRoute(token);
});

afterAll(async () => {
	await deleteRoute(token, routeId);
});

// --- 1: Endpoint responds correctly ---

test('report endpoint returns ok for a valid comment', async () => {
	const commentId = await createComment(token, routeId, 'a normal comment');

	const res = await fetch(`${BASE_URL}/api/comments/${commentId}/report`, {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const data = await parseJSON(res);

	expect(res.status).toBe(200);
	expect(data.ok).toBe(true);

	await deleteComment(token, commentId);
});

test('report endpoint returns 401 without auth', async () => {
	const commentId = await createComment(token, routeId, 'another normal comment');

	const res = await fetch(`${BASE_URL}/api/comments/${commentId}/report`, {
		method: 'POST',
	});

	expect(res.status).toBe(401);

	await deleteComment(token, commentId);
});

test('report endpoint returns 404 for a nonexistent comment', async () => {
	const res = await fetch(`${BASE_URL}/api/comments/999999999/report`, {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}` },
	});
	const data = await parseJSON(res);

	expect(res.status).toBe(404);
	expect(data.ok).toBe(false);
});

// --- 2: Egregiously toxic content gets hidden ---

test('explicitly toxic comment is hidden after report', async () => {
	// No profanity — passes bad-words filter. Explicit threat, violence score well above 0.3.
	const commentId = await createComment(
		token,
		routeId,
		'I placed a trap on this trail. I am going to attack and stab the next person who hikes through here alone. I want to watch them bleed.'
	);

	// Confirm it is visible before reporting
	const before = await getRouteComments(routeId);
	expect(before.find(c => c.id === commentId)).toBeDefined();

	await fetch(`${BASE_URL}/api/comments/${commentId}/report`, {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}` },
	});

	const hidden = await waitUntilHidden(routeId, commentId, 12000);
	expect(hidden).toBe(true);
	// No cleanup needed — comment is hidden, not deleted
}, 15000);

// --- 3: Illicit content gets hidden ---
// Pure ad-spam (URLs, caps) scores flagged:false per OpenAI omni-moderation.
// Drug-dealing content scores illicit > 0.5 and is reliably flagged.
// Confirmed in full-mod.js test suite as expectedFlagged: true.

test('illicit content comment is hidden after report', async () => {
	// Explicit drug dealing — illicit score well above 0.5.
	const commentId = await createComment(
		token,
		routeId,
		'Selling heroin, meth, and fentanyl at the north trailhead parking lot. Meet after dark, cash only, no questions asked.'
	);

	const before = await getRouteComments(routeId);
	expect(before.find(c => c.id === commentId)).toBeDefined();

	await fetch(`${BASE_URL}/api/comments/${commentId}/report`, {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}` },
	});

	const hidden = await waitUntilHidden(routeId, commentId, 12000);
	expect(hidden).toBe(true);
}, 15000);

// --- 4: Clean comment stays visible after report ---

test('benign comment remains visible after report', async () => {
	const commentId = await createComment(
		token,
		routeId,
		'Great trail, the cairns near the creek were really helpful. Highly recommend!'
	);

	const before = await getRouteComments(routeId);
	expect(before.find(c => c.id === commentId)).toBeDefined();

	await fetch(`${BASE_URL}/api/comments/${commentId}/report`, {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${token}` },
	});

	// Wait long enough for moderation to have run, then check it is still there
	await new Promise(r => setTimeout(r, 4000));

	const after = await getRouteComments(routeId);
	expect(after.find(c => c.id === commentId)).toBeDefined();

	await deleteComment(token, commentId);
}, 10000);
