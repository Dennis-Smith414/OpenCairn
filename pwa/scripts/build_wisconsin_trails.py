#!/usr/bin/env python3
"""Build pwa/trails.min.json for Wisconsin from OpenStreetMap via Overpass API.

Two stages, run separately so tuning the convert step never re-hits the network:

    python3 build_wisconsin_trails.py fetch     # -> .cache/overpass_wi.json
    python3 build_wisconsin_trails.py convert    # -> ../trails.min.json

Stdlib only (urllib, json, math) — no pip install needed.
"""
import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, '.cache')
CACHE_FILE = os.path.join(CACHE_DIR, 'overpass_wi.json')
OUT_FILE = os.path.normpath(os.path.join(HERE, '..', 'trails.min.json'))

OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]
USER_AGENT = 'OpenCairnTrailBuilder/1.0 (https://opencairn.xyz; contact: opencairn project)'

QUERY = """
[out:json][timeout:180];
area["ISO3166-2"="US-WI"]["admin_level"="4"]->.wi;
(
  way["highway"~"^(path|footway|track|bridleway)$"]["foot"!="no"](area.wi);
  relation["route"~"^(hiking|foot)$"](area.wi);
);
out geom;
""".strip()

# Wisconsin regional bboxes for the sequential-subquery fallback, ordered so
# the whole state is covered if the single statewide query keeps timing out.
REGION_BBOXES = [
    ('Northwoods',  '45.3,-92.9,47.1,-86.2'),
    ('DoorCounty',  '43.6,-87.9,45.3,-86.8'),
    ('Milwaukee',   '42.4,-88.3,43.6,-87.0'),
    ('Madison',     '42.4,-89.6,43.6,-88.3'),
    ('Driftless',   '42.4,-92.9,45.3,-90.2'),
    ('CentralSands','42.4,-90.2,45.3,-88.3'),
]


def http_post(url, data, timeout=200):
    req = urllib.request.Request(
        url, data=data.encode('utf-8'),
        headers={'User-Agent': USER_AGENT, 'Content-Type': 'text/plain'},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def run_query(query, label):
    """POST one Overpass query, retrying across endpoints with backoff."""
    backoffs = [5, 15, 45]
    last_err = None
    for endpoint in OVERPASS_ENDPOINTS:
        for attempt, wait in enumerate([0] + backoffs):
            if wait:
                print('  retrying %s in %ss (attempt %d)...' % (label, wait, attempt + 1), file=sys.stderr)
                time.sleep(wait)
            try:
                print('  querying %s -> %s' % (label, endpoint), file=sys.stderr)
                return run_query_once(endpoint, query)
            except Exception as e:  # noqa: BLE001 - network call, want to retry broadly
                last_err = e
                print('  %s failed: %s' % (label, e), file=sys.stderr)
        # move to next endpoint after exhausting retries on this one
    raise RuntimeError('all endpoints failed for %s: %s' % (label, last_err))


def run_query_once(endpoint, query):
    return http_post(endpoint, query)


def cmd_fetch(args):
    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        data = run_query(QUERY, 'statewide')
        elements = data.get('elements', [])
    except Exception as e:
        print('Statewide query failed (%s) — falling back to 6 regional sub-queries.' % e, file=sys.stderr)
        elements = []
        for name, bbox in REGION_BBOXES:
            q = '[out:json][timeout:180];\n(\n  way["highway"~"^(path|footway|track|bridleway)$"]["foot"!="no"](%s);\n  relation["route"~"^(hiking|foot)$"](%s);\n);\nout geom;' % (bbox, bbox)
            d = run_query(q, name)
            elements.extend(d.get('elements', []))
            time.sleep(3)  # be polite between sub-queries — never parallel

    with open(CACHE_FILE, 'w') as f:
        json.dump({'elements': elements}, f)
    print('Cached %d raw elements -> %s' % (len(elements), CACHE_FILE))


# ---------------------------------------------------------------------------
# convert
# ---------------------------------------------------------------------------

def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    to_r = math.pi / 180
    d_lat = (lat2 - lat1) * to_r
    d_lon = (lon2 - lon1) * to_r
    a = math.sin(d_lat / 2) ** 2 + math.cos(lat1 * to_r) * math.cos(lat2 * to_r) * math.sin(d_lon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def track_length_m(pts):
    """pts: list of (lat, lon)"""
    total = 0.0
    for i in range(1, len(pts)):
        total += haversine_m(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])
    return total


def douglas_peucker(pts, epsilon):
    """pts: list of (lat, lon). Returns a simplified list, endpoints always kept."""
    if len(pts) < 3:
        return pts

    def perp_dist(pt, a, b):
        # planar approximation is fine at this epsilon/scale (few-metre tolerances)
        if a == b:
            return math.hypot(pt[0] - a[0], pt[1] - a[1])
        (x, y), (x1, y1), (x2, y2) = pt, a, b
        num = abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1)
        den = math.hypot(y2 - y1, x2 - x1)
        return num / den if den else math.hypot(x - x1, y - y1)

    def dp(points):
        if len(points) < 3:
            return points
        a, b = points[0], points[-1]
        max_d, idx = -1.0, -1
        for i in range(1, len(points) - 1):
            d = perp_dist(points[i], a, b)
            if d > max_d:
                max_d, idx = d, i
        if max_d > epsilon:
            left = dp(points[:idx + 1])
            right = dp(points[idx:])
            return left[:-1] + right
        return [a, b]

    return dp(pts)


