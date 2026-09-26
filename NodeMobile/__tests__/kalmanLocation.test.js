const {
	createKalmanEstimator,
	toLocalMeters,
	fromLocalMeters,
	clamp,
} = require('../src/utils/kalmanLocation');
const { approxDistanceMeters } = require('../src/utils/locationSmoothing');

const dist = (a, b) => approxDistanceMeters(a.lat - b.lat, a.lng - b.lng, a.lat);

describe('local meter projection', () => {
	test('round-trips within a millimetre', () => {
		const ref = { lat: 43.08, lng: -87.88 };
		const p = { lat: 43.0812, lng: -87.8791 };
		const { x, y } = toLocalMeters(p.lat, p.lng, ref.lat, ref.lng);
		const back = fromLocalMeters(x, y, ref.lat, ref.lng);
		expect(dist(p, back)).toBeLessThan(0.001);
	});
});

describe('clamp', () => {
	test('bounds both sides', () => {
		expect(clamp(5, 0, 3)).toBe(3);
		expect(clamp(-1, 0, 3)).toBe(0);
		expect(clamp(2, 0, 3)).toBe(2);
	});
});

describe('createKalmanEstimator', () => {
	test('first fix is returned unchanged', () => {
		const est = createKalmanEstimator();
		const r = est.onFix(43.08, -87.88, null, 5, 1000);
		expect(r.lat).toBe(43.08);
		expect(r.lng).toBe(-87.88);
	});

	test('a stationary receiver converges on the true point', () => {
		const est = createKalmanEstimator();
		const truth = { lat: 43.08, lng: -87.88 };
		let r;
		for (let i = 0; i < 30; i++) {
			// deterministic +-4 m alternating jitter
			const jitter = (i % 2 ? 1 : -1) * 4 * 9e-6;
			r = est.onFix(truth.lat + jitter, truth.lng, null, 5, 1000 + i * 1000);
		}
		expect(dist(r, truth)).toBeLessThan(3);
	});

	test('a single outlier does not drag the anchor its full distance', () => {
		const est = createKalmanEstimator();
		const truth = { lat: 43.08, lng: -87.88 };
		for (let i = 0; i < 10; i++) est.onFix(truth.lat, truth.lng, null, 5, 1000 + i * 1000);
		const outlier = { lat: truth.lat + 100 * 9e-6, lng: truth.lng }; // 100 m off
		const r = est.onFix(outlier.lat, outlier.lng, null, 5, 11000);
		expect(dist(r, truth)).toBeLessThan(dist(outlier, truth));
	});

	test('reset forgets prior state', () => {
		const est = createKalmanEstimator();
		est.onFix(43.08, -87.88, null, 5, 1000);
		est.reset();
		const r = est.onFix(44, -88, null, 5, 2000);
		expect(r.lat).toBe(44);
		expect(r.lng).toBe(-88);
	});
});
