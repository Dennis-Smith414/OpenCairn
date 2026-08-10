// Kalman-filter based location estimator — an alternative to the dead-reckoning
// approach in locationSmoothing.ts, prototyped for side-by-side comparison via
// MapLibreMap.tsx's DOT_MODE switch. DISPLAY ONLY — never feeds the recorded
// track; same contract as locationSmoothing.ts.
//
// Unlike the dead-reckoning smoother, this weighs each GPS fix by its reported
// accuracy: a tight fix is trusted more, a wide/uncertain one (e.g. under tree
// canopy) is mostly ignored in favor of the constant-velocity motion model's
// prediction. State is tracked in local meters (not lat/lng degrees) since
// `accuracy` is already in meters and process noise is a physically-tunable
// m/s^2 quantity a human can reason about while tuning.
//
// Implementation note: the per-axis process/measurement noise here is
// isotropic and uncorrelated between axes (accuracy is a single radius, not
// an ellipse), so a full 4-state [x,y,vx,vy] Kalman filter is exactly
// equivalent to two independent 2-state (position, velocity) filters, one
// per axis. That's what's implemented below — closed-form 2x2 math, no
// general matrix inverse needed.
//
// The velocity this estimator exposes (for useSmoothedLocation.ts's
// continuous extrapolation between fixes — see that file) does NOT use this
// filter's own velocity state. That was tried first and was too slow to feel
// responsive: the Kalman velocity estimate takes several fixes of gain
// buildup to trust real motion (that's what made the earlier stationary-
// jitter fix work), which made the dot visibly lag behind real walking.
// Instead this reuses locationSmoothing.ts's createRawVelocityTracker() —
// the same fast, already-proven velocity estimate dead-reckoning uses —
// while still using THIS filter's accuracy-weighted position as the anchor.
// That split keeps Kalman's actual advantage (outlier/degraded-GPS
// robustness in the anchor) without inheriting its slow-converging velocity
// state's lag in what's used to predict between fixes.
import { createRawVelocityTracker } from "./locationSmoothing";
import type { Velocity } from "./locationSmoothing";

const EARTH_RADIUS_M = 6371000;

// Process noise: how much unmodeled acceleration (m/s^2) we expect between
// fixes (starts, stops, turns). Raise toward 1.0-1.5 if the filter feels
// laggy on transitions; lower toward 0.2-0.3 if it jitters during steady
// walking despite good-accuracy fixes.
const PROCESS_NOISE_ACCEL = 0.5;

// Measurement noise floor/ceiling (meters), applied to reported GPS accuracy.
// Floor: without it, a rare near-zero accuracy glitch (some Android HAL
// stacks do this) drives the filter to fully trust a single fix — exactly
// the failure mode accuracy-weighting exists to avoid. Ceiling: keeps
// recovery responsive once accuracy improves after a bad stretch, rather
// than staying mushy from an uncertainty that grew unbounded during it.
const ACCURACY_FLOOR_M = 3;
const ACCURACY_CEIL_M = 100;

// Same fallback value as offRoute.ts's ASSUMED_ACCURACY_M — reuse the one
// constant this codebase already picked for "fix with no reported accuracy."
const ASSUMED_ACCURACY_M = 15;

// Starting uncertainty for velocity (m/s)^2 at the very first fix. Scoped to
// hiking speeds (~2 m/s std dev), not "no idea" (a vehicle-speed variance like
// 100 was tried first and was a bug: it makes kVel — the update's velocity
// gain — large for the first several fixes, so a single few-meter GPS jitter
// gets read as a genuine ~1 m/s velocity that leaks into `pos` via covPosVel).
// This no longer affects the DISPLAY lead at all (see the raw-velocity-tracker
// note up top) but still matters for how quickly the internal position
// estimate's own gain settles down.
const INITIAL_VEL_VARIANCE = 4;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export interface Axis1D {
  pos: number; // meters, local frame
  vel: number; // meters/sec
  varPos: number;
  varVel: number;
  covPosVel: number;
}

/** Propagate one axis forward by dt seconds under the constant-velocity
 *  model, growing uncertainty via discretized white-noise-acceleration. */
export function predict1d(a: Axis1D, dt: number): Axis1D {
  const pos = a.pos + a.vel * dt;
  const vel = a.vel;
  const q = PROCESS_NOISE_ACCEL * PROCESS_NOISE_ACCEL;
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt3 * dt;
  const varPos = a.varPos + 2 * dt * a.covPosVel + dt2 * a.varVel + (q * dt4) / 4;
  const covPosVel = a.covPosVel + dt * a.varVel + (q * dt3) / 2;
  const varVel = a.varVel + q * dt2;
  return { pos, vel, varPos, varVel, covPosVel };
}

