//Same test that should return a JWT

const API_BASE = process.env.API_BASE;

test('login returns a JWT', async () => {
	const res = await fetch(`${API_BASE}/api/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username: process.env.TEST_USERNAME, password: process.env.TEST_PASSWORD })
	});
	
	const data = await res.json();
	expect(res.status).toBe(200);
	expect(data.token).toBeDefined();
});

