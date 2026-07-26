// Pure interpolation helpers for the DISPLAYED location dot.
//
// These smooth ONLY what's drawn on screen. The recorded track is written from
// the raw fixes elsewhere and must never pass through here — see MapScreen /
// TripTracker. This is an animation problem, so it's plain linear interpolation,
// deliberately NOT a Kalman filter or any predictive model.

/** Linear interpolate a scalar. t is clamped to [0,1]. */
export function lerp(a: number, b: number, t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return a + (b - a) * tc;
}

/**
 * Interpolate a compass heading in degrees along the SHORTEST arc, so a turn
 * from 359° to 1° sweeps 2° forward through 0° instead of 358° backward.
 * Returns a value normalized to [0, 360).
 */
export function lerpHeading(a: number, b: number, t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  // shortest signed delta in (-180, 180]
  let delta = ((b - a + 540) % 360) - 180;
  const result = a + delta * tc;
  return ((result % 360) + 360) % 360;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

/** Interpolate a lat/lng point. Small distances only (a single GPS step), so
 *  plain component-wise lerp is visually indistinguishable from great-circle. */
export function lerpPoint(a: LatLngPoint, b: LatLngPoint, t: number): LatLngPoint {
  return { lat: lerp(a.lat, b.lat, t), lng: lerp(a.lng, b.lng, t) };
}

/**
 * Progress [0,1] of `now` between two fix timestamps. Guards against a zero or
 * negative span (duplicate/out-of-order timestamps) by snapping to 1 (show the
 * newest fix) rather than dividing by zero.
 */
export function progress(fromTs: number, toTs: number, now: number): number {
  const span = toTs - fromTs;
  if (span <= 0) return 1;
  const p = (now - fromTs) / span;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
