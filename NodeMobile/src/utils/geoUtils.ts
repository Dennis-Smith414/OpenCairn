//Utillity for the Geo features
import { Feature, FeatureCollection, Geometry } from 'geojson';
import type { LatLng } from '../components/LeafletMap/LeafletMap'; // Adjust path as needed

export function flattenToLatLng(geo: FeatureCollection | Feature | Geometry): LatLng[] {
  if (!geo) return [];
  if (geo.type === 'FeatureCollection') return geo.features.flatMap(f => flattenToLatLng(f));
  if (geo.type === 'Feature') return flattenToLatLng(geo.geometry);
  if (geo.type === 'LineString') return geo.coordinates.map(([lng, lat]) => [lat, lng]);
  if (geo.type === 'MultiLineString') return geo.coordinates.map(([lng, lat]) => [lat, lng] as unknown as LatLng); //<--GET THIS OUT ASAP!!!, type asserting for testing only, UNSAFE!!
  return [];
}