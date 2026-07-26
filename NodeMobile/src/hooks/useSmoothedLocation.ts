// Drives a location dot that GLIDES between GPS fixes instead of snapping.
//
// Feed it raw fixes via pushFix(); read `smoothed` for the value to draw. It
// linearly interpolates from the previously displayed position to the newest
// fix over the measured gap between fixes, on a requestAnimationFrame loop, and
// stops the loop once it has caught up (no idle battery drain).
//
// DISPLAY ONLY. Callers must still record the raw fixes separately — nothing
// recorded should come from here.
import { useCallback, useEffect, useRef, useState } from "react";
import { lerpHeading, lerpPoint, progress } from "../utils/locationSmoothing";

export interface SmoothedLocation {
  lat: number;
  lng: number;
  heading: number; // degrees [0,360); carried forward when a fix lacks a course
}

interface Endpoint extends SmoothedLocation {
  ts: number; // wall-clock ms when this endpoint's animation window starts/ends
}

// Clamp the animation window so a stalled GPS (huge gap) doesn't produce a
// 30-second crawl, and a burst of fixes doesn't divide by ~0.
const MIN_MS = 250;
const MAX_MS = 3000;
const DEFAULT_MS = 1000;

export function useSmoothedLocation(enabled: boolean) {
  const [smoothed, setSmoothed] = useState<SmoothedLocation | null>(null);
  const fromRef = useRef<Endpoint | null>(null);
  const toRef = useRef<Endpoint | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFixWallRef = useRef<number>(0);

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
    setSmoothed({
      lat: p.lat,
      lng: p.lng,
      heading: lerpHeading(from.heading, to.heading, t),
    });
    if (t < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null; // caught up; idle until the next fix
    }
  }, []);

  const pushFix = useCallback(
    (lat: number, lng: number, heading: number | null | undefined) => {
      if (!enabled) return;
      const now = Date.now();
      // Duration = measured gap since the last fix, clamped to sane bounds.
      const gap = lastFixWallRef.current ? now - lastFixWallRef.current : DEFAULT_MS;
      lastFixWallRef.current = now;
      const dur = Math.min(MAX_MS, Math.max(MIN_MS, gap));

      // Start the new leg from wherever the dot is right now (the current target
      // or the last displayed value), so there's no visible teleport on arrival.
      const startPoint: SmoothedLocation =
        toRef.current ?? smoothed ?? { lat, lng, heading: heading ?? 0 };

      // A missing/invalid course (GPS reports none when stationary) keeps the
      // previous heading rather than snapping the arrow to 0.
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
    [enabled, smoothed, tick],
  );

  // Cleanup on unmount / when disabled.
  useEffect(() => {
    if (!enabled && rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled]);

  return { smoothed, pushFix };
}
