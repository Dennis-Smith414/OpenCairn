// Drives a location dot via CONTINUOUS PREDICTION, not discrete lerping
// between fix-snapshotted targets.
//
// Feed it raw fixes via pushFix(); read `smoothed` for the value to draw. On
// every animation frame, the displayed position is extrapolated forward from
// the last CORRECTED anchor (an estimator's onFix() result — see
// kalmanLocation.ts / locationSmoothing.ts's createDeadReckoningEstimator)
// using its velocity and REAL elapsed wall-clock time, uncapped by any
// fix-gap-derived duration. This is the point of using an estimator at all:
// predict continuously so the raw GPS update cadence is hidden, rather than
// reactively smoothing after each fix lands. Heading is likewise
// `headingFromVelocity(currentVelocity)`, recomputed every frame from the
// live estimate — never interpolated between two fix-snapshotted course
// values, so it's exactly as live as position.
//
// An earlier version of this hook worked the opposite way: lerp toward a
// lead-projected target over a bounded duration tied to the fix gap, then
// "coast" as a separate fallback mode once that lerp finished early. Two
// structurally different modes — each computing heading differently — with
// a hard boundary between them is exactly the kind of construction that
// produces a visible discontinuity right at that boundary, which is what
// got reported as jumping/skipping. This version has ONE motion model,
// always active, no boundary to jump across.
//
// When a new fix arrives, its corrected position will usually differ
// slightly from wherever the continuous extrapolation currently sits (GPS/
// estimator noise) — RECONCILE_MS hides that residual as a short, decaying
// offset layered on top of the (never-interrupted) extrapolation, rather
// than re-targeting a fresh lerp leg. A LARGE discrepancy (GPS reacquisition
// after an outage, the first fix after re-enabling) snaps instead: sliding
// tens of meters over RECONCILE_MS would look like teleporting sideways,
// which is worse than an honest cut.
//
// DISPLAY ONLY. Callers must still record the raw fixes separately — nothing
// recorded should come from here.
//
// IMPORTANT: pushFix and tick are IDENTITY-STABLE (empty/stable deps, all state
// via refs). An earlier version depended on the `smoothed` state, so pushFix got
// a new identity every animation frame; a caller wiring pushFix into a useEffect
// then re-fired ~60x/sec, resetting the glide and melting the UI. Keep them
// ref-based.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  progress,
  extrapolate,
  headingFromVelocity,
  approxDistanceMeters,
  reconcileDamp,
  createDeadReckoningEstimator,
  LatLngPoint,
  Velocity,
} from "../utils/locationSmoothing";
import { LocationEstimator } from "../utils/kalmanLocation";

export interface SmoothedLocation {
  lat: number;
  lng: number;
  heading: number; // degrees [0,360); last known when velocity has no direction
}

// The last corrected fix: anchor position + the velocity extrapolated
// forward from it, continuously, until the next one arrives.
interface Anchor extends LatLngPoint {
  ts: number; // wall-clock ms this anchor was produced
  vel: Velocity;
}

// A decaying position offset hiding a fix's discrepancy from the display's
// current (extrapolated) position. Added on TOP of extrapolation, not a
// separate motion phase — see file header.
interface Reconcile {
  errLat: number;
  errLng: number;
  startTs: number;
}

// Bounds how far a GPS outage (or an unusually long fix gap) can march the
// dot on stale velocity before it freezes in place absent a new fix. Applies
// to ALL extrapolation now — there's no separate "coast phase" to gate it
// behind, extrapolation is simply always running.
const MAX_EXTRAPOLATION_MS = 4000;
// Below this speed (degrees/ms, ~0.1 m/s) treat the dot as stationary and go
// idle rather than keep scheduling frames that would redraw the same point —
// preserves "no idle drain" while actually standing still.
const MIN_EXTRAPOLATION_SPEED = 9e-10;

// Fixed, deliberately NOT tied to the fix gap — that coupling (glide
// duration = however long since the last fix) was the old design's core
// bug: a slow/irregular gap meant a slow/irregular glide. A reconciliation
// is just hiding estimator noise, not traveling real distance, so it should
// always take the same short time regardless of how long since the last fix.
// 200ms is long enough that a several-meter residual blends in without a
// visible pop, short enough to read as instantaneous against the ~1-2s
// real-world fix cadence.
const RECONCILE_MS = 200;
// Beyond this, a fix's discrepancy from the current display reads as a
// genuine reacquisition (outage/tunnel recovery, re-enabling, a caller
// resetting the estimator) rather than ordinary noise — sliding that far in
// RECONCILE_MS would look like teleporting sideways. Snap instead.
const RECONCILE_SNAP_THRESHOLD_M = 50;

// Snap the display point onto the route line when the raw fix is already
// close enough that the offset is fully explained by GPS error. `blend` is
// how far to pull toward `point` (usually 1 - offRouteFactor from offRoute.ts,
// so it fades to 0 exactly as the dot would start turning amber) — this MUST
// go to 0 once genuinely off-route. Snapping unconditionally would hide from
// a lost user that they've left the trail; see offRoute.ts's file header.
export type SnapToRoute = (
  lat: number,
  lng: number,
  accuracy: number | null | undefined,
) => { lat: number; lng: number; blend: number };

