// Pure math helpers for the DISPLAYED location dot.
//
// These smooth ONLY what's drawn on screen. The recorded track is written from
// the raw fixes elsewhere and must never pass through here — see MapScreen /
// TripTracker.
//
// useSmoothedLocation.ts drives the dot via CONTINUOUS EXTRAPOLATION from the
// last corrected fix + a live velocity estimate (real elapsed wall-clock time,
// every frame) rather than discrete lerping between two fix-snapshotted
// targets — the point of that design is to predict continuously and hide the
// raw GPS update cadence, not just smooth reactively after each fix. This
// file's `extrapolate`/`headingFromVelocity`/`approxDistanceMeters`/
// `reconcileDamp` are the primitives that model supports.
//
// createDeadReckoningEstimator() below is the default LocationEstimator
// consumed by useSmoothedLocation.ts when no alternate estimator (e.g.
// kalmanLocation.ts's createKalmanEstimator()) is passed in. Type-only import
// to avoid coupling this file to the Kalman module at runtime.
import type { LocationEstimator, EstimatorResult } from "./kalmanLocation";

export interface LatLngPoint {
  lat: number;
  lng: number;
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
  if (!isUsableDt(bTs - aTs)) return { vlat: 0, vlng: 0 };
  const dt = bTs - aTs;
  return { vlat: (b.lat - a.lat) / dt, vlng: (b.lng - a.lng) / dt };
}

// Longest gap still treated as continuous motion. Past this two fixes say
// nothing about the speed between them (outage, app resumed from background).
const MAX_VELOCITY_DT_MS = 5000;

/**
 * Whether a delta between two fixes can yield a meaningful velocity. Its own
 * predicate because callers must distinguish "this pair tells us nothing" from
 * "the user is stationary" — velocity() returns zero for both.
 */
export function isUsableDt(dt: number): boolean {
  return Number.isFinite(dt) && dt > 0 && dt <= MAX_VELOCITY_DT_MS;
}

/** Project a point forward along a velocity over `ms` — the core of continuous
 *  extrapolation (see file header): called every animation frame with real
 *  elapsed wall-clock time, not a one-shot "lead" applied once per fix. */
export function extrapolate(p: LatLngPoint, v: Velocity, ms: number): LatLngPoint {
  return { lat: p.lat + v.vlat * ms, lng: p.lng + v.vlng * ms };
}

/**
 * Compass bearing (degrees, [0,360), clockwise from north) implied by a
 * velocity vector, or null if it's too small to have a meaningful direction.
 * `atLat` scales the longitude component the same way toLocalMeters-style
 * math elsewhere in this codebase does (1° longitude narrows away from the
 * equator) — without it the bearing would skew with latitude.
 *
 * useSmoothedLocation.ts calls this every frame, unconditionally, as the
 * dot's heading — there's no "wait for the next fix to know which way you're
 * facing" step; heading is a continuous function of the live velocity
 * estimate, same as position. Falls back to the last platform-reported
 * course only when velocity is too small to imply a direction (near-
 * stationary), not when a fix simply hasn't arrived recently.
 */
export function headingFromVelocity(v: Velocity, atLat: number): number | null {
  const east = v.vlng * Math.cos((atLat * Math.PI) / 180);
  const north = v.vlat;
  if (Math.hypot(east, north) < 1e-12) return null;
  const bearing = (Math.atan2(east, north) * 180) / Math.PI;
  return ((bearing % 360) + 360) % 360;
}

/**
 * Velocity implied by a platform-reported ground speed and course. Used to seed
 * the first fix: velocity is normally differenced from two fixes, so without
 * this the dot sits frozen for a whole fix gap every time tracking starts.
 */
export function velocityFromSpeedHeading(
  speedMps: number,
  headingDeg: number,
  atLat: number,
): Velocity {
  const rad = (headingDeg * Math.PI) / 180;
  const north = speedMps * Math.cos(rad); // m/s
  const east = speedMps * Math.sin(rad); // m/s
  const kx = Math.cos((atLat * Math.PI) / 180);
  return {
    vlat: north / M_PER_DEG_LAT / 1000,
    // Longitude degrees shrink by cos(lat); without this the dot would drift
    // east/west at the wrong rate everywhere except the equator.
    vlng: kx === 0 ? 0 : east / (M_PER_DEG_LAT * kx) / 1000,
  };
}

/** Signed shortest turn between two bearings, in (-180, 180]. Bearings wrap, so
 *  easing from 350 to 10 naively spins the arrow the long way round. */
export function shortestArcDeltaDeg(fromDeg: number, toDeg: number): number {
  return (((toDeg - fromDeg) % 360) + 540) % 360 - 180;
}

/** Ease a bearing toward a target over real elapsed time. Time-based rather than
 *  a per-frame fraction, so a dropped frame doesn't silently slow the turn. */
export function approachBearing(
  currentDeg: number,
  targetDeg: number,
  dtMs: number,
  tauMs: number,
): number {
  if (dtMs <= 0 || tauMs <= 0) return currentDeg;
  const k = 1 - Math.exp(-dtMs / tauMs);
  const next = currentDeg + shortestArcDeltaDeg(currentDeg, targetDeg) * k;
  return ((next % 360) + 360) % 360;
}

