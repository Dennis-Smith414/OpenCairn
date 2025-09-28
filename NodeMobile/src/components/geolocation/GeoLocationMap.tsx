import React, { useState, useEffect } from 'react';
import { LeafletView } from 'react-native-leaflet-view';
import { StyleSheet, View } from 'react-native';
import { useGeolocation, LocationCoords, GeolocationOptions } from '../../hooks/useGeolocation';
import { MapMarker, addOrUpdateUserLocationMarker } from './MapMarker';


export interface GeolocationMapProps {
  initialCenter?: LocationCoords;
  initialZoom?: number;
  staticMarkers?: MapMarker[];
  showUserLocation?: boolean;
  trackUserLocation?: boolean;
  geolocationOptions?: GeolocationOptions;
  onLocationChange?: (location: LocationCoords) => void;
  onLocationError?: (error: string) => void;
  mapLayers?: Array<{
    baseLayerName: string;
    url: string;
    attribution: string;
  }>;
  tracks?: Array<[number, number][]>; // array of routes (each a list of [lat,lng])
  style?: object;
}

export const GeolocationMap: React.FC<GeolocationMapProps> = ({
  initialCenter = { lat: 43.07598420667566, lng: -87.88549477499282 },
  initialZoom = 17,
  staticMarkers = [],
  showUserLocation = true,
  trackUserLocation = false,
  geolocationOptions = {},
  onLocationChange,
  onLocationError,
  mapLayers = [
    {
      baseLayerName: 'OpenStreetMap',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
    },
  ],
  style,
}) => {
  const [mapCenter, setMapCenter] = useState<LocationCoords>(initialCenter);
  const [allMarkers, setAllMarkers] = useState<MapMarker[]>(staticMarkers);
  const [watchId, setWatchId] = useState<number | null>(null);

  // Use geolocation hook
  const {
    location,
    loading,
    error,
    permissionGranted,
    getCurrentLocation,
    startWatching,
    stopWatching,
    requestPermission,
  } = useGeolocation({
    watchPosition: false, // We mannually do this
    ...geolocationOptions,
  });

  // Handle location updates
  useEffect(() => {
    if (location) {
      // Update map center to user location
      setMapCenter(location);
      
      // Add or update user location marker
      if (showUserLocation) {
        setAllMarkers(prevMarkers => 
          addOrUpdateUserLocationMarker(prevMarkers, location)
        );
      }
      
      // Call callback if provided
      onLocationChange?.(location);
    }
  }, [location, showUserLocation, onLocationChange]);

  // Handle errors
  useEffect(() => {
    if (error) {
      onLocationError?.(error);
    }
  }, [error, onLocationError]);

  // Initialize geolocation
  useEffect(() => {
    if (showUserLocation) {
      requestPermission().then((hasPermission) => {
        if (hasPermission) {
          getCurrentLocation();
          
          // Start tracking if enabled
          if (trackUserLocation) {
            const id = startWatching();
            setWatchId(id);
          }
        }
      });
    }

    // Cleanup on unmount
    return () => {
      if (watchId) {
        stopWatching(watchId);
      }
    };
  }, [showUserLocation, trackUserLocation]);

  // Update static markers when props change
  useEffect(() => {
    setAllMarkers(prevMarkers => {
      // Keep user location marker, replace static ones
      const userMarker = prevMarkers.find(marker => marker.id === 'user-location');
      return userMarker ? [userMarker, ...staticMarkers] : staticMarkers;
    });
  }, [staticMarkers]);

  // Convert MapMarker to LeafletView format
  const leafletMarkers = allMarkers.map(marker => ({
    position: marker.position,
    title: marker.title,
    icon: marker.icon,
  }));

  // Convert tracks into LeafletView shapes
  const leafletShapes = (tracks ?? []).map((track, idx) => ({
    shapeType: 'polyline',
    shapeId: `track-${idx}`,
    positions: track,
    color: '#FF0000',      // red line  - change color options later
    weight: 4,
  }));


  return (
    <View style={[styles.container, style]}>
      <LeafletView
        mapCenterPosition={mapCenter}
        zoom={initialZoom}
        mapLayers={mapLayers}
        mapMarkers={leafletMarkers}
        mapShapes={leafletShapes}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default GeolocationMap;