# Nearest-anchor-point classification, not axis-aligned rectangles. Rectangles
# cut clean across real geography: the original rule bucketed everything at
# longitude <= -88.3 into "Madison" regardless of latitude, which put actual
# southeastern Wisconsin — both Kettle Moraine units, Whitewater, Palmyra,
# Delavan, Lake Geneva, East Troy — under "Madison & Southern Lakes" just for
# being a few miles west of an arbitrary line, even though they're 15-40km
# closer to Milwaukee. A short haversine-nearest-neighbor to one representative
# point per region gives each region a naturally-shaped catchment area instead.
# Anchors are hand-picked to represent each named region, not just its biggest
# city — e.g. Milwaukee's anchor is nudged west of downtown toward the Kettle
# Moraine units, since the region name promises both.
REGION_ANCHORS = {
    'Northwoods & Apostle Islands, WI': (45.9, -90.0),
    'Door County & Lakeshore, WI': (44.83, -87.38),
    'Milwaukee & Kettle Moraine, WI': (43.0, -88.1),
    'Madison & Southern Lakes, WI': (43.07, -89.4),
    'Driftless Area / Mississippi River Valley, WI': (43.8, -91.0),
    'Central Sands & Wisconsin Dells, WI': (44.35, -89.7),
}


def classify_region(lat, lon):
    best_region, best_dist = None, float('inf')
    for region, (alat, alon) in REGION_ANCHORS.items():
        dist = haversine_m(lat, lon, alat, alon)
        if dist < best_dist:
            best_region, best_dist = region, dist
    return best_region


REGION_SHORT = {
    'Northwoods & Apostle Islands, WI': 'Northwoods',
    'Door County & Lakeshore, WI': 'Door County',
    'Milwaukee & Kettle Moraine, WI': 'Milwaukee',
    'Madison & Southern Lakes, WI': 'Madison',
    'Driftless Area / Mississippi River Valley, WI': 'Driftless',
    'Central Sands & Wisconsin Dells, WI': 'Central Sands',
}

MIN_LEN_HARD = 150     # drop below this regardless of name
MIN_LEN_NAMED_FALLBACK = 500  # synthetic-name fallback only kicks in above this
CAP_PER_REGION = 700
DP_EPSILON_DEG = 0.00007

# Segment-merging (Part 8): OSM maps a single real trail as many short ways —
# without this, the Ice Age Trail alone shows up as hundreds of ~1-2-point
# fragments. Roles that mark a relation member as a side trip/bypass rather
# than the main line — these are excluded from the merge walk (but still kept
# as their own small features via the normal per-way fallback path below,
# never dropped). Matched against real production data, which includes at
# least one dirty role string with a stray trailing backtick.
EXCLUDED_ROLES = {'alternative', 'excursion', 'approach', 'link'}
# Real long-distance trails (e.g. the North Country Trail, 336km in one
# low-branching relation) still need a safety-valve cap so one relation can't
# merge into a single unbrowsable mega-feature. This is a backstop, not the
# primary fix — the primary fix is that OSM already segments most named
# trails (e.g. the Ice Age Trail is 221 separately-named relations, not one).
MAX_CHAIN_LEN_M = 40000


def normalize_role(role):
    return (role or '').strip().rstrip('`').lower()


def endpoint_key(pt):
    # Real OSM data: ways that truly connect share a bit-identical node
    # coordinate (Overpass's `out geom` echoes the authoritative stored node),
    # so an exact match after rounding is reliable — deliberately NOT a
    # distance-tolerance match, which would risk silently fusing unrelated
    # trails that merely pass close to each other (e.g. at a road crossing).
    return (round(pt[0], 7), round(pt[1], 7))


