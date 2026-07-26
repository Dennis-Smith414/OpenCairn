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
const NEAR_FLOOR_M = 10; // never claim certainty tighter than this
const FAR_FLOOR_M = 35; // with a pristine fix, 35 m off the line is fully amber
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

  const acc =
    typeof accuracyM === "number" && Number.isFinite(accuracyM) && accuracyM > 0
      ? accuracyM
      : ASSUMED_ACCURACY_M;

  const near = Math.max(NEAR_FLOOR_M, acc);
  // near + 1 guards the ramp against collapsing to zero width on a wild accuracy.
  const far = Math.max(FAR_FLOOR_M, acc * FAR_ACCURACY_MULT, near + 1);

  const t = (distanceM - near) / (far - near);
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return tc * tc * (3 - 2 * tc); // smoothstep
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
