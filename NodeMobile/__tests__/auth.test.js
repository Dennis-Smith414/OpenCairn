//Same test that should return a JWT

import { API_BASE } from '../src/config/env';

test('login returns a JWT', async () => {
	const res = await fetch(`${API_BASE}/api/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username: 'testsuite', password: 'Tester@123' })
	});
	
	const data = await res.json();
	expect(res.status).toBe(200);
	expect(data.token).toBeDefined();
});

