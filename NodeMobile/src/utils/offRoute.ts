// Passive off-route COLOUR feedback for the location dot.
//
// This module answers exactly one question: "given where the user really is and
// how good the fix is, how far toward the off-route colour should the dot be?"
// Three constraints come straight from OpenCairn's passive-display rule, and the
// shape of the code follows from them:
//
//   • It returns a COLOUR, never a position. Nothing here may be used to move
//     the dot — snapping the dot to the route would hide from a lost user that
//     they are off it, which is the exact failure this feature exists to avoid.
//   • The colour EASES along a gradient. There is deliberately no boolean
//     "off-route" state and no threshold that trips, so the map never announces
//     anything; it just looks slightly different, and the user may ignore it.
//   • It is only ever called with a route the user explicitly loaded. Callers
//     must gate on that. Proximity to basemap trails is never consulted — the
//     app does not infer that you are "on a trail".
//
// DISPLAY ONLY. The recorded track is written from the raw fixes elsewhere and
// must never pass through here.
import haversine from "haversine-distance";
import type { LatLng } from "../components/MapLibre/MapLibreMap";
import { projectOntoSegment, LL } from "./geoProgress";

// Called with the named-property form on purpose. haversine-distance reads ARRAY
// arguments as [lng, lat] (GeoJSON order), so passing this file's [lat, lng]
// tuples positionally silently scales the result by cos(latitude) — see the note
// in the PR about geoUtils.getDistanceMeters, which has that bug.
const metersBetween = (a: LL, b: LL): number => haversine(a, b);

/** The dot's normal colour: the fix is on or near the loaded route. */
export const ON_ROUTE_COLOR = "#1E88E5";
/** Full-offset colour. Amber, not red — this is information, not an alarm. */
export const OFF_ROUTE_COLOR = "#F57C00";

// Below `near` metres the offset is treated as fully explained by GPS error and
// the dot keeps its normal colour; by `far` metres it is fully amber. Both scale
// with the fix's reported accuracy, because the same 30 m offset means very
// different things with a ±5 m fix and a ±40 m fix under canopy.
//
// Matches the dot's binding radius: if "within 25 yards" counts as on the trail
// (see BIND_NEAR_FLOOR_M) the colour has to agree, or the dot sits on the line
// while the colour calls it off-route.
const NEAR_FLOOR_M = 23; // ~25 yards — inside this you are on the trail, full stop
const FAR_FLOOR_M = 60; // with a pristine fix, 60 m off the line is fully amber
const FAR_ACCURACY_MULT = 3; // ...and with a poor fix, 3σ before we say the same
// Used when the platform reports no accuracy at all. Mid-range on purpose:
// treating unknown accuracy as 0 would make the colour hair-triggered.
const ASSUMED_ACCURACY_M = 15;

/**
 * Shortest distance in metres from `p` to a polyline, measured to the nearest
 * point on a SEGMENT rather than to the nearest vertex. On a sparsely-sampled
 * GPX the vertex distance can be tens of metres wrong mid-segment, which would
 * colour the dot amber while the user walks straight down the trail.
 *
 * Returns Infinity for a polyline with no segments.
 */
