// src/hooks/useGeolocation.tsx
import { useState, useEffect } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

// Types
export interface LocationCoords {
  lat: number;
  lng: number;
  // Reported horizontal accuracy radius in metres, straight from the platform.
  // Used to scale off-route colour feedback (a 30 m offset means something very
  // different with a ±5 m fix than with a ±40 m one). null when unreported.
  accuracy: number | null;
  // Course over ground in degrees from true north, straight from the platform.
  // null when the platform has none — Android reports 0 or -1 while stationary,
  // and callers must carry the previous heading forward rather than snap north.
  heading: number | null;
  // Ground speed (m/s), null when unreported or stationary.
  speed: number | null;
  // When the platform COMPUTED this fix (epoch ms), not when JS received it —
  // easily a few hundred ms apart.
  ts: number;
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

// Reads a fix verbatim; derives nothing.
//
// Course is undefined at zero speed, but Android reports bearing 0 (due north)
// rather than "unknown" when stationary — passing that on swings the arrow north
// every time you stop. So a fix with no usable speed reports heading: null.
const toLocationCoords = (position: any): LocationCoords => {
  const c = position?.coords ?? {};

  const accuracy =
    typeof c.accuracy === "number" && Number.isFinite(c.accuracy) && c.accuracy > 0
      ? c.accuracy
      : null;

  const hasCourse =
    typeof c.speed === "number" && Number.isFinite(c.speed) && c.speed > 0;
  const heading =
    hasCourse &&
    typeof c.heading === "number" &&
    Number.isFinite(c.heading) &&
    c.heading >= 0
      ? ((c.heading % 360) + 360) % 360
      : null;

  // Epoch ms on both platforms. Falls back to arrival when a provider omits it.
  const ts =
    typeof position?.timestamp === "number" && Number.isFinite(position.timestamp)
      ? position.timestamp
      : Date.now();

  // Zero speed means stationary-or-unknown and carries no direction.
  const speed = hasCourse ? c.speed : null;

  // Raw fix logging for offline analysis of a real walk. __DEV__ only.
  //   adb logcat -s ReactNativeJS:V | grep -o 'OC_FIX .*' > trail.log
  if (__DEV__) {
    console.log(
      "OC_FIX " +
        JSON.stringify({
          lat: c.latitude,
          lng: c.longitude,
          acc: accuracy,
          hdg: heading,
          spd: speed,
          // Unfiltered: the fields above are nulled when there's no course.
          rawHdg: typeof c.heading === "number" ? c.heading : null,
          rawSpd: typeof c.speed === "number" ? c.speed : null,
          fixTs: ts,
          rxTs: Date.now(),
        }),
    );
  }

  return { lat: c.latitude, lng: c.longitude, accuracy, heading, speed, ts };
};

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
          setLocation(toLocationCoords(position));
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
        setLocation(toLocationCoords(position));
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