import { projectOntoSegment } from "../src/utils/geoProgress";

describe("projectOntoSegment", () => {
  const a = { lat: 43.0, lng: -87.0 };
  const b = { lat: 43.0, lng: -87.002 }; // due west, same latitude

  test("point beside the middle projects to the middle (t≈0.5)", () => {
    // slightly north of the segment midpoint
    const p = { lat: 43.0005, lng: -87.001 };
    const { point, t } = projectOntoSegment(p, a, b);
    expect(t).toBeCloseTo(0.5, 3);
    expect(point.lng).toBeCloseTo(-87.001, 6);
    expect(point.lat).toBeCloseTo(43.0, 6);
  });

  test("point before a clamps to a (t=0)", () => {
    const p = { lat: 43.0, lng: -86.999 }; // east of a
    const { t, point } = projectOntoSegment(p, a, b);
    expect(t).toBe(0);
    expect(point.lng).toBeCloseTo(-87.0, 9);
  });

  test("point past b clamps to b (t=1)", () => {
    const p = { lat: 43.0, lng: -87.003 }; // west of b
    const { t, point } = projectOntoSegment(p, a, b);
    expect(t).toBe(1);
    expect(point.lng).toBeCloseTo(-87.002, 9);
  });

  test("zero-length segment returns a with t=0", () => {
    const { t, point } = projectOntoSegment({ lat: 43.1, lng: -87.1 }, a, a);
    expect(t).toBe(0);
    expect(point.lat).toBeCloseTo(43.0, 9);
    expect(point.lng).toBeCloseTo(-87.0, 9);
  });

  test("t maps linearly onto the interpolated point", () => {
    const p = { lat: 43.0, lng: -87.0005 }; // a quarter of the way toward b
    const { t, point } = projectOntoSegment(p, a, b);
    expect(t).toBeCloseTo(0.25, 3);
    expect(point.lng).toBeCloseTo(-87.0005, 6);
  });
});
