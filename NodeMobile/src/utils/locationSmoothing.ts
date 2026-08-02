// Pure interpolation helpers for the DISPLAYED location dot.
//
// These smooth ONLY what's drawn on screen. The recorded track is written from
// the raw fixes elsewhere and must never pass through here — see MapScreen /
// TripTracker. This is an animation problem, so it's plain linear interpolation,
// deliberately NOT a Kalman filter or any predictive model.
//
// createDeadReckoningEstimator() below is the default LocationEstimator
// consumed by useSmoothedLocation.ts when no alternate estimator (e.g.
// kalmanLocation.ts's createKalmanEstimator()) is passed in. Type-only import
// to avoid coupling this file to the Kalman module at runtime.
import type { LocationEstimator, EstimatorResult } from "./kalmanLocation";

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

export interface Velocity {
  vlat: number; // degrees latitude per ms
  vlng: number; // degrees longitude per ms
}

/**
 * Per-ms velocity between two timestamped points. Returns a zero vector when the
 * time delta is non-positive or implausibly large (>5s → treat as a fresh start,
 * not real motion), so a GPS gap can't launch the dot off at a stale speed.
 */
export function velocity(
  a: LatLngPoint,
  aTs: number,
  b: LatLngPoint,
  bTs: number,
): Velocity {
  const dt = bTs - aTs;
  if (dt <= 0 || dt > 5000) return { vlat: 0, vlng: 0 };
  return { vlat: (b.lat - a.lat) / dt, vlng: (b.lng - a.lng) / dt };
}

/** Project a point forward along a velocity over `leadMs` (dead reckoning). */
export function extrapolate(p: LatLngPoint, v: Velocity, leadMs: number): LatLngPoint {
  return { lat: p.lat + v.vlat * leadMs, lng: p.lng + v.vlng * leadMs };
}

const VEL_SMOOTH = 0.5; // blend new velocity with previous (0..1); damps GPS noise
// Below this per-fix displacement (~1.1m in degrees) we treat you as stationary
// and drop velocity to zero, so the dot doesn't drift while you stand still.
const STILL_EPS = 1e-5;

/**
 * The default LocationEstimator: measures velocity between consecutive fixes
 * (damped, with a stillness deadband) and aims `leadMs` ahead of the raw fix.
 * Ignores `accuracy` entirely — unlike kalmanLocation.ts's estimator, every
 * fix is trusted equally. Heading is passed through unchanged (including
 * null/undefined); useSmoothedLocation.ts's caller handles carrying the prior
 * heading forward when a fix lacks a course.
 */
export function createDeadReckoningEstimator(): LocationEstimator {
  let prevFix: LatLngPoint & { ts: number } | null = null;
  let vel: Velocity = { vlat: 0, vlng: 0 };

  function reset() {
    prevFix = null;
    vel = { vlat: 0, vlng: 0 };
  }

  function onFix(
    lat: number,
    lng: number,
    heading: number | null | undefined,
    _accuracy: number | null | undefined,
    ts: number,
    leadMs: number,
  ): EstimatorResult {
    if (prevFix) {
      const moved = Math.hypot(lat - prevFix.lat, lng - prevFix.lng);
      const raw = moved < STILL_EPS ? { vlat: 0, vlng: 0 } : velocity(prevFix, prevFix.ts, { lat, lng }, ts);
      vel = {
        vlat: VEL_SMOOTH * raw.vlat + (1 - VEL_SMOOTH) * vel.vlat,
        vlng: VEL_SMOOTH * raw.vlng + (1 - VEL_SMOOTH) * vel.vlng,
      };
    }
    prevFix = { lat, lng, ts };

    const target = extrapolate({ lat, lng }, vel, leadMs);
    return { lat: target.lat, lng: target.lng, heading: heading ?? null };
  }

  return { onFix, reset };
}
