// screens/MapScreen.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import GeolocationMap from '../components/geolocation/GeoLocationMap';
import { createMarker, MapMarker } from '../components/geolocation/MapMarker';
import { LocationCoords } from '../hooks/useGeolocation';
import { Picker } from '@react-native-picker/picker';
import { colors, fonts } from '../styles/theme';
import { fetchRouteGeo } from '../lib/api';
import { useRoute } from '@react-navigation/native';
import bbox from '@turf/bbox';
import { Feature, FeatureCollection, Geometry } from 'geojson';

type LatLng = [number, number];

const MapScreen: React.FC = () => {
  const [layer, setLayer] = useState('osm');
  const [tracks, setTracks] = useState<LatLng[][]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  // Default map center until bbox is calculated
  const [initialCenter, setInitialCenter] = useState<LocationCoords>({
    lat: 43.07598420667566,
    lng: -87.88549477499282,
  });

  // 👇 get selected route IDs from navigation
  const route = useRoute<any>();
  const routeIds: number[] = route.params?.routeIds ?? [];

  const mapLayers: Record<string, any> = {
    osm: {
      baseLayerName: 'OpenStreetMap',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
    },
    opentopo: {
      baseLayerName: 'OpenTopoMap',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '© OpenTopoMap contributors',
    },
    cyclosm: {
      baseLayerName: 'CyclOSM',
      url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors © CyclOSM',
    },
  };

  const staticMarkers: MapMarker[] = [
    createMarker(
      { lat: 43.07598420667566, lng: -87.88549477499282 },
      'BUILDING',
      'UWM',
      '🏫',
      'uwm-building'
    ),
  ];

  const handleLocationChange = (location: LocationCoords) => {
    console.log('User location updated:', location);
  };

  const handleLocationError = (error: string) => {
    console.warn('Location error in MapScreen:', error);
    Alert.alert(
      'Location Error',
      'Unable to get your location. Using default map view.',
      [{ text: 'OK' }]
    );
  };

  // --- FETCH SELECTED ROUTE TRACKS ---
  useEffect(() => {
    if (routeIds.length === 0) return;

    let alive = true;
    (async () => {
      try {
        setLoadingTracks(true);
        const fetchedTracks: LatLng[][] = [];
        let allCoords: [number, number][] = [];

        for (const id of routeIds) {
          console.log(`[MapScreen] Fetching GeoJSON for route ${id}`);
          const geo = await fetchRouteGeo(id);

          if (!geo) {
            console.warn(`⚠️ No GeoJSON returned for route ${id}`);
            continue;
          }
        console.log('[DEBUG] GeoJSON type:', geo.type);
        if (geo.type === 'FeatureCollection') {
          console.log('[DEBUG] Number of features:', geo.features.length);
          console.log('[DEBUG] First feature geometry type:', geo.features[0]?.geometry?.type);
          console.log('[DEBUG] First 5 coords:', geo.features[0]?.geometry?.coordinates.slice(0,5));
        }

          console.log(
            `[MapScreen] Received GeoJSON for ${id}:`,
            JSON.stringify(geo).slice(0, 150) + '…'
          );

          // ✅ Flatten FeatureCollection / Feature / Geometry
          const routeTracks = flattenToLatLng(geo);
          console.log('[DEBUG] routeTracks length:', routeTracks.length);
          console.log('[DEBUG] First route track first 5 points:', routeTracks[0]?.slice(0,5));

          if (routeTracks.length > 0) {
            fetchedTracks.push(...routeTracks);
            // collect all coords for bbox
            for (const segment of routeTracks) {
              allCoords.push(...segment.map(([lat, lng]) => [lng, lat])); // invert for bbox
            }
          }
        }

        if (alive) {
          setTracks(fetchedTracks);

          // 🧭 Center map on bounding box of all segments
          if (allCoords.length > 0) {
            const [minX, minY, maxX, maxY] = bbox({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: allCoords,
              },
              properties: {},
            });

            const centerLat = (minY + maxY) / 2;
            const centerLng = (minX + maxX) / 2;
            console.log(`[MapScreen] Centering map to bbox center (${centerLat}, ${centerLng})`);
            setInitialCenter({ lat: centerLat, lng: centerLng });
          }
        }
      } catch (err) {
        console.error('Failed to load tracks:', err);
        Alert.alert('Error', 'Failed to load route tracks');
      } finally {
        if (alive) setLoadingTracks(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [routeIds]);

  return (
    <View style={styles.container}>
      <GeolocationMap
        initialCenter={initialCenter}
        initialZoom={14}
        staticMarkers={staticMarkers}
        showUserLocation={true}
        trackUserLocation={false}
        onLocationChange={handleLocationChange}
        onLocationError={handleLocationError}
        mapLayers={[mapLayers[layer]]}
        tracks={tracks}
      />

      <View style={styles.layerPicker}>
        <Picker
          selectedValue={layer}
          onValueChange={(val) => setLayer(val)}
          style={{ ...fonts.body, color: colors.textPrimary }}
          dropdownIconColor={colors.accent}
        >
          <Picker.Item label="OpenStreetMap" value="osm" />
          <Picker.Item label="OpenTopoMap" value="opentopo" />
          <Picker.Item label="CyclOSM" value="cyclosm" />
        </Picker>
      </View>
    </View>
  );
};

/**
 * flattenToLatLng()
 * Converts GeoJSON FeatureCollection / Feature / Geometry into LatLng[][] arrays for leaflet
 */
function flattenToLatLng(geo: FeatureCollection | Feature | Geometry): LatLng[][] {
  if (!geo) return [];

  if (geo.type === 'FeatureCollection') {
    return geo.features.flatMap((f) => flattenToLatLng(f));
  }

  if (geo.type === 'Feature') {
    return flattenToLatLng(geo.geometry);
  }

  if (geo.type === 'LineString') {
    return [geo.coordinates.map((xy: number[]) => [xy[1], xy[0]])];
  }

  if (geo.type === 'MultiLineString') {
    return geo.coordinates.map((seg: number[][]) =>
      seg.map((xy) => [xy[1], xy[0]])
    );
  }

  return [];
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  layerPicker: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 180,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
  },
});

export default MapScreen;
