import {
  ON_ROUTE_COLOR,
  OFF_ROUTE_COLOR,
  distanceToPolylineMeters,
  distanceToSegmentsMeters,
  offRouteColor,
  offRouteFactor,
} from "../src/utils/offRoute";

// A straight east-west line at 43°N. ~1e-5° of latitude is ~1.11 m, so offsets
// are easy to state in metres by perturbing latitude.
const LINE: [number, number][] = [
  [43.0, -87.0],
  [43.0, -86.99],
];
const M_PER_DEG_LAT = 111_195;

describe("distanceToPolylineMeters", () => {
  test("zero on the line", () => {
    expect(distanceToPolylineMeters({ lat: 43.0, lng: -86.995 }, LINE)).toBeCloseTo(0, 1);
  });

  test("perpendicular offset from the middle of a segment, not to a vertex", () => {
    // Halfway along the segment and 20 m north. The nearest VERTEX is ~400 m
    // away; the nearest point on the SEGMENT is 20 m away. Vertex-only distance
    // would colour the dot amber while walking straight down the trail.
    const p = { lat: 43.0 + 20 / M_PER_DEG_LAT, lng: -86.995 };
    expect(distanceToPolylineMeters(p, LINE)).toBeCloseTo(20, 0);
  });

  test("beyond an endpoint clamps to that endpoint", () => {
    const p = { lat: 43.0, lng: -87.001 }; // ~81 m west of the start
    const d = distanceToPolylineMeters(p, LINE);
    expect(d).toBeGreaterThan(70);
    expect(d).toBeLessThan(95);
  });

  test("a polyline with fewer than two points has no segments", () => {
    expect(distanceToPolylineMeters({ lat: 43, lng: -87 }, [])).toBe(Infinity);
    expect(distanceToPolylineMeters({ lat: 43, lng: -87 }, [[43, -87]])).toBe(Infinity);
  });
});

describe("distanceToSegmentsMeters", () => {
  test("takes the closest of several segments", () => {
    const far: [number, number][] = [
      [43.01, -87.0],
      [43.01, -86.99],
    ];
    const p = { lat: 43.0 + 15 / M_PER_DEG_LAT, lng: -86.995 };
    expect(distanceToSegmentsMeters(p, [far, LINE])).toBeCloseTo(15, 0);
  });

  test("does not bridge disjoint segments", () => {
    // Two segments a long way apart. A point midway between them must NOT read
    // as near-zero, which is what concatenating them into one polyline would do.
    const west: [number, number][] = [
      [43.0, -87.01],
      [43.0, -87.0],
    ];
    const east: [number, number][] = [
      [43.0, -86.9],
      [43.0, -86.89],
    ];
    const midway = { lat: 43.0, lng: -86.95 };
    expect(distanceToSegmentsMeters(midway, [west, east])).toBeGreaterThan(3000);
  });

  test("no segments at all — nothing loaded", () => {
    expect(distanceToSegmentsMeters({ lat: 43, lng: -87 }, [])).toBe(Infinity);
  });
});

describe("offRouteFactor — accuracy-scaled gradient", () => {
  test("on the line is always fully normal, at any accuracy", () => {
    expect(offRouteFactor(0, 5)).toBe(0);
    expect(offRouteFactor(0, 40)).toBe(0);
    expect(offRouteFactor(0, null)).toBe(0);
  });

  test("a 30 m offset reads as genuinely off-route with a tight fix", () => {
    expect(offRouteFactor(30, 5)).toBeGreaterThan(0.8);
  });

  test("the same 30 m offset is explained away by a poor fix", () => {
    // ±40 m under canopy: 30 m is inside the uncertainty, so no amber at all.
    expect(offRouteFactor(30, 40)).toBe(0);
  });

  test("monotonic in distance", () => {
    const acc = 8;
    const samples = [0, 10, 20, 30, 40, 60, 100].map((d) => offRouteFactor(d, acc));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
  });

  test("worse accuracy never increases the factor at a fixed distance", () => {
    const d = 45;
    const samples = [3, 10, 20, 40, 80].map((a) => offRouteFactor(d, a));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
    }
  });

  test("eases rather than flipping — no single step carries most of the ramp", () => {
    // Sampled every metre across the whole ramp for a ±5 m fix, the largest
    // single-metre jump must stay small. A binary threshold would show a 1.0 step.
    const acc = 5;
    let maxStep = 0;
    let prev = offRouteFactor(0, acc);
    for (let d = 1; d <= 60; d++) {
      const cur = offRouteFactor(d, acc);
      maxStep = Math.max(maxStep, cur - prev);
      prev = cur;
    }
    expect(maxStep).toBeLessThan(0.1);
  });

  test("clamped to [0,1] and saturates far out", () => {
    expect(offRouteFactor(5000, 5)).toBe(1);
    expect(offRouteFactor(5000, 200)).toBe(1);
  });

  test("a non-finite distance (nothing loaded) is not off-route", () => {
    expect(offRouteFactor(Infinity, 5)).toBe(0);
    expect(offRouteFactor(NaN, 5)).toBe(0);
  });

  test("missing or nonsense accuracy falls back, not to hair-trigger", () => {
    // Unknown accuracy must not behave like a perfect fix.
    expect(offRouteFactor(14, null)).toBe(0);
    expect(offRouteFactor(14, undefined)).toBe(0);
    expect(offRouteFactor(14, -1)).toBe(0);
    expect(offRouteFactor(14, NaN)).toBe(0);
  });
});

describe("offRouteColor", () => {
  test("endpoints are the declared colours", () => {
    expect(offRouteColor(0).toLowerCase()).toBe(ON_ROUTE_COLOR.toLowerCase());
    expect(offRouteColor(1).toLowerCase()).toBe(OFF_ROUTE_COLOR.toLowerCase());
  });

  test("clamps out-of-range factors", () => {
    expect(offRouteColor(-5).toLowerCase()).toBe(ON_ROUTE_COLOR.toLowerCase());
    expect(offRouteColor(9).toLowerCase()).toBe(OFF_ROUTE_COLOR.toLowerCase());
  });

  test("intermediate factors are distinct in-between colours", () => {
    const mid = offRouteColor(0.5);
    expect(mid).toMatch(/^#[0-9a-f]{6}$/);
    expect(mid.toLowerCase()).not.toBe(ON_ROUTE_COLOR.toLowerCase());
    expect(mid.toLowerCase()).not.toBe(OFF_ROUTE_COLOR.toLowerCase());
  });

  test("red channel rises monotonically toward the off-route colour", () => {
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const steps = [0, 0.25, 0.5, 0.75, 1].map((t) => red(offRouteColor(t)));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    }
  });
});
