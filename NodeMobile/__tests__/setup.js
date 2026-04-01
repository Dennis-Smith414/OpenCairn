//A file that contains repeated fucnctions that will need to be shared

const { API_BASE } = require('../src/config/env');
const BASE_URL = API_BASE;


async function login() {
	const res = await fetch(`${BASE_URL}/api/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username: 'testsuite', password: 'Tester@123' }),
	});
	const data = await res.json();
	return data.token;
}

async function createRoute(token) {
	const res = await fetch(`${BASE_URL}/api/routes`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		},
		body: JSON.stringify({ name: 'Test Route', region: 'Wisconsin' }),
	});
	const data = await res.json();
	return data.route.id;
}

async function deleteRoute(token, id) {
	await fetch(`${BASE_URL}/api/routes/${id}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
}

async function createWaypoint(token, routeId) {
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
	return data.waypoint.id;
}

async function deleteWaypoint(token, id) {
	await fetch(`${BASE_URL}/api/waypoints/${id}`, {
		method: 'DELETE',
		headers: { 'Authorization': `Bearer ${token}` },
	});
}

module.exports = {
	BASE_URL,
	login,
	createRoute,
	deleteRoute,
	createWaypoint,
	deleteWaypoint,
};
