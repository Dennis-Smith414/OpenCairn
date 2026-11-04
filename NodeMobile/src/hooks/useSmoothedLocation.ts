// Drives the displayed location dot: extrapolates forward from the last
// corrected fix every animation frame, so the ~1Hz GPS cadence isn't visible.
// A new fix's discrepancy from where the dot has reached is hidden as a short
// decaying offset rather than a jump; a large one snaps instead.
//
// DISPLAY ONLY — callers record the raw fixes separately.
//
// pushFix and tick must stay IDENTITY-STABLE (all state via refs). They once
// depended on `smoothed`, so a caller wiring pushFix into a useEffect re-fired
// it ~60x/sec and melted the UI.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  progress,
  extrapolate,
  headingFromVelocity,
  approxDistanceMeters,
  reconcileDamp,
  approachBearing,
  shortestArcDeltaDeg,
  velocityFromSpeedHeading,
  createDeadReckoningEstimator,
  LatLngPoint,
  Velocity,
} from "../utils/locationSmoothing";
import { LocationEstimator } from "../utils/kalmanLocation";
import { isE2E } from "../utils/isE2E";

export interface SmoothedLocation {
  lat: number;
  lng: number;
  heading: number; // degrees [0,360); last known when velocity has no direction
  // Hide the arrow until this is true: `heading` defaults to 0, and drawing that
  // points a confident arrow due north on no information.
  headingKnown: boolean;
}

interface Anchor extends LatLngPoint {
  ts: number; // wall-clock ms this anchor was produced
  vel: Velocity;
}

interface Reconcile {
  errLat: number;
  errLng: number;
  startTs: number;
  durationMs: number;
}

// Full speed for HOLD, then ramp down to a standstill over EASE. A hard cutoff
// stops the dot dead mid-stride, which reads as a freeze.
//
// Under Detox the coast window collapses so the frame loop idles right after each
// fix; otherwise fixes arriving faster than 9.5s keep it busy forever and Detox
// synchronization never settles. EASE stays >= 1 to keep the ramp division finite.
const EXTRAPOLATION_HOLD_MS = isE2E ? 0 : 5500;
const EXTRAPOLATION_EASE_MS = isE2E ? 1 : 4000;

/** Integral of the velocity ramp above. Saturates at HOLD + EASE/2. */
export function effectiveElapsedMs(ms: number): number {
  const t = ms < 0 ? 0 : ms;
  if (t <= EXTRAPOLATION_HOLD_MS) return t;
  const u = Math.min((t - EXTRAPOLATION_HOLD_MS) / EXTRAPOLATION_EASE_MS, 1);
  // ∫(1 - smoothstep) du = u - u^3 + u^4/2
  return EXTRAPOLATION_HOLD_MS + EXTRAPOLATION_EASE_MS * (u - u * u * u + (u * u * u * u) / 2);
}

const MAX_EXTRAPOLATION_MS = EXTRAPOLATION_HOLD_MS + EXTRAPOLATION_EASE_MS;

// The anchor uses the fix's OWN clock, not arrival: they differ by acquisition
// age plus the native->JS hop, and anchoring at arrival leaves the dot behind.
// Clamped into a window around arrival since a device clock can't be trusted.
const MAX_FIX_AGE_MS = 2000;
// ~0.1 m/s. Below this, stop scheduling frames rather than redraw the same point.
const MIN_EXTRAPOLATION_SPEED = 9e-10;

// Sized by SPEED, not a fixed duration: a flat duration slides a large residual
// across the screen far faster than the user moves, which reads as a jump.
const RECONCILE_MAX_SPEED_MPS = 2.0;
const RECONCILE_MIN_MS = 200;
const RECONCILE_MAX_MS = 2500;

/** How long to spend hiding a residual of `errM` metres. */
export function reconcileDurationMs(errM: number): number {
  const needed = (errM / RECONCILE_MAX_SPEED_MPS) * 1000;
  return Math.min(Math.max(needed, RECONCILE_MIN_MS), RECONCILE_MAX_MS);
}
// Beyond this a discrepancy reads as reacquisition, not noise. Snap instead of
// sliding, which at that distance looks like teleporting sideways.
const RECONCILE_SNAP_THRESHOLD_M = 50;

// ~63% of a turn covered in this long, so a 90-degree bend takes about a second.
const HEADING_SMOOTH_TAU_MS = isE2E ? 20 : 400;

// ~30fps. Not a frame budget — the animation loop still runs at display rate.
// Limits only how often state crosses into React and the native bridge, which at
// 60Hz bogged down the whole JS thread.
const MIN_PUBLISH_INTERVAL_MS = 33;

// `blend` MUST fade to 0 once genuinely off-route — snapping unconditionally
// hides from a lost user that they've left the trail.
export type SnapToRoute = (
  lat: number,
  lng: number,
  accuracy: number | null | undefined,
) => { lat: number; lng: number; blend: number };

/** Once per FIX with the corrected, route-bound position. Anything following the
 *  user along a route must use this, not the raw fix, or it disagrees with the dot. */
