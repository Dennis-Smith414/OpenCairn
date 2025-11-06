// utils/geoUtils.ts
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { LatLng } from "../components/LeafletMap/LeafletMap";
import haversine from "haversine-distance";

// Convert any GeoJSON (FC/Feature/Geometry) into an array of segments (LatLng[][]).
// Each segment is a continuous polyline. We keep segments separate to avoid
// "bridge lines" between disjoint tracks.
export function toSegments(geo: FeatureCollection | Feature | Geometry | null | undefined): LatLng[][] {
  if (!geo) return [];

  // Normalize to geometry level
  if ((geo as FeatureCollection).type === "FeatureCollection") {
    const fc = geo as FeatureCollection;
    const out: LatLng[][] = [];
    for (const f of fc.features || []) out.push(...toSegments(f));
    return out;
  }

  if ((geo as Feature).type === "Feature") {
    const feat = geo as Feature;
    return toSegments(feat.geometry);
  }

  const g = geo as Geometry;
  if (g.type === "LineString") {
    return [g.coordinates.map(([lng, lat]) => [lat, lng] as LatLng)];
  }

  if (g.type === "MultiLineString") {
    return g.coordinates.map(
      (line) => line.map(([lng, lat]) => [lat, lng] as LatLng)
    );
  }

  // Unsupported geometry types are ignored
  return [];
}

// Convenience: specifically for FeatureCollections (common for /routes/:id/gpx)
export function featureCollectionToSegments(fc: FeatureCollection | null | undefined): LatLng[][] {
  if (!fc || fc.type !== "FeatureCollection") return [];
  return toSegments(fc);
}

// Distance helper (meters)
export function getDistanceMeters(a: LatLng, b: LatLng): number {
  try { return haversine(a, b); } catch { return NaN; }
}
