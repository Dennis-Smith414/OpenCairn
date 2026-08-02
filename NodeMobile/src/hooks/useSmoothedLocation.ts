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
// linearly, over the measured fix gap, on a requestAnimationFrame loop. It
// stops the loop once caught up (no idle drain).
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
  createDeadReckoningEstimator,
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
// crawl, and a burst shouldn't divide by ~0.
const MIN_MS = 300;
const MAX_MS = 1500;
const DEFAULT_MS = 1000;

// Plain interpolation glides toward where you WERE at the last fix, so it always
// trails by ~one fix interval (the "rubber-band lag"). Instead we lead: aim the
// glide at where the active estimator thinks you're ABOUT to be. LEAD_FACTOR is
// how far ahead, as a fraction of the fix gap.
//   1.0 → target where you'll be a full gap from now (kills lag, but overshoots
//         a step when you suddenly stop).
//   0.0 → no lead (the old trailing behaviour).
// 0.85 tracks tight while keeping stop-overshoot small; each estimator's own
// velocity smoothing tames the rest (see locationSmoothing.ts / kalmanLocation.ts).
const LEAD_FACTOR = 0.85;

export function useSmoothedLocation(enabled: boolean, estimator?: LocationEstimator | null) {
  const [smoothed, setSmoothed] = useState<SmoothedLocation | null>(null);
  const currentRef = useRef<SmoothedLocation | null>(null); // latest displayed value
  const fromRef = useRef<Endpoint | null>(null);
  const toRef = useRef<Endpoint | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFixWallRef = useRef<number>(0);
  const enabledRef = useRef<boolean>(enabled);
  // Fallback used whenever no `estimator` prop is passed — same dead-reckoning
  // behavior this hook always had, just expressed as a LocationEstimator so it
  // can be swapped for kalmanLocation.ts's estimator without branching here.
  const defaultEstimatorRef = useRef<LocationEstimator>(createDeadReckoningEstimator());
  // Ref, not the raw prop — pushFix must stay identity-stable (see file header).
  const estimatorRef = useRef<LocationEstimator | null | undefined>(estimator);

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
    const p = lerpPoint(from, to, t);
    const next: SmoothedLocation = {
      lat: p.lat,
      lng: p.lng,
      heading: lerpHeading(from.heading, to.heading, t),
    };
    currentRef.current = next;
    setSmoothed(next);
    if (t < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null; // caught up; idle until the next fix
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
      const target = { lat: result.lat, lng: result.lng };
      const rawHeading = result.heading;

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
