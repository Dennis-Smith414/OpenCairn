// Inlined instead of importing src/utils/locationSmoothing.ts so the Detox jest
// config needs no TypeScript transform.
function distanceMeters(lat1, lon1, lat2, lon2) {
	const R = 6371000;
	const toRad = d => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1) * Math.cos(toRad((lat1 + lat2) / 2));
	return R * Math.sqrt(dLat * dLat + dLon * dLon);
}

// Polls the E2E-only anchor readout until the app's corrected position is within
// toleranceM of the injected fix. Bounded by timeoutMs and fails with the last
// value seen, replacing fixed sleeps.
async function waitForAnchorNear(lat, lon, toleranceM, timeoutMs = 8000) {
	const start = Date.now();
	let last = null;
	while (Date.now() - start < timeoutMs) {
		const attrs = await element(by.id('e2e-anchor-debug')).getAttributes();
		const text = attrs.text || attrs.label || '';
		if (text) {
			const a = JSON.parse(text);
			last = { ...a, distM: distanceMeters(lat, lon, a.lat, a.lng) };
			if (last.distM <= toleranceM) return last;
		}
		await new Promise(r => setTimeout(r, 250));
	}
	throw new Error(
		`Anchor not within ${toleranceM} m of (${lat}, ${lon}) after ${timeoutMs} ms; last seen: ${JSON.stringify(last)}`,
	);
}

module.exports = { waitForAnchorNear, distanceMeters };
