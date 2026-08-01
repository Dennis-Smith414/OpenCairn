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


def classify_region(lat, lon):
    if lat > 45.3:
        return 'Northwoods & Apostle Islands, WI'
    if 43.6 <= lat <= 45.3 and lon > -87.9:
        return 'Door County & Lakeshore, WI'
    if 42.4 <= lat <= 43.6 and lon > -88.3:
        return 'Milwaukee & Kettle Moraine, WI'
    if 42.4 <= lat <= 43.6 and -89.6 <= lon <= -88.3:
        return 'Madison & Southern Lakes, WI'
    if lon < -90.2:
        return 'Driftless Area / Mississippi River Valley, WI'
    return 'Central Sands & Wisconsin Dells, WI'


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


def cmd_convert(args):
    with open(CACHE_FILE) as f:
        raw = json.load(f)
    elements = raw['elements']

    standalone = {}   # way_id -> {'geometry': [(lat,lon),...], 'tags': {...}}
    rel_name_for_way = {}   # way_id -> relation name
    rel_geom_for_way = {}   # way_id -> geometry, for members not independently matched

    for el in elements:
        if el.get('type') == 'way' and el.get('geometry'):
            pts = [(g['lat'], g['lon']) for g in el['geometry']]
            standalone[el['id']] = {'geometry': pts, 'tags': el.get('tags') or {}}

    for el in elements:
        if el.get('type') != 'relation':
            continue
        rname = (el.get('tags') or {}).get('name')
        for m in el.get('members', []):
            if m.get('type') != 'way':
                continue
            wid = m.get('ref')
            if rname and wid not in rel_name_for_way:
                rel_name_for_way[wid] = rname
            if m.get('geometry') and wid not in standalone and wid not in rel_geom_for_way:
                rel_geom_for_way[wid] = [(g['lat'], g['lon']) for g in m['geometry']]

    all_ids = set(standalone) | set(rel_geom_for_way)
    print('Distinct ways: %d (standalone matched: %d, relation-only: %d)' %
          (len(all_ids), len(standalone), len(rel_geom_for_way)), file=sys.stderr)

    by_region = {}  # region -> list of feature dicts (pre-cap)

    for wid in all_ids:
        rec = standalone.get(wid)
        geometry = rec['geometry'] if rec else rel_geom_for_way[wid]
        tags = rec['tags'] if rec else {}
        if len(geometry) < 2:
            continue

        length_m = track_length_m(geometry)

        real_name = rel_name_for_way.get(wid) or tags.get('name')
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

        if length_m < MIN_LEN_HARD:
            continue  # too short regardless of name

        simplified = douglas_peucker(geometry, DP_EPSILON_DEG)
        if len(simplified) < 2:
            continue

        by_region.setdefault(region, []).append({
            'name': name,
            'region': region,
            'has_real_name': has_real_name,
            'length_m': length_m,
            'coords': simplified,  # (lat,lon) pairs
        })

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
