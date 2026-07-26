import { lerp, lerpHeading, lerpPoint, progress } from "../src/utils/locationSmoothing";

describe("lerp", () => {
  test("endpoints and midpoint", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
  test("clamps t outside [0,1]", () => {
    expect(lerp(0, 10, -1)).toBe(0);
    expect(lerp(0, 10, 2)).toBe(10);
  });
});

describe("lerpHeading — shortest arc across the 0/360 seam", () => {
  test("359 -> 1 sweeps forward through 0, not backward", () => {
    // halfway should be ~0 (360), not ~180
    expect(lerpHeading(359, 1, 0.5)).toBeCloseTo(0, 5);
  });
  test("1 -> 359 sweeps backward through 0", () => {
    expect(lerpHeading(1, 359, 0.5)).toBeCloseTo(0, 5);
  });
  test("no seam: 90 -> 180 is ordinary", () => {
    expect(lerpHeading(90, 180, 0.5)).toBeCloseTo(135, 5);
  });
  test("result always normalized to [0,360)", () => {
    const h = lerpHeading(350, 20, 1);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
    expect(h).toBeCloseTo(20, 5);
  });
  test("endpoints preserved", () => {
    expect(lerpHeading(42, 300, 0)).toBeCloseTo(42, 5);
    expect(lerpHeading(42, 300, 1)).toBeCloseTo(300, 5);
  });
});

describe("lerpPoint", () => {
  test("midpoint of a small step", () => {
    const p = lerpPoint({ lat: 43.0, lng: -87.0 }, { lat: 43.001, lng: -87.002 }, 0.5);
    expect(p.lat).toBeCloseTo(43.0005, 6);
    expect(p.lng).toBeCloseTo(-87.001, 6);
  });
});

describe("progress", () => {
  test("linear across the span", () => {
    expect(progress(1000, 2000, 1000)).toBe(0);
    expect(progress(1000, 2000, 1500)).toBe(0.5);
    expect(progress(1000, 2000, 2000)).toBe(1);
  });
  test("clamps before/after the span", () => {
    expect(progress(1000, 2000, 500)).toBe(0);
    expect(progress(1000, 2000, 9999)).toBe(1);
  });
  test("zero or negative span snaps to newest (no divide-by-zero)", () => {
    expect(progress(1000, 1000, 1000)).toBe(1);
    expect(progress(2000, 1000, 1500)).toBe(1);
  });
});
