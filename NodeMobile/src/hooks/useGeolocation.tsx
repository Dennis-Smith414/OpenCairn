// src/hooks/useGeolocation.tsx
import { useState, useEffect } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

// Types
export interface LocationCoords {
  lat: number;
  lng: number;
}

export interface GeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  watchPosition?: boolean;
  distanceFilter?: number;
  interval?: number;
  showPermissionAlert?: boolean;
  showErrorAlert?: boolean;
}

export interface UseGeolocationReturn {
  location: LocationCoords | null;
  loading: boolean;
  error: string | null;
  permissionGranted: boolean;
  getCurrentLocation: () => Promise<void>;
  startWatching: () => number | null;
  stopWatching: (watchId: number) => void;
  requestPermission: () => Promise<boolean>;
}

export const useGeolocation = (options: GeolocationOptions = {}): UseGeolocationReturn => {
  // Default options
  const defaultOptions: Required<GeolocationOptions> = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 10000,
    watchPosition: false,
    distanceFilter: 10,
    interval: 5000,
    showPermissionAlert: true,
    showErrorAlert: true,
    ...options
  };

  // State
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  // Request Android permissions
  const requestPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs access to your location.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        
        const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
        setPermissionGranted(isGranted);
        
        if (!isGranted && defaultOptions.showPermissionAlert) {
          Alert.alert('Permission Denied', 'Location permission is required.');
        }
        
        return isGranted;
      } catch (err) {
        console.warn('Permission request error:', err);
        setError('Permission request failed');
        return false;
      }
    } else {
      // iOS handles permissions automatically
      setPermissionGranted(true);
      return true;
    }
  };

  // Get current position once
  const getCurrentLocation = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    const hasPermission = permissionGranted || await requestPermission();
    if (!hasPermission) {
      setLoading(false);
      return;
    }

    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        (position) => {
          const coords: LocationCoords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setLocation(coords);
          setLoading(false);
          setError(null);
          resolve();
        },
        (error) => {
          const errorMessage = `Location error: ${error.message}`;
          setError(errorMessage);
          setLoading(false);
          
          if (defaultOptions.showErrorAlert) {
            Alert.alert('Location Error', errorMessage);
          }
          
          console.warn('Geolocation error:', error);
          resolve();
        },
        {
          enableHighAccuracy: defaultOptions.enableHighAccuracy,
          timeout: defaultOptions.timeout,
          maximumAge: defaultOptions.maximumAge,
        }
      );
    });
  };

  // Start watching position
  const startWatching = (): number | null => {
    if (!permissionGranted) {
      console.warn('Cannot start watching: permission not granted');
      return null;
    }

    const watchId = Geolocation.watchPosition(
      (position) => {
        const coords: LocationCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setLocation(coords);
        setError(null);
      },
      (error) => {
        const errorMessage = `Watch position error: ${error.message}`;
        setError(errorMessage);
        console.warn('Watch position error:', error);
      },
      {
        enableHighAccuracy: defaultOptions.enableHighAccuracy,
        distanceFilter: defaultOptions.distanceFilter,
        interval: defaultOptions.interval,
      }
    );

    return watchId;
  };

  // Stop watching position
  const stopWatching = (watchId: number): void => {
    Geolocation.clearWatch(watchId);
  };

  // Auto-request permission on mount if watchPosition is enabled
  useEffect(() => {
    if (defaultOptions.watchPosition) {
      requestPermission();
    }
  }, []);

  return {
    location,
    loading,
    error,
    permissionGranted,
    getCurrentLocation,
    startWatching,
    stopWatching,
    requestPermission,
  };
};