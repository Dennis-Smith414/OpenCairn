// screens/MapScreen.tsx
import React from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import GeolocationMap from '../components/geolocation/GeoLocationMap';
import { createMarker, MapMarker } from '../components/geolocation/MapMarker';
import { LocationCoords } from '../hooks/useGeolocation';

const MapScreen: React.FC = () => {
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
          showErrorAlert: false, // errors handled in handleLocationError
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default MapScreen;