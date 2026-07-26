// Geometry for the "how far along the GPX route have I walked" grey line.
//
// The grey line's leading edge must NOT snap to route vertices — that makes it
// jump in chunks on a sparsely-sampled GPX. Instead we project the user's
// position onto the trail segment and cut the line at that projected point, so
// the edge slides continuously along the trail. DISPLAY ONLY.

export interface LL {
  lat: number;
  lng: number;
}

/**
 * Closest point on segment a→b to point p, clamped to the segment, plus the
 * parameter t in [0,1] (0 = at a, 1 = at b).
 *
 * Uses a local equirectangular approximation: longitude is scaled by
 * cos(latitude) so the projection is metrically correct over the short spans
 * between GPX vertices (the error over a few tens of meters is invisible).
 */
export function projectOntoSegment(p: LL, a: LL, b: LL): { point: LL; t: number } {
  const latRef = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const kx = Math.cos(latRef); // scale longitude into the same units as latitude

  const ax = a.lng * kx;
  const ay = a.lat;
  const bx = b.lng * kx;
  const by = b.lat;
  const px = p.lng * kx;
  const py = p.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;

  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;

  return {
    point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
    t,
  };
}
