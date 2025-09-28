// screens/MapScreen.tsx
import React, { useState } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import GeolocationMap from '../components/geolocation/GeoLocationMap';
import { createMarker, MapMarker } from '../components/geolocation/MapMarker';
import { LocationCoords } from '../hooks/useGeolocation';
import { Picker } from '@react-native-picker/picker'; // npm install @react-native-picker/picker
import { colors, fonts } from '../styles/theme';
import { fetchRouteGeo } from '../lib/api';


type LatLng = [number, number];


const MapScreen: React.FC = () => {
  const [layer, setLayer] = useState('osm');
  const [tracks, setTracks] = useState<LatLng[][]>([]); // 👈 holds multiple routes
  const [loadingTracks, setLoadingTracks] = useState(false);

  // Define available layers (free + open)
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

  // Define static markers
  const staticMarkers: MapMarker[] = [
    createMarker(
      { lat: 43.07598420667566, lng: -87.88549477499282 },
      'BUILDING',
      'UWM',
      '🏫',
      'uwm-building'
    ),
  ];

  // Handle location changes
  const handleLocationChange = (location: LocationCoords) => {
    console.log('User location updated:', location);
  };

  // Handle location errors
  const handleLocationError = (error: string) => {
    console.warn('Location error in MapScreen:', error);
    Alert.alert(
      'Location Error',
      'Unable to get your location. Using default map view.',
      [{ text: 'OK' }]
    );
  };

// Fetch one or more routes and store their coords
  useEffect(() => {
    const routeIds = [1]; // replace with all route IDs to be rendered
    let alive = true;
    (async () => {
      try {
        setLoadingTracks(true);
        const fetchedTracks: LatLng[][] = [];
        for (const id of routeIds) {
          const geo = await fetchRouteGeo(id);
          const coords = flattenToLatLng(geo.geometry);
          fetchedTracks.push(coords);
        }
        if (alive) setTracks(fetchedTracks);
      } catch (err) {
        console.error('Failed to load tracks:', err);
      } finally {
        if (alive) setLoadingTracks(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);




  return (
    <View style={styles.container}>
      <GeolocationMap
        initialCenter={{ lat: 43.07598420667566, lng: -87.88549477499282 }}
        initialZoom={17}
        staticMarkers={staticMarkers}
        showUserLocation={true}
        trackUserLocation={true}
        onLocationChange={handleLocationChange}
        onLocationError={handleLocationError}
        geolocationOptions={{
          enableHighAccuracy: true,
          timeout: 15000,
          distanceFilter: 10,
          interval: 5000,
          showPermissionAlert: true,
          showErrorAlert: false,
        }}
        mapLayers={[mapLayers[layer]]} // inject active map layer
        tracks={tracks} // prop to draw GPX/GeoJSON poly lines
      />

      {/* Dropdown menu (top-right corner) */}
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

//parses GPX into a leaflet - compatible format
function flattenToLatLng(geom: any): LatLng[] {
  if (geom.type === 'LineString') {
    return geom.coordinates.map((xy: number[]) => [xy[1], xy[0]]);
  }
  if (geom.type === 'MultiLineString') {
    return geom.coordinates.flatMap((seg: number[][]) =>
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
