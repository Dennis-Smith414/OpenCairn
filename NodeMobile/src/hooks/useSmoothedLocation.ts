// Drives a location dot that GLIDES between GPS fixes instead of snapping, and
// leads slightly so it tracks you in real time instead of trailing.
//
// Feed it raw fixes via pushFix(); read `smoothed` for the value to draw. By
// default (no estimator passed), each fix measures your velocity and aims the
// glide at where you're ABOUT to be (dead reckoning) — see locationSmoothing.ts.
// Pass a `LocationEstimator` (e.g. createKalmanEstimator() from
// kalmanLocation.ts) to swap in a different target-position estimator without
// touching this file's RAF/glide loop at all; the two are prototyped
// side-by-side via MapLibreMap.tsx's DOT_MODE switch. Either way, the result
// glides from wherever it's currently displayed to the estimated target,
// linearly, over the measured fix gap, on a requestAnimationFrame loop.
//
// Once caught up to that target, the loop does NOT go idle and wait for the
// next fix — freezing there reads as "stalled" between GPS updates, which is
// most of the time at typical fix rates. Instead it keeps COASTING forward at
// the estimator's last known velocity (see EstimatorResult.velocity), capped
// at MAX_COAST_MS so a GPS outage can't march the dot off indefinitely on
// stale speed. The loop only truly goes idle once that velocity is ~zero
// (STILL_EPS-gated in the estimators) — no idle drain while actually stopped.
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
  lerpHeading,
  lerpPoint,
  progress,
  extrapolate,
  createDeadReckoningEstimator,
  LatLngPoint,
  Velocity,
} from "../utils/locationSmoothing";
import { LocationEstimator } from "../utils/kalmanLocation";

export interface SmoothedLocation {
  lat: number;
  lng: number;
  heading: number; // degrees [0,360); carried forward when a fix lacks a course
}

interface Endpoint extends SmoothedLocation {
  ts: number; // wall-clock ms bounding this animation leg
}

// The dot glides across the measured gap between fixes, so motion is continuous
// (no pause-then-jump). Clamped: a GPS stall shouldn't cause a multi-second
// crawl, and a burst shouldn't divide by ~0. MAX_MS lower than the ~1000ms
// fixes normally arrive at (MapScreen.tsx requests interval: 1000) on purpose:
// each glide leg reaches its lead target with room to spare before the next
// fix, then coasts the rest of the way — arriving-with-time-to-spare reads as
// "already moving" rather than "still easing in" when the next fix lands.
const MIN_MS = 300;
const MAX_MS = 900;
const DEFAULT_MS = 1000;

// Plain interpolation glides toward where you WERE at the last fix, so it always
// trails by ~one fix interval (the "rubber-band lag"). Instead we lead: aim the
// glide at where the active estimator thinks you're ABOUT to be. LEAD_FACTOR is
// how far ahead, as a fraction of the fix gap.
//   1.0 → target where you'll be a full gap from now (kills lag, but overshoots
//         a step when you suddenly stop).
//   0.0 → no lead (the old trailing behaviour).
// 0.92 tracks tighter than the original 0.85 for a livelier feel; stop-overshoot
// stays bounded since each estimator zeroes velocity almost immediately on a
// real stop (STILL_EPS in locationSmoothing.ts's raw-velocity tracker, shared
// by both estimators — see kalmanLocation.ts), which caps how large a
// lead-projected overshoot LEAD_FACTOR can produce independent of its value.
const LEAD_FACTOR = 0.92;

// How long to keep coasting forward, past the lead target, at the last known
// velocity before freezing in place absent a new fix. Bounds how far a GPS
// outage (or an unusually long fix gap) can march the dot on stale speed.
const MAX_COAST_MS = 4000;
// Below this speed (degrees/ms, ~0.1 m/s) treat coasting as stopped and go
// idle rather than keep scheduling frames that would draw the same point —
// preserves the "no idle drain" property while actually standing still.
const MIN_COAST_SPEED = 9e-10;

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
  const fromRef = useRef<Endpoint | null>(null);
  const toRef = useRef<Endpoint | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFixWallRef = useRef<number>(0);
  const enabledRef = useRef<boolean>(enabled);
  // Last known velocity (degrees/ms) from the active estimator's result, used
  // to keep coasting past the lead target between fixes — see file header.
  const velRef = useRef<Velocity>({ vlat: 0, vlng: 0 });
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
    const from = fromRef.current;
    const to = toRef.current;
    if (!from || !to) {
      rafRef.current = null;
      return;
    }
    const now = Date.now();
    const t = progress(from.ts, to.ts, now);

    let point: LatLngPoint;
    let heading: number;
    let keepAnimating: boolean;

    if (t < 1) {
      point = lerpPoint(from, to, t);
      heading = lerpHeading(from.heading, to.heading, t);
      keepAnimating = true;
    } else {
      // Caught up to the lead target — coast forward at the last known
      // velocity instead of freezing until the next fix (see file header).
      const overMs = Math.min(now - to.ts, MAX_COAST_MS);
      const vel = velRef.current;
      const moving = Math.hypot(vel.vlat, vel.vlng) > MIN_COAST_SPEED;
      point = moving ? extrapolate(to, vel, overMs) : to;
      heading = to.heading;
      keepAnimating = moving && now - to.ts < MAX_COAST_MS;
    }

    const next: SmoothedLocation = { lat: point.lat, lng: point.lng, heading };
    currentRef.current = next;
    setSmoothed(next);

    if (keepAnimating) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null; // truly stopped; idle until the next fix
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
      // Glide over the measured gap since the last fix, clamped.
      const gap = lastFixWallRef.current ? now - lastFixWallRef.current : DEFAULT_MS;
      lastFixWallRef.current = now;
      const dur = Math.min(MAX_MS, Math.max(MIN_MS, gap));
      const leadMs = dur * LEAD_FACTOR;

      // Either the passed-in estimator (e.g. Kalman) or the default
      // dead-reckoning one — both do their own velocity tracking and their
      // own lead-projection using that estimate; this file's RAF/glide loop
      // is untouched either way.
      const activeEstimator = estimatorRef.current ?? defaultEstimatorRef.current;
      const result = activeEstimator.onFix(lat, lng, heading, accuracy, now, leadMs);
      velRef.current = result.velocity;
      let target = { lat: result.lat, lng: result.lng };
      const rawHeading = result.heading;

      // Bind to the route line ONLY as far as the fix already reads as
      // on-route (blend fades to 0 exactly where the dot would start amber),
      // so an actually-off-route position is never hidden — see SnapToRoute.
      const snap = snapRef.current;
      if (snap) {
        const snapped = snap(target.lat, target.lng, accuracy);
        if (snapped.blend > 0) {
          target = {
            lat: target.lat + (snapped.lat - target.lat) * snapped.blend,
            lng: target.lng + (snapped.lng - target.lng) * snapped.blend,
          };
        }
      }

      // Start the new leg from wherever the dot is right now, so no teleport.
      const startPoint: SmoothedLocation =
        currentRef.current ?? toRef.current ?? { lat, lng, heading: heading ?? 0 };

      // Missing/invalid course (GPS reports none when stationary): keep prior heading.
      const newHeading =
        rawHeading === null || rawHeading === undefined || Number.isNaN(rawHeading)
          ? startPoint.heading
          : ((rawHeading % 360) + 360) % 360;

      fromRef.current = { ...startPoint, ts: now };
      toRef.current = { lat: target.lat, lng: target.lng, heading: newHeading, ts: now + dur };

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
