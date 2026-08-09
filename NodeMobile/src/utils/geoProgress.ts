// Geometry for the "how far along the GPX route have I walked" grey line.
//
// The grey line's leading edge must NOT snap to route vertices — that makes it
// jump in chunks on a sparsely-sampled GPX. Instead we project the user's
// position onto the trail segment and cut the line at that projected point, so
// the edge slides continuously along the trail. DISPLAY ONLY.
import haversine from "haversine-distance";

export interface LL {
  lat: number;
  lng: number;
}

// Named-property form on purpose — haversine-distance reads ARRAY arguments as
// [lng, lat] (GeoJSON order), so passing this file's {lat,lng} objects
// positionally would silently scale the result by cos(latitude). See the same
// note in offRoute.ts, which has this exact gotcha documented.
const metersBetween = (a: LL, b: LL): number => haversine(a, b);

/**
 * Closest point on segment a→b to point p, clamped to the segment, plus the
 * parameter t in [0,1] (0 = at a, 1 = at b).
 *
 * Uses a local equirectangular approximation: longitude is scaled by
 * cos(latitude) so the projection is metrically correct over the short spans
 * between GPX vertices (the error over a few tens of meters is invisible).
 */
export function projectOntoSegment(p: LL, a: LL, b: LL): { point: LL; t: number } {
  const latRef = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const kx = Math.cos(latRef); // scale longitude into the same units as latitude

  const ax = a.lng * kx;
  const ay = a.lat;
  const bx = b.lng * kx;
  const by = b.lat;
  const px = p.lng * kx;
  const py = p.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;

  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;

  return {
    point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
    t,
  };
}

// --- Track progress: how far along a route has the user walked -----------
//
// Pure state machine, no React. One track's worth of state; callers keep a
// Record<trackId, TrackProgressState> and call advanceTrackProgress() per
// fix, per track. seg/t/point is the current position along the route;
// seedSeg/seedT/seedPoint is where the user FIRST joined it (recorded once,
// carried forward unchanged) — the grey line covers seed->current, not
// route-start->current, so joining a route mid-length doesn't retroactively
// credit the unwalked lead-in.
//
// BUG THIS FIXES: on a route whose start and end are close together (any
// loop trail — extremely common for hiking), the ORIGINAL seeding step
// measured nearest-VERTEX distance while everything else here measures
// nearest-point-on-SEGMENT, so a single noisy first fix could seed onto the
// loop-closing tail instead of the true start. Once that happened, progress
// was pinned there forever (monotonic-forward, no-rewind is deliberate) and
// the grey line would never appear again for the whole session, even walking
// the route perfectly. Verified via simulation against this repo's own
// Downer_Woods.gpx fixture (a 45-point loop whose start/end are ~1.7m apart):
// ~40-50% of noisy first fixes seeded wrong.
//
// Fixed two ways:
//   1. Seed with the SAME distance metric (nearest point on segment) the
//      window search below already uses, so they can't disagree.
//   2. That alone isn't sufficient — two loop-closing segments 1.7m apart are
//      a genuine ambiguity under GPS noise, not just a metric bug. So both
//      the seed and any large forward jump require two consecutive fixes to
//      agree before committing (pendingSeed/pendingJump below), and if
//      progress still gets stuck near the seed for several ticks in a row
//      (a wrong seed landing on an isolated segment nobody walks back to),
//      it reseeds once — capped, so a genuinely off-trail user still
//      correctly freezes instead of reseeding forever.

export interface TrackProgressPoint {
  seg: number;
  t: number;
  point: LL;
  seedSeg: number;
  seedT: number;
  seedPoint: LL;
}

interface Candidate {
  seg: number;
  t: number;
  point: LL;
  dist: number;
}

export interface TrackProgressState {
  progress: TrackProgressPoint | null;
  seeded: boolean;
  pendingSeed: Candidate | null; // seed candidate awaiting a second, agreeing fix
  pendingJump: Candidate | null; // large forward jump awaiting a second, agreeing fix
  stuckTicks: number; // consecutive off-route/would-rewind ticks since the seed, while still AT the seed
  reseedCount: number; // capped — stops a genuinely off-trail user from reseeding forever
}

export const INITIAL_TRACK_PROGRESS_STATE: TrackProgressState = {
  progress: null,
  seeded: false,
  pendingSeed: null,
  pendingJump: null,
  stuckTicks: 0,
  reseedCount: 0,
};

export interface TrackProgressOptions {
  onRouteM?: number; // must be this close to the route to count as progress
  window?: number; // segments to look ahead from current progress
  jumpConfirmSegs?: number; // a forward jump bigger than this needs a corroborating 2nd fix
  segTolerance?: number; // how close two ticks' candidates must be to "agree"
  stuckTicksLimit?: number; // consecutive stuck-at-seed ticks before reseeding
  maxReseeds?: number; // cap on stuck-seed reseeds per track
}

const DEFAULTS: Required<TrackProgressOptions> = {
  onRouteM: 40,
  window: 60,
  jumpConfirmSegs: 3,
  segTolerance: 2,
  stuckTicksLimit: 6,
  maxReseeds: 2,
};