export function distanceToPolylineMeters(p: LL, polyline: LatLng[]): number {
  if (polyline.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a: LL = { lat: polyline[i][0], lng: polyline[i][1] };
    const b: LL = { lat: polyline[i + 1][0], lng: polyline[i + 1][1] };
    const { point } = projectOntoSegment(p, a, b);
    const d = metersBetween(p, point);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Shortest distance in metres from `p` to any of several polylines. Segments are
 * kept separate rather than concatenated: joining disjoint GPX tracks end to end
 * would invent a straight "bridge" line across country that the user could then
 * appear to be walking along.
 */
export function distanceToSegmentsMeters(p: LL, segments: LatLng[][]): number {
  let min = Infinity;
  for (const seg of segments) {
    const d = distanceToPolylineMeters(p, seg);
    if (d < min) min = d;
  }
  return min;
}

/**
 * The nearest point to `p` across all of several polylines, plus its distance.
 * Same segment-not-vertex projection and same "keep polylines separate" logic
 * as distanceToSegmentsMeters, but also returns WHERE that nearest point is —
 * for callers that want to move something there (unlike this file's other
 * exports, which deliberately return only distance/colour; see the file
 * header). Returns null for no segments at all.
 */
export function nearestPointOnSegments(
  p: LL,
  segments: LatLng[][],
): { point: LL; distanceM: number } | null {
  let best: { point: LL; distanceM: number } | null = null;
  for (const seg of segments) {
    if (seg.length < 2) continue;
    for (let i = 0; i < seg.length - 1; i++) {
      const a: LL = { lat: seg[i][0], lng: seg[i][1] };
      const b: LL = { lat: seg[i + 1][0], lng: seg[i + 1][1] };
      const { point } = projectOntoSegment(p, a, b);
      const d = metersBetween(p, point);
      if (!best || d < best.distanceM) best = { point, distanceM: d };
    }
  }
  return best;
}

function easedFactor(distanceM: number, near: number, far: number): number {
  if (!Number.isFinite(distanceM)) return 0;
  const t = (distanceM - near) / (far - near);
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return tc * tc * (3 - 2 * tc); // smoothstep
}

function resolveAccuracy(accuracyM?: number | null): number {
  return typeof accuracyM === "number" && Number.isFinite(accuracyM) && accuracyM > 0
    ? accuracyM
    : ASSUMED_ACCURACY_M;
}

/**
 * How far toward the off-route colour the dot should sit, in [0,1].
 *
 * `accuracyM` is the fix's own reported accuracy radius in metres. A larger
 * radius widens both ends of the ramp, so an offset the uncertainty already
 * explains does not push the dot toward amber. Eased with smoothstep so there is
 * no visible knee where the colour "kicks in".
 */
export function offRouteFactor(
  distanceM: number,
  accuracyM?: number | null,
): number {
  if (!Number.isFinite(distanceM)) return 0;
  const acc = resolveAccuracy(accuracyM);
  const near = Math.max(NEAR_FLOOR_M, acc);
  // near + 1 guards the ramp against collapsing to zero width on a wild accuracy.
  const far = Math.max(FAR_FLOOR_M, acc * FAR_ACCURACY_MULT, near + 1);
  return easedFactor(distanceM, near, far);
}

// Tighter than offRouteFactor's ramp, and scales less with accuracy. That ramp is
// generous on purpose so poor accuracy doesn't trigger a false amber warning;
// reusing it to decide whether to BIND the dot's position bound it onto the trail
// while the user stood well off it. Binding must err toward not hiding a real
// offset.
// Holds the dot on the trail out to ~25 yards: at that distance an offset is GPS
// error, not a wrong turn, and a dot wandering off the line reads as broken.
// The tradeoff is deliberate — at 23m it can show you on a parallel trail or the
// wrong leg of a switchback. Binding still fades rather than cutting, and still
// releases faster than the colour goes amber.
const BIND_NEAR_FLOOR_M = 23; // ~25 yards — full bind this close, at any accuracy
const BIND_FAR_FLOOR_M = 45; // fully released by here even with a great fix
const BIND_ACCURACY_NEAR_MULT = 0.5;
const BIND_ACCURACY_FAR_MULT = 1.5;

/**
 * How far toward BOUND-TO-THE-LINE the dot should sit, in [0,1]. See
 * useSmoothedLocation.ts's SnapToRoute: this is the weight for pulling the
 * displayed position onto the route, not a colour — must go to 0 well before
 * offRouteFactor would call the same offset "off-route", so binding never
 * outlasts the point where a lost user needs to see their real position.
 */
export function bindToRouteFactor(distanceM: number, accuracyM?: number | null): number {
  if (!Number.isFinite(distanceM)) return 0;
  const acc = resolveAccuracy(accuracyM);
  const near = Math.max(BIND_NEAR_FLOOR_M, acc * BIND_ACCURACY_NEAR_MULT);
  const far = Math.max(BIND_FAR_FLOOR_M, acc * BIND_ACCURACY_FAR_MULT, near + 1);
  return easedFactor(distanceM, near, far);
}

// How much a single fix's blend can move toward the new target per update
// (0..1; lower = more resistant to single-fix noise). Same exponential-blend
// idea as locationSmoothing.ts's velocity smoothing. 0.35 took ~10 fixes to
// converge either direction — at real-world 1.4-2s fix gaps (see
// useSmoothedLocation.ts's MAX_MS comment) that's 15-20+ seconds before
// binding became visible at all, compounding the widened-threshold fix
// above. Raised so sustained on-route fixes visibly bind within a handful
// of fixes (a few seconds), while still damping enough that a single noisy
// fix can't flip it outright (see the regression test for that).
const BIND_BLEND_SMOOTH = 0.55;

/**
 * Smooths the bind BLEND itself across fixes, not just bindToRouteFactor's
 * per-fix distance ramp. Without this, ordinary GPS/trail-data noise near the
 * ramp's edge flips the blend between ~0 and ~1 fix to fix — and because each
 * flip discontinuously changes what useSmoothedLocation.ts's glide is heading
 * toward, that read as both "it breaks its binding" (the visible flip) and
 * "doesn't look like it's moving" (net forward progress eaten by the
 * resulting back-and-forth). Call update() once per fix with the raw
 * distance/accuracy; it returns the damped blend to hand to SnapToRoute.
 */
export function createRouteBindTracker() {
  let blend = 0;

  function reset() {
    blend = 0;
  }

  function update(distanceM: number, accuracyM: number | null | undefined): number {
    const target = 1 - bindToRouteFactor(distanceM, accuracyM);
    blend = blend + (target - blend) * BIND_BLEND_SMOOTH;
    return blend;
  }

  return { update, reset };
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.round(n < 0 ? 0 : n > 255 ? 255 : n)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Blend ON_ROUTE_COLOR → OFF_ROUTE_COLOR by `factor` (clamped to [0,1]).
 * A continuous gradient, so there is no single frame where the dot changes
 * state — only a slow drift in hue as the real offset grows.
 */
export function offRouteColor(factor: number): string {
  const t = factor < 0 ? 0 : factor > 1 ? 1 : factor;
  const [r1, g1, b1] = parseHex(ON_ROUTE_COLOR);
  const [r2, g2, b2] = parseHex(OFF_ROUTE_COLOR);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
