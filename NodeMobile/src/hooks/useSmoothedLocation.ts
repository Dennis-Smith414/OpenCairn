// Drives a location dot that GLIDES between GPS fixes instead of snapping.
//
// Feed it raw fixes via pushFix(); read `smoothed` for the value to draw. It
// linearly interpolates from the previously displayed position to the newest
// fix over the measured gap between fixes, on a requestAnimationFrame loop, and
// stops the loop once it has caught up (no idle battery drain).
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
import { lerpHeading, lerpPoint, progress } from "../utils/locationSmoothing";

export interface SmoothedLocation {
  lat: number;
  lng: number;
  heading: number; // degrees [0,360); carried forward when a fix lacks a course
}

interface Endpoint extends SmoothedLocation {
  ts: number; // wall-clock ms bounding this animation leg
}

// Clamp the animation window so a stalled GPS (huge gap) doesn't produce a
// 30-second crawl, and a burst of fixes doesn't divide by ~0.
const MIN_MS = 250;
const MAX_MS = 3000;
const DEFAULT_MS = 1000;

export function useSmoothedLocation(enabled: boolean) {
  const [smoothed, setSmoothed] = useState<SmoothedLocation | null>(null);
  const currentRef = useRef<SmoothedLocation | null>(null); // latest displayed value
  const fromRef = useRef<Endpoint | null>(null);
  const toRef = useRef<Endpoint | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFixWallRef = useRef<number>(0);
  const enabledRef = useRef<boolean>(enabled);

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
      // Duration = measured gap since the last fix, clamped to sane bounds.
      const gap = lastFixWallRef.current ? now - lastFixWallRef.current : DEFAULT_MS;
      lastFixWallRef.current = now;
      const dur = Math.min(MAX_MS, Math.max(MIN_MS, gap));

      // Start the new leg from wherever the dot is right now, so no teleport.
      const startPoint: SmoothedLocation =
        currentRef.current ?? toRef.current ?? { lat, lng, heading: heading ?? 0 };

      // Missing/invalid course (GPS reports none when stationary): keep prior heading.
      const newHeading =
        heading === null || heading === undefined || Number.isNaN(heading)
          ? startPoint.heading
          : ((heading % 360) + 360) % 360;

      fromRef.current = { ...startPoint, ts: now };
      toRef.current = { lat, lng, heading: newHeading, ts: now + dur };

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