/** Nearest point to `p` on ANY segment of the route (full scan) — used for
 *  seeding, where the user could be joining anywhere along the trail. */
function nearestSegmentOnRoute(p: LL, flat: LL[]): Candidate | null {
  let best: Candidate | null = null;
  for (let s = 0; s < flat.length - 1; s++) {
    const proj = projectOntoSegment(p, flat[s], flat[s + 1]);
    const dist = metersBetween(p, proj.point);
    if (!best || dist < best.dist) best = { seg: s, t: proj.t, point: proj.point, dist };
  }
  return best;
}

/** Nearest point to `p` within [startSeg, startSeg+window] — used once
 *  seeded, so a nearby but disconnected part of the route (e.g. the other
 *  side of a loop) can't hijack progress. */
function nearestSegmentInWindow(p: LL, flat: LL[], startSeg: number, window: number): Candidate | null {
  const endSeg = Math.min(flat.length - 2, startSeg + window);
  let best: Candidate | null = null;
  for (let s = startSeg; s <= endSeg; s++) {
    const proj = projectOntoSegment(p, flat[s], flat[s + 1]);
    const dist = metersBetween(p, proj.point);
    if (!best || dist < best.dist) best = { seg: s, t: proj.t, point: proj.point, dist };
  }
  return best;
}

/** One tick of progress for one track. Pure — no refs, no React; callers own
 *  the per-track state and thread it back in each call. */
export function advanceTrackProgress(
  userLoc: LL,
  flat: LL[],
  state: TrackProgressState,
  opts?: TrackProgressOptions,
): TrackProgressState {
  if (flat.length < 2) return state;
  const o = { ...DEFAULTS, ...opts };

  if (!state.seeded || !state.progress) {
    const candidate = nearestSegmentOnRoute(userLoc, flat);
    if (!candidate || candidate.dist > o.onRouteM) {
      // Not close enough to the route yet — drop any stale pending seed so a
      // later, unrelated candidate can't "corroborate" against it.
      return { ...INITIAL_TRACK_PROGRESS_STATE, reseedCount: state.reseedCount };
    }
    const pending = state.pendingSeed;
    if (pending && Math.abs(pending.seg - candidate.seg) <= o.segTolerance) {
      // Two consecutive ticks agree: commit the seed.
      const seedSeg = Math.min(candidate.seg, flat.length - 2);
      const progress: TrackProgressPoint = {
        seg: seedSeg,
        t: candidate.t,
        point: candidate.point,
        seedSeg,
        seedT: candidate.t,
        seedPoint: candidate.point,
      };
      return {
        progress,
        seeded: true,
        pendingSeed: null,
        pendingJump: null,
        stuckTicks: 0,
        reseedCount: state.reseedCount,
      };
    }
    // First candidate, or it doesn't agree with the pending one — stage it
    // and wait for the next fix to corroborate.
    return { ...state, pendingSeed: candidate };
  }

  const cur = state.progress;
  const best = nearestSegmentInWindow(userLoc, flat, cur.seg, o.window);
  if (!best) return state;

  const forward = best.seg > cur.seg || (best.seg === cur.seg && best.t >= cur.t);
  const bigJump = best.seg - cur.seg > o.jumpConfirmSegs;
  const onRoute = best.dist <= o.onRouteM;

  if (onRoute && forward && !bigJump) {
    const progress: TrackProgressPoint = {
      seg: best.seg,
      t: best.t,
      point: best.point,
      seedSeg: cur.seedSeg,
      seedT: cur.seedT,
      seedPoint: cur.seedPoint,
    };
    return { progress, seeded: true, pendingSeed: null, pendingJump: null, stuckTicks: 0, reseedCount: state.reseedCount };
  }

  if (onRoute && forward && bigJump) {
    const pj = state.pendingJump;
    if (pj && Math.abs(pj.seg - best.seg) <= o.segTolerance) {
      const progress: TrackProgressPoint = {
        seg: best.seg,
        t: best.t,
        point: best.point,
        seedSeg: cur.seedSeg,
        seedT: cur.seedT,
        seedPoint: cur.seedPoint,
      };
      return { progress, seeded: true, pendingSeed: null, pendingJump: null, stuckTicks: 0, reseedCount: state.reseedCount };
    }
    // Stage the jump; needs the next fix to agree before it commits.
    return { ...state, pendingJump: best, stuckTicks: 0 };
  }

  // Off-route or would-rewind: hold position. Only count this toward a
  // stuck-seed reseed while progress hasn't actually moved past the seed yet
  // — once real forward walking has happened, the seed has proven itself
  // correct, and a LATER off-route excursion (e.g. a snack break just off
  // the trail) must never discard already-earned progress.
  const nearSeed = cur.seg - cur.seedSeg <= o.segTolerance;
  const stuckTicks = nearSeed ? state.stuckTicks + 1 : 0;
  if (nearSeed && stuckTicks >= o.stuckTicksLimit && state.reseedCount < o.maxReseeds) {
    return {
      progress: null,
      seeded: false,
      pendingSeed: null,
      pendingJump: null,
      stuckTicks: 0,
      reseedCount: state.reseedCount + 1,
    };
  }
  return { ...state, pendingJump: null, stuckTicks };
}
