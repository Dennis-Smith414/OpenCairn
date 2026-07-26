// Drives a location dot that GLIDES between GPS fixes instead of snapping, and
// leads slightly so it tracks you in real time instead of trailing.
//
// Feed it raw fixes via pushFix(); read `smoothed` for the value to draw. Each
// fix, it measures your velocity and aims the glide at where you're ABOUT to be
// (dead reckoning), then linearly interpolates from the currently-displayed
// position to that predicted point over the measured fix gap, on a
// requestAnimationFrame loop. It stops the loop once caught up (no idle drain).
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
  velocity,
  extrapolate,
  Velocity,
} from "../utils/locationSmoothing";

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
// trails by ~one fix interval (the "rubber-band lag"). Instead we dead-reckon:
// measure velocity from consecutive fixes and aim the glide at where you're
// ABOUT to be. LEAD_FACTOR is how far ahead, as a fraction of the fix gap.
//   1.0 → target where you'll be a full gap from now (kills lag, but overshoots
//         a step when you suddenly stop).
//   0.0 → no lead (the old trailing behaviour).
// 0.85 tracks tight while keeping stop-overshoot small; velocity smoothing and
// the stillness deadband below tame the rest.
const LEAD_FACTOR = 0.85;
const VEL_SMOOTH = 0.5; // blend new velocity with previous (0..1); damps GPS noise
// Below this per-fix displacement (~1.1m in degrees) we treat you as stationary
// and drop the lead to zero, so the dot doesn't drift while you stand still.
const STILL_EPS = 1e-5;

export function useSmoothedLocation(enabled: boolean) {
  const [smoothed, setSmoothed] = useState<SmoothedLocation | null>(null);
  const currentRef = useRef<SmoothedLocation | null>(null); // latest displayed value
  const fromRef = useRef<Endpoint | null>(null);
  const toRef = useRef<Endpoint | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFixWallRef = useRef<number>(0);
  const enabledRef = useRef<boolean>(enabled);
  const prevFixRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  const velRef = useRef<Velocity>({ vlat: 0, vlng: 0 });

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled && rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [enabled]);

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
    (lat: number, lng: number, heading: number | null | undefined) => {
      if (!enabledRef.current) return;
      const now = Date.now();
      // Glide over the measured gap since the last fix, clamped.
      const gap = lastFixWallRef.current ? now - lastFixWallRef.current : DEFAULT_MS;
      lastFixWallRef.current = now;
      const dur = Math.min(MAX_MS, Math.max(MIN_MS, gap));

      // Estimate velocity from the previous fix, damped and with a stillness
      // deadband so standing still (or GPS jitter) doesn't push the dot around.
      const prev = prevFixRef.current;
      if (prev) {
        const moved = Math.hypot(lat - prev.lat, lng - prev.lng);
        const raw =
          moved < STILL_EPS
            ? { vlat: 0, vlng: 0 }
            : velocity(prev, prev.ts, { lat, lng }, now);
        velRef.current = {
          vlat: VEL_SMOOTH * raw.vlat + (1 - VEL_SMOOTH) * velRef.current.vlat,
          vlng: VEL_SMOOTH * raw.vlng + (1 - VEL_SMOOTH) * velRef.current.vlng,
        };
      }
      prevFixRef.current = { lat, lng, ts: now };

      // Aim the glide AHEAD of the raw fix: where you'll be ~LEAD_FACTOR*gap from
      // now. The dot arrives there just as the next fix lands, so it tracks you
      // in real time instead of trailing by a fix interval.
      const target = extrapolate({ lat, lng }, velRef.current, dur * LEAD_FACTOR);

      // Start the new leg from wherever the dot is right now, so no teleport.
      const startPoint: SmoothedLocation =
        currentRef.current ?? toRef.current ?? { lat, lng, heading: heading ?? 0 };

      // Missing/invalid course (GPS reports none when stationary): keep prior heading.
      const newHeading =
        heading === null || heading === undefined || Number.isNaN(heading)
          ? startPoint.heading
          : ((heading % 360) + 360) % 360;

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