export type OnAnchor = (lat: number, lng: number) => void;

export function useSmoothedLocation(
  enabled: boolean,
  estimator?: LocationEstimator | null,
  snapToRoute?: SnapToRoute | null,
  onAnchor?: OnAnchor | null,
  /** Compass bearing; wins over the GPS-derived course. See useCompassHeading. */
  compassHeadingDeg?: number | null,
) {
  const [smoothed, setSmoothed] = useState<SmoothedLocation | null>(null);
  const currentRef = useRef<SmoothedLocation | null>(null); // latest displayed value
  const anchorRef = useRef<Anchor | null>(null);
  const reconcileRef = useRef<Reconcile | null>(null);
  const lastKnownHeadingRef = useRef<number>(0);
  // Sticky, so the arrow holds its bearing instead of blinking out when you stop.
  const headingEverKnownRef = useRef<boolean>(false);
  // The eased on-screen bearing, vs lastKnownHeadingRef's raw target.
  const displayHeadingRef = useRef<number | null>(null);
  const lastTickTsRef = useRef<number | null>(null);
  const lastPublishTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const enabledRef = useRef<boolean>(enabled);
  // Fallback used whenever no `estimator` prop is passed — same dead-reckoning
  // behavior this hook always had, just expressed as a LocationEstimator so it
  // can be swapped for kalmanLocation.ts's estimator without branching here.
  const defaultEstimatorRef = useRef<LocationEstimator>(createDeadReckoningEstimator());
  // Refs, not the raw props — pushFix must stay identity-stable (see file header).
  const estimatorRef = useRef<LocationEstimator | null | undefined>(estimator);
  const snapRef = useRef<SnapToRoute | null | undefined>(snapToRoute);
  const onAnchorRef = useRef<OnAnchor | null | undefined>(onAnchor);
  const compassRef = useRef<number | null | undefined>(compassHeadingDeg);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Drop the frame clock so the first frame after re-enabling doesn't ease
      // the arrow using however long the app happened to be paused.
      lastTickTsRef.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    estimatorRef.current = estimator;
  }, [estimator]);

  useEffect(() => {
    snapRef.current = snapToRoute;
  }, [snapToRoute]);

  useEffect(() => {
    onAnchorRef.current = onAnchor;
  }, [onAnchor]);

  useEffect(() => {
    compassRef.current = compassHeadingDeg;
  }, [compassHeadingDeg]);

  // Stable: reads only refs.
  const tick = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      rafRef.current = null;
      return;
    }
    const now = Date.now();

    // Publishing is rate-limited; the animation loop is not. Returns early
    // without computing or setting state, then reschedules below. Motion is a
    // pure function of wall-clock time, so a skipped publish changes only how
    // often the result is sent onward, never where the dot is.
    const sincePublish =
      lastPublishTsRef.current === null ? Infinity : now - lastPublishTsRef.current;
    if (sincePublish < MIN_PUBLISH_INTERVAL_MS) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    // Real elapsed time, so easing behaves the same whether frames stutter or not.
    const dtMs = lastTickTsRef.current === null ? 0 : Math.max(now - lastTickTsRef.current, 0);
    lastTickTsRef.current = now;
    const rawElapsedMs = Math.max(now - anchor.ts, 0);
    // Eases to a stop rather than stopping dead — see effectiveElapsedMs.
    const elapsedMs = effectiveElapsedMs(rawElapsedMs);
    const moving = Math.hypot(anchor.vel.vlat, anchor.vel.vlng) > MIN_EXTRAPOLATION_SPEED;
    const predicted: LatLngPoint = moving
      ? extrapolate(anchor, anchor.vel, elapsedMs)
      : { lat: anchor.lat, lng: anchor.lng };

    let point = predicted;
    let reconciling = false;
    const rec = reconcileRef.current;
    if (rec) {
      const t = progress(rec.startTs, rec.startTs + rec.durationMs, now);
      if (t >= 1) {
        reconcileRef.current = null;
      } else {
        const damp = reconcileDamp(t);
        point = { lat: predicted.lat + rec.errLat * damp, lng: predicted.lng + rec.errLng * damp };
        reconciling = true;
      }
    }

    const derivedHeading = headingFromVelocity(anchor.vel, point.lat);
    if (derivedHeading !== null) {
      lastKnownHeadingRef.current = derivedHeading;
      headingEverKnownRef.current = true;
    }
    // Compass first: it measures pointing direction directly and doesn't degrade
    // as the walker slows. The GPS-derived value is a course reconstructed from
    // noisy positions.
    const compass = compassRef.current;
    const haveCompass =
      typeof compass === "number" && Number.isFinite(compass);
    if (haveCompass) headingEverKnownRef.current = true;
    const targetHeading = haveCompass
      ? ((compass as number) % 360 + 360) % 360
      : derivedHeading ?? lastKnownHeadingRef.current;
    const displayed = displayHeadingRef.current;
    const heading =
      displayed === null
        ? targetHeading // first frame: adopt it outright, nothing to ease from
        : approachBearing(displayed, targetHeading, dtMs, HEADING_SMOOTH_TAU_MS);
    displayHeadingRef.current = heading;

    const next: SmoothedLocation = {
      lat: point.lat,
      lng: point.lng,
      heading,
      headingKnown: headingEverKnownRef.current,
    };
    currentRef.current = next;
    lastPublishTsRef.current = now;
    setSmoothed(next);

    const stillExtrapolating = moving && rawElapsedMs < MAX_EXTRAPOLATION_MS;
    // Keep painting while the arrow turns, or it finishes the turn as a jump.
    const stillTurning = Math.abs(shortestArcDeltaDeg(heading, targetHeading)) > 0.5;
    if (reconciling || stillExtrapolating || stillTurning) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null; // truly stopped and settled; idle until the next fix
    }
  }, []);

  const pushFix = useCallback(
    (
      lat: number,
      lng: number,
      heading: number | null | undefined,
      accuracy?: number | null,
      fixTs?: number | null,
      speed?: number | null,
    ) => {
      if (!enabledRef.current) return;
      const now = Date.now();

      const anchorTs =
        fixTs != null && Number.isFinite(fixTs)
          ? Math.min(Math.max(fixTs, now - MAX_FIX_AGE_MS), now)
          : now;

      // Not forced monotonic: out-of-order delivery is handled downstream by
      // isUsableDt holding the velocity, rather than by faking a timestamp.
      const fixAge = now - anchorTs;

      // anchorTs rather than `now` so the estimator's dt reflects real GPS
      // spacing, not React scheduling jitter.
      const activeEstimator = estimatorRef.current ?? defaultEstimatorRef.current;
      const result = activeEstimator.onFix(lat, lng, heading, accuracy, anchorTs);

      // Platform speed/course seeds the FIRST fix only, where differencing has
      // nothing yet. Preferring it on every fix made things worse on a real
      // trail — a consumer chip's bearing degrades badly at walking pace.
      const estimatorVel = result.velocity;
      const estimatorMoving =
        Math.hypot(estimatorVel.vlat, estimatorVel.vlng) > MIN_EXTRAPOLATION_SPEED;
      const canSeed =
        anchorRef.current === null &&
        !estimatorMoving &&
        typeof speed === "number" &&
        Number.isFinite(speed) &&
        speed > 0 &&
        heading !== null &&
        heading !== undefined &&
        !Number.isNaN(heading);
      const vel = canSeed
        ? velocityFromSpeedHeading(speed as number, heading as number, lat)
        : estimatorVel;
      let anchorPoint: LatLngPoint = { lat: result.lat, lng: result.lng };

      // Only as far as the fix reads on-route — see SnapToRoute.
      const snap = snapRef.current;
      if (snap) {
        const snapped = snap(anchorPoint.lat, anchorPoint.lng, accuracy);
        if (snapped.blend > 0) {
          anchorPoint = {
            lat: anchorPoint.lat + (snapped.lat - anchorPoint.lat) * snapped.blend,
            lng: anchorPoint.lng + (snapped.lng - anchorPoint.lng) * snapped.blend,
          };
        }
      }

      // Missing/invalid course (GPS reports none when stationary): keep prior heading.
      const rawHeading = result.heading;
      if (rawHeading !== null && rawHeading !== undefined && !Number.isNaN(rawHeading)) {
        lastKnownHeadingRef.current = ((rawHeading % 360) + 360) % 360;
        headingEverKnownRef.current = true;
      }

      const prevAnchor = anchorRef.current;
      const prevDisplayed: LatLngPoint | null =
        currentRef.current ?? (prevAnchor ? { lat: prevAnchor.lat, lng: prevAnchor.lng } : null);

      // Against the anchor projected forward to NOW: it's timestamped fixAge in
      // the past, so measuring against it raw counts real travel as error.
      if (prevDisplayed) {
        const projectedNow =
          fixAge > 0 && Math.hypot(vel.vlat, vel.vlng) > MIN_EXTRAPOLATION_SPEED
            ? extrapolate(anchorPoint, vel, fixAge)
            : anchorPoint;

        const errLat = prevDisplayed.lat - projectedNow.lat;
        const errLng = prevDisplayed.lng - projectedNow.lng;
        const errM = approxDistanceMeters(errLat, errLng, projectedNow.lat);
        reconcileRef.current =
          errM > RECONCILE_SNAP_THRESHOLD_M
            ? null
            : { errLat, errLng, startTs: now, durationMs: reconcileDurationMs(errM) };
      } else {
        reconcileRef.current = null; // first-ever fix — nothing to reconcile from
      }

      anchorRef.current = { lat: anchorPoint.lat, lng: anchorPoint.lng, ts: anchorTs, vel };

      // Last, so a consumer that throws can't leave the anchor unset.
      onAnchorRef.current?.(anchorPoint.lat, anchorPoint.lng);

      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    },
    [tick],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return { smoothed, pushFix };
}