def merge_group(way_ids, way_geom):
    """way_ids: iterable of way ids sharing one trail identity (one relation's
    primary-role members, or one standalone name). way_geom: wid -> [(lat,lon),...].
    Returns a list of chains (each a list of (lat,lon) points), splitting at
    real branch points / dead ends / the length cap rather than guessing."""
    node_ways = {}  # endpoint_key -> [(way_id, 'start'|'end'), ...]
    for wid in way_ids:
        pts = way_geom.get(wid)
        if not pts or len(pts) < 2:
            continue
        node_ways.setdefault(endpoint_key(pts[0]), []).append((wid, 'start'))
        node_ways.setdefault(endpoint_key(pts[-1]), []).append((wid, 'end'))

    visited = set()
    chains = []

    def extend(chain, chain_len, forward):
        while True:
            probe = chain[-1] if forward else chain[0]
            candidates = [(w, e) for (w, e) in node_ways.get(endpoint_key(probe), []) if w not in visited]
            if len(candidates) != 1:
                return chain, chain_len  # branch, dead end, or nothing left unvisited
            nwid, nend = candidates[0]
            npts = way_geom[nwid]
            nlen = track_length_m(npts)
            if chain_len + nlen > MAX_CHAIN_LEN_M:
                return chain, chain_len
            if forward:
                oriented = npts if nend == 'start' else list(reversed(npts))
                chain = chain + oriented[1:]
            else:
                oriented = npts if nend == 'end' else list(reversed(npts))
                chain = oriented[:-1] + chain
            chain_len += nlen
            visited.add(nwid)

    for wid in sorted(way_ids):
        if wid in visited:
            continue
        visited.add(wid)
        pts = way_geom.get(wid)
        if not pts or len(pts) < 2:
            continue
        chain, chain_len = list(pts), track_length_m(pts)
        chain, chain_len = extend(chain, chain_len, True)
        chain, chain_len = extend(chain, chain_len, False)
        chains.append(chain)
    return chains