/** Correct one axis's prediction against a position measurement. */
export function update1d(a: Axis1D, measurement: number, measurementVar: number): Axis1D {
  const s = a.varPos + measurementVar; // innovation covariance (H = [1, 0])
  const kPos = a.varPos / s;
  const kVel = a.covPosVel / s;
  const innovation = measurement - a.pos;
  const pos = a.pos + kPos * innovation;
  const vel = a.vel + kVel * innovation;
  const varPos = (1 - kPos) * a.varPos;
  const covPosVel = (1 - kPos) * a.covPosVel;
  const varVel = a.varVel - kVel * a.covPosVel;
  return { pos, vel, varPos, varVel, covPosVel };
}

/** Equirectangular projection into a fixed local-meter frame. The reference
 *  point is picked ONCE (at the first fix) and never recomputed — rescaling
 *  a persistent velocity estimate by a drifting cos(latRef) would look like
 *  false acceleration to the filter. (geoProgress.ts recomputes its
 *  reference per-call instead, which is correct there since it has no
 *  persistent velocity state to corrupt — different tradeoff, same trick.) */
export function toLocalMeters(lat: number, lng: number, refLat: number, refLng: number) {
  const latRad = (refLat * Math.PI) / 180;
  const x = (lng - refLng) * (Math.PI / 180) * EARTH_RADIUS_M * Math.cos(latRad);
  const y = (lat - refLat) * (Math.PI / 180) * EARTH_RADIUS_M;
  return { x, y };
}

export function fromLocalMeters(x: number, y: number, refLat: number, refLng: number) {
  const latRad = (refLat * Math.PI) / 180;
  const lng = refLng + (x / (EARTH_RADIUS_M * Math.cos(latRad))) * (180 / Math.PI);
  const lat = refLat + (y / EARTH_RADIUS_M) * (180 / Math.PI);
  return { lat, lng };
}

export interface EstimatorResult {
  // The CORRECTED anchor position only — never lead/forward-projected.
  // useSmoothedLocation.ts owns all forward-projection, extrapolating
  // continuously from this anchor + `velocity` using real elapsed time every
  // animation frame, rather than this estimator projecting a one-shot lead
  // target itself.
  lat: number;
  lng: number;
  heading: number | null;
  // Degrees/ms. Used for that continuous extrapolation AND as the dot's
  // live heading (via headingFromVelocity in locationSmoothing.ts) — both
  // recomputed every frame from this one value, not just at fix time.
  velocity: Velocity;
}

/** Shape both the dead-reckoning smoother and this Kalman filter satisfy, so
 *  useSmoothedLocation can be fed either one interchangeably without any
 *  branching on which is active. */
export interface LocationEstimator {
  onFix(
    lat: number,
    lng: number,
    heading: number | null | undefined,
    accuracy: number | null | undefined,
    ts: number,
  ): EstimatorResult;
  reset(): void;
}

export function createKalmanEstimator(): LocationEstimator {
  let refLat: number | null = null;
  let refLng: number | null = null;
  let x: Axis1D | null = null;
  let y: Axis1D | null = null;
  let lastTs: number | null = null;
  let lastHeading: number | null = null;
  const velTracker = createRawVelocityTracker();

  function reset() {
    refLat = null;
    refLng = null;
    x = null;
    y = null;
    lastTs = null;
    lastHeading = null;
    velTracker.reset();
  }

  function onFix(
    lat: number,
    lng: number,
    heading: number | null | undefined,
    accuracy: number | null | undefined,
    ts: number,
  ): EstimatorResult {
    const measurementVar = clamp(accuracy ?? ASSUMED_ACCURACY_M, ACCURACY_FLOOR_M, ACCURACY_CEIL_M) ** 2;
    if (heading !== null && heading !== undefined && !Number.isNaN(heading)) {
      lastHeading = ((heading % 360) + 360) % 360;
    }

    if (refLat === null || refLng === null || x === null || y === null || lastTs === null) {
      // First fix: pick the local-meter reference point once, initialize at the origin.
      refLat = lat;
      refLng = lng;
      x = { pos: 0, vel: 0, varPos: measurementVar, varVel: INITIAL_VEL_VARIANCE, covPosVel: 0 };
      y = { pos: 0, vel: 0, varPos: measurementVar, varVel: INITIAL_VEL_VARIANCE, covPosVel: 0 };
      lastTs = ts;
      const initialVel = velTracker.update(lat, lng, ts);
      return { lat, lng, heading: lastHeading, velocity: initialVel };
    }

    const dt = Math.max(0, (ts - lastTs) / 1000); // seconds
    lastTs = ts;

    const meas = toLocalMeters(lat, lng, refLat, refLng);
    x = update1d(predict1d(x, dt), meas.x, measurementVar);
    y = update1d(predict1d(y, dt), meas.y, measurementVar);

    // Anchor = this filter's accuracy-weighted position, returned AS-IS (no
    // forward-projection — useSmoothedLocation.ts does that continuously,
    // every frame). Velocity = the fast raw-velocity tracker's estimate, not
    // x.vel/y.vel — see the file header for why.
    const anchor = fromLocalMeters(x.pos, y.pos, refLat, refLng);
    const vel = velTracker.update(lat, lng, ts);

    return { lat: anchor.lat, lng: anchor.lng, heading: lastHeading, velocity: vel };
  }

  return { onFix, reset };
}
