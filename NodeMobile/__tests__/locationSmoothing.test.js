const {
	extrapolate,
	approxDistanceMeters,
	headingFromVelocity,
	shortestArcDeltaDeg,
	reconcileDamp,
} = require('../src/utils/locationSmoothing');

describe('approxDistanceMeters', () => {
	test('one degree of latitude is ~111.2 km', () => {
		expect(approxDistanceMeters(1, 0, 43)).toBeGreaterThan(110000);
		expect(approxDistanceMeters(1, 0, 43)).toBeLessThan(112500);
	});

	test('longitude degrees shrink with cos(latitude)', () => {
		const eq = approxDistanceMeters(0, 1, 0);
		const at60 = approxDistanceMeters(0, 1, 60);
		expect(at60 / eq).toBeCloseTo(0.5, 2);
	});

	test('zero delta is zero', () => {
		expect(approxDistanceMeters(0, 0, 43)).toBe(0);
	});
});

describe('extrapolate', () => {
	test('is linear in elapsed time', () => {
		const p = { lat: 43, lng: -87 };
		const v = { vlat: 1e-9, vlng: -2e-9 };
		const a = extrapolate(p, v, 1000);
		const b = extrapolate(p, v, 2000);
		expect(b.lat - p.lat).toBeCloseTo(2 * (a.lat - p.lat), 12);
		expect(b.lng - p.lng).toBeCloseTo(2 * (a.lng - p.lng), 12);
	});

	test('zero elapsed returns the anchor', () => {
		const p = { lat: 43, lng: -87 };
		expect(extrapolate(p, { vlat: 1, vlng: 1 }, 0)).toEqual(p);
	});
});

describe('shortestArcDeltaDeg', () => {
	test.each([
		[350, 10, 20],
		[10, 350, -20],
		[0, 180, 180],
		[90, 90, 0],
	])('%d -> %d is %d', (from, to, expected) => {
		expect(Math.abs(shortestArcDeltaDeg(from, to))).toBeCloseTo(Math.abs(expected), 6);
	});
});

describe('headingFromVelocity', () => {
	test('cardinal directions', () => {
		const lat = 43;
		const v = 1e-8;
		expect(headingFromVelocity({ vlat: v, vlng: 0 }, lat)).toBeCloseTo(0, 3);
		expect(headingFromVelocity({ vlat: 0, vlng: v }, lat)).toBeCloseTo(90, 3);
		expect(headingFromVelocity({ vlat: -v, vlng: 0 }, lat)).toBeCloseTo(180, 3);
		expect(headingFromVelocity({ vlat: 0, vlng: -v }, lat)).toBeCloseTo(270, 3);
	});

	test('no direction for a stationary velocity', () => {
		expect(headingFromVelocity({ vlat: 0, vlng: 0 }, 43)).toBeNull();
	});
});

describe('reconcileDamp', () => {
	test('runs from 1 to 0 and never increases', () => {
		expect(reconcileDamp(0)).toBeCloseTo(1, 6);
		expect(reconcileDamp(1)).toBeCloseTo(0, 6);
		let prev = 1;
		for (let t = 0; t <= 1; t += 0.05) {
			const d = reconcileDamp(t);
			expect(d).toBeLessThanOrEqual(prev + 1e-9);
			prev = d;
		}
	});
});