export function useSmoothedLocation(
  enabled: boolean,
  estimator?: LocationEstimator | null,
  snapToRoute?: SnapToRoute | null,
) {
  const [smoothed, setSmoothed] = useState<SmoothedLocation | null>(null);
  const currentRef = useRef<SmoothedLocation | null>(null); // latest displayed value
  const anchorRef = useRef<Anchor | null>(null);
  const reconcileRef = useRef<Reconcile | null>(null);
  // Fallback heading when velocity is too small to imply a direction (near-
  // stationary) — the last course an estimator actually reported, not
  // inferred from a near-zero velocity vector.
  const lastKnownHeadingRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const enabledRef = useRef<boolean>(enabled);
  // Fallback used whenever no `estimator` prop is passed — same dead-reckoning
  // behavior this hook always had, just expressed as a LocationEstimator so it
  // can be swapped for kalmanLocation.ts's estimator without branching here.
  const defaultEstimatorRef = useRef<LocationEstimator>(createDeadReckoningEstimator());
  // Refs, not the raw props — pushFix must stay identity-stable (see file header).
  const estimatorRef = useRef<LocationEstimator | null | undefined>(estimator);
  const snapRef = useRef<SnapToRoute | null | undefined>(snapToRoute);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled && rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    estimatorRef.current = estimator;
  }, [estimator]);

  useEffect(() => {
    snapRef.current = snapToRoute;
  }, [snapToRoute]);

  // Stable: reads only refs.
  const tick = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      rafRef.current = null;
      return;
    }
    const now = Date.now();
    const elapsedMs = Math.min(now - anchor.ts, MAX_EXTRAPOLATION_MS);
    const moving = Math.hypot(anchor.vel.vlat, anchor.vel.vlng) > MIN_EXTRAPOLATION_SPEED;
    const predicted: LatLngPoint = moving
      ? extrapolate(anchor, anchor.vel, elapsedMs)
      : { lat: anchor.lat, lng: anchor.lng };

    let point = predicted;
    let reconciling = false;
    const rec = reconcileRef.current;
    if (rec) {
      const t = progress(rec.startTs, rec.startTs + RECONCILE_MS, now);
      if (t >= 1) {
        reconcileRef.current = null;
      } else {
        const damp = reconcileDamp(t);
        point = { lat: predicted.lat + rec.errLat * damp, lng: predicted.lng + rec.errLng * damp };
        reconciling = true;
      }
    }

    // Live every frame, from the current velocity — not interpolated between
    // two fix-snapshotted course values. Falls back to the last known
    // platform-reported course only while too close to stationary to imply
    // a direction (see file header).
    const heading = headingFromVelocity(anchor.vel, point.lat) ?? lastKnownHeadingRef.current;

    const next: SmoothedLocation = { lat: point.lat, lng: point.lng, heading };
    currentRef.current = next;
    setSmoothed(next);

    const stillExtrapolating = moving && now - anchor.ts < MAX_EXTRAPOLATION_MS;
    if (reconciling || stillExtrapolating) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null; // truly stopped and settled; idle until the next fix
    }
  }, []);

  // Stable: tick is stable and everything else is a ref.
  const pushFix = useCallback(
    (
      lat: number,
      lng: number,
      heading: number | null | undefined,
      accuracy?: number | null,
    ) => {
      if (!enabledRef.current) return;
      const now = Date.now();

      // The corrected anchor + velocity — never lead-projected by the
      // estimator itself; this file owns all forward-projection, continuously.
      const activeEstimator = estimatorRef.current ?? defaultEstimatorRef.current;
      const result = activeEstimator.onFix(lat, lng, heading, accuracy, now);
      const vel = result.velocity;
      let anchorPoint: LatLngPoint = { lat: result.lat, lng: result.lng };

      // Bind to the route line ONLY as far as the fix already reads as
      // on-route (blend fades to 0 exactly where the dot would start amber),
      // so an actually-off-route position is never hidden — see SnapToRoute.
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
      }

      // Hide the discrepancy between where the display currently sits
      // (possibly mid-extrapolation, possibly mid an earlier reconciliation
      // — currentRef already reflects either) and the new anchor as a short
      // decaying offset, UNLESS it's large enough to read as a genuine
      // reacquisition rather than ordinary noise, in which case snap.
      const prevAnchor = anchorRef.current;
      const prevDisplayed: LatLngPoint | null =
        currentRef.current ?? (prevAnchor ? { lat: prevAnchor.lat, lng: prevAnchor.lng } : null);

      if (prevDisplayed) {
        const errLat = prevDisplayed.lat - anchorPoint.lat;
        const errLng = prevDisplayed.lng - anchorPoint.lng;
        const errM = approxDistanceMeters(errLat, errLng, anchorPoint.lat);
        reconcileRef.current =
          errM > RECONCILE_SNAP_THRESHOLD_M ? null : { errLat, errLng, startTs: now };
      } else {
        reconcileRef.current = null; // first-ever fix — nothing to reconcile from
      }

      anchorRef.current = { lat: anchorPoint.lat, lng: anchorPoint.lng, ts: now, vel };

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