const M_PER_DEG_LAT = 111195;

/**
 * Approximate straight-line distance in meters between two points a small
 * lat/lng delta apart — same cos(atLat) longitude-scaling convention as
 * headingFromVelocity. For the short displacements this file deals with
 * (a single reconciliation offset), not for distances where great-circle
 * curvature matters (offRoute.ts's haversine usage is for that).
 */
export function approxDistanceMeters(dLat: number, dLng: number, atLat: number): number {
  const north = dLat * M_PER_DEG_LAT;
  const east = dLng * M_PER_DEG_LAT * Math.cos((atLat * Math.PI) / 180);
  return Math.hypot(north, east);
}

/**
 * Eased decay for a short reconciliation blend: 1 at t=0 (the full residual
 * still showing), 0 at t=1 (residual fully hidden). Smoothstep-shaped so the
 * residual's own contribution to displayed velocity is ~0 at both ends of
 * the window — no visible speed bump when a reconciliation starts or ends.
 * t is clamped to [0,1].
 */
export function reconcileDamp(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - tc * tc * (3 - 2 * tc);
}

const VEL_SMOOTH = 0.5; // blend new velocity with previous (0..1); damps GPS noise
// Below this implied ground speed we treat you as stationary, so the dot doesn't
// drift while you stand still. A SPEED, not a displacement: a fixed distance
// threshold only makes sense at a fixed fix rate, and with sparse noisy fixes a
// walker covering real ground can show a tiny displacement by chance and get
// mistaken for stopped. Sits just above useSmoothedLocation's
// MIN_EXTRAPOLATION_SPEED so the two agree on what "stopped" means.
const STILL_SPEED_MPS = 0.15;
const STILL_SPEED_DEG_PER_MS = STILL_SPEED_MPS / M_PER_DEG_LAT / 1000;

/**
 * Measures velocity directly from consecutive raw fixes — damped (VEL_SMOOTH)
 * and deadbanded (STILL_EPS) so GPS noise doesn't register as motion. This
 * converges to real velocity within ~1 fix, unlike a Kalman filter's gain-
 * based estimate which takes several fixes to build confidence. Shared by
 * createDeadReckoningEstimator() below AND kalmanLocation.ts's estimator —
 * Kalman uses its own accuracy-weighted POSITION as the anchor (that's its
 * actual advantage: robust to outliers/degraded GPS) but borrows this same
 * proven, fast-responding velocity for continuous extrapolation between
 * fixes, rather than its own slow-converging internal velocity state.
 */
export function createRawVelocityTracker() {
  let prevFix: LatLngPoint & { ts: number } | null = null;
  let vel: Velocity = { vlat: 0, vlng: 0 };

  function reset() {
    prevFix = null;
    vel = { vlat: 0, vlng: 0 };
  }

  function update(lat: number, lng: number, ts: number): Velocity {
    // An unusable dt is not evidence of standing still and must not be blended
    // in as though it were — at VEL_SMOOTH 0.5 each zero halves the estimate, so
    // a run of bad deltas quietly walks a correct speed down to nothing.
    if (prevFix && isUsableDt(ts - prevFix.ts)) {
      const measured = velocity(prevFix, prevFix.ts, { lat, lng }, ts);
      // Compare metric speed, not raw degree magnitude: longitude degrees shrink
      // by cos(lat), so otherwise the deadband varies with latitude.
      const kx = Math.cos((lat * Math.PI) / 180);
      const speed = Math.hypot(measured.vlat, measured.vlng * kx);
      const raw =
        speed < STILL_SPEED_DEG_PER_MS
          ? { vlat: 0, vlng: 0 } // genuinely stationary — this zero IS meaningful
          : measured;
      vel = {
        vlat: VEL_SMOOTH * raw.vlat + (1 - VEL_SMOOTH) * vel.vlat,
        vlng: VEL_SMOOTH * raw.vlng + (1 - VEL_SMOOTH) * vel.vlng,
      };
    }
    prevFix = { lat, lng, ts };
    return vel;
  }

  return { update, reset };
}

/**
 * The default LocationEstimator: returns the raw fix as its corrected anchor
 * (no positional correction — every fix is trusted equally, unlike
 * kalmanLocation.ts's accuracy-weighted estimator) plus a fast raw-velocity
 * estimate. useSmoothedLocation.ts owns all forward-projection from here —
 * this never lead-projects itself. Heading is passed through unchanged
 * (including null/undefined); the caller handles carrying the prior heading
 * forward when a fix lacks a course.
 */
export function createDeadReckoningEstimator(): LocationEstimator {
  const tracker = createRawVelocityTracker();

  function onFix(
    lat: number,
    lng: number,
    heading: number | null | undefined,
    _accuracy: number | null | undefined,
    ts: number,
  ): EstimatorResult {
    const vel = tracker.update(lat, lng, ts);
    return { lat, lng, heading: heading ?? null, velocity: vel };
  }

  return { onFix, reset: tracker.reset };
}