def cmd_convert(args):
    with open(CACHE_FILE) as f:
        raw = json.load(f)
    elements = raw['elements']

    standalone = {}   # way_id -> {'geometry': [(lat,lon),...], 'tags': {...}}
    rel_geom_for_way = {}   # way_id -> geometry, for members not independently matched

    for el in elements:
        if el.get('type') == 'way' and el.get('geometry'):
            pts = [(g['lat'], g['lon']) for g in el['geometry']]
            standalone[el['id']] = {'geometry': pts, 'tags': el.get('tags') or {}}

    # Named hiking/foot relations -> their primary-role member way ids
    # (many-to-many: a way can be a member of more than one named relation —
    # confirmed in real data, e.g. shared tread under "Bugline Trail" and an
    # Ice Age Trail segment — so this must NOT be first-relation-wins).
    relation_name = {}          # rel_id -> name
    way_to_relations = {}       # way_id -> [rel_id, ...] (primary-role only)
    for el in elements:
        if el.get('type') != 'relation':
            continue
        tags = el.get('tags') or {}
        if str(tags.get('route')) not in ('hiking', 'foot'):
            continue
        rname = tags.get('name')
        if not rname:
            continue
        relation_name[el['id']] = rname
        for m in el.get('members', []):
            if m.get('type') != 'way':
                continue
            wid = m.get('ref')
            if m.get('geometry') and wid not in standalone and wid not in rel_geom_for_way:
                rel_geom_for_way[wid] = [(g['lat'], g['lon']) for g in m['geometry']]
            if normalize_role(m.get('role')) in EXCLUDED_ROLES:
                continue
            way_to_relations.setdefault(wid, []).append(el['id'])

    all_ids = set(standalone) | set(rel_geom_for_way)
    print('Distinct ways: %d (standalone matched: %d, relation-only: %d)' %
          (len(all_ids), len(standalone), len(rel_geom_for_way)), file=sys.stderr)

    def way_geometry(wid):
        rec = standalone.get(wid)
        return rec['geometry'] if rec else rel_geom_for_way.get(wid)

    def way_tags(wid):
        rec = standalone.get(wid)
        return rec['tags'] if rec else {}

    # Standalone same-name groups: ways with their own name that aren't a
    # primary-role member of any named relation (those are handled below).
    standalone_groups = {}  # name -> [way_id, ...]
    for wid in all_ids:
        if wid in way_to_relations:
            continue
        name = way_tags(wid).get('name')
        if name:
            standalone_groups.setdefault(name, []).append(wid)

    way_geom_all = {wid: way_geometry(wid) for wid in all_ids}

    by_region = {}  # region -> list of feature dicts (pre-cap)

    def add_record(name, coords, has_real_name):
        if len(coords) < 2:
            return
        length_m = track_length_m(coords)
        if length_m < MIN_LEN_HARD:
            return
        lat_c = sum(p[0] for p in coords) / len(coords)
        lon_c = sum(p[1] for p in coords) / len(coords)
        region = classify_region(lat_c, lon_c)
        simplified = douglas_peucker(coords, DP_EPSILON_DEG)
        if len(simplified) < 2:
            return
        by_region.setdefault(region, []).append({
            'name': name, 'region': region, 'has_real_name': has_real_name,
            'length_m': length_m, 'coords': simplified,
        })

    # 1) Relation groups (invert way_to_relations -> rel_id -> member way ids)
    rel_members = {}
    for wid, rel_ids in way_to_relations.items():
        for rid in rel_ids:
            rel_members.setdefault(rid, []).append(wid)
    merged_relation_chains = 0
    for rid, wids in rel_members.items():
        for chain in merge_group(wids, way_geom_all):
            add_record(relation_name[rid], chain, True)
            merged_relation_chains += 1

    # 2) Standalone same-name groups
    merged_standalone_chains = 0
    for name, wids in standalone_groups.items():
        for chain in merge_group(wids, way_geom_all):
            add_record(name, chain, True)
            merged_standalone_chains += 1

    print('Merged %d relation-member ways -> %d chains; %d standalone-named ways -> %d chains' %
          (len(way_to_relations), merged_relation_chains, sum(len(v) for v in standalone_groups.values()), merged_standalone_chains),
          file=sys.stderr)

    # 3) Leftover ways: no named relation membership, no own name — unchanged
    # per-way ref-fallback / synthetic-name / drop logic, exactly as before.
    merge_claimed = set(way_to_relations) | {wid for wids in standalone_groups.values() for wid in wids}
    leftover_ids = all_ids - merge_claimed
    for wid in leftover_ids:
        geometry = way_geometry(wid)
        tags = way_tags(wid)
        if not geometry or len(geometry) < 2:
            continue
        length_m = track_length_m(geometry)
        real_name = tags.get('name')
        if not real_name and tags.get('ref'):
            real_name = 'Trail ' + str(tags['ref'])
        has_real_name = bool(real_name)
        lat_c = sum(p[0] for p in geometry) / len(geometry)
        lon_c = sum(p[1] for p in geometry) / len(geometry)
        region = classify_region(lat_c, lon_c)
        name = real_name
        if not name:
            if length_m >= MIN_LEN_NAMED_FALLBACK:
                name = '%s Trail %d' % (REGION_SHORT[region], wid % 10000)
            else:
                continue  # unnamed and short — drop
        add_record(name, geometry, has_real_name)

    features = []
    next_id = 1
    total_vertices = 0
    for region, items in by_region.items():
        items.sort(key=lambda x: (x['has_real_name'], x['length_m']), reverse=True)
        kept = items[:CAP_PER_REGION]
        print('%-45s total=%-5d kept=%-5d' % (region, len(items), len(kept)), file=sys.stderr)
        for it in kept:
            coords_lonlat = [[round(lon, 5), round(lat, 5)] for lat, lon in it['coords']]
            total_vertices += len(coords_lonlat)
            features.append({
                'type': 'Feature',
                'properties': {'id': next_id, 'name': it['name'], 'region': it['region']},
                'geometry': {'type': 'LineString', 'coordinates': coords_lonlat},
            })
            next_id += 1

    fc = {'type': 'FeatureCollection', 'features': features}
    with open(OUT_FILE, 'w') as f:
        json.dump(fc, f, separators=(',', ':'))

    size_mb = os.path.getsize(OUT_FILE) / (1024 * 1024)
    avg_v = total_vertices / len(features) if features else 0
    print('\nWrote %d features, %d vertices (avg %.1f/trail), %.2f MB -> %s' %
          (len(features), total_vertices, avg_v, size_mb, OUT_FILE))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('fetch')
    sub.add_parser('convert')
    args = ap.parse_args()
    if args.cmd == 'fetch':
        cmd_fetch(args)
    elif args.cmd == 'convert':
        cmd_convert(args)


if __name__ == '__main__':
    main()
