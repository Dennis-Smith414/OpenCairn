// Compass bearing for the location dot's arrow.
//
// COURSE (from GPS) is where you're travelling; HEADING is where the device
// points. The arrow means HEADING, and GPS can't measure it at all while you
// stand still or turn on the spot — exactly when you look at the arrow.
//
// DISPLAY ONLY.
import { useEffect, useRef, useState } from "react";
import CompassHeading from "react-native-compass-heading";

export interface CompassReading {
  /** Degrees clockwise from north, [0, 360). */
  heading: number;
  /** Reported accuracy in degrees; smaller is better. Platform-defined. */
  accuracy: number;
}

// Native-side filter, so JS isn't woken on every magnetometer sample.
const UPDATE_DEGREES = 2;

// Above this the compass is confused — nearby metal, or a phone needing the
// figure-of-eight calibration wave. A confidently wrong arrow is worse than none.
const MAX_TRUSTED_ACCURACY_DEG = 30;

/** Live compass heading, or null when unavailable or untrustworthy. Null is a
 *  real answer — handle it, don't default to north. */
export function useCompassHeading(enabled: boolean = true): CompassReading | null {
  const [reading, setReading] = useState<CompassReading | null>(null);
  const latestRef = useRef<CompassReading | null>(null);

  useEffect(() => {
    if (!enabled) {
      setReading(null);
      latestRef.current = null;
      return;
    }

    let cancelled = false;

    try {
      CompassHeading.start(UPDATE_DEGREES, (data: CompassReading) => {
        if (cancelled) return;
        const accuracy =
          typeof data?.accuracy === "number" && Number.isFinite(data.accuracy)
            ? data.accuracy
            : Number.POSITIVE_INFINITY;
        const heading =
          typeof data?.heading === "number" && Number.isFinite(data.heading)
            ? ((data.heading % 360) + 360) % 360
            : null;

        const next =
          heading !== null && accuracy <= MAX_TRUSTED_ACCURACY_DEG
            ? { heading, accuracy }
            : null;
        latestRef.current = next;
        setReading(next);
      });
    } catch (err) {
      // Unlinked module or no magnetometer — the dot falls back to GPS course.
      console.warn("Compass unavailable, falling back to GPS course:", err);
      setReading(null);
    }

    return () => {
      cancelled = true;
      try {
        CompassHeading.stop();
      } catch {
        // start() never succeeded.
      }
    };
  }, [enabled]);

  return reading;
}
