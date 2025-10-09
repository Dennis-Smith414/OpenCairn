// src/screens/MapScreen.tsx
import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { useNavigation } from "@react-navigation/native";
import { useRouteSelection } from '../context/RouteSelectionContext';
import { useGeolocation } from '../hooks/useGeolocation';
import { fetchRouteGeo } from '../lib/api';
import { flattenToLatLng } from '../utils/geoUtils';
import LeafletMap, { LatLng } from '../components/LeafletMap/LeafletMap';
import { colors } from '../styles/theme';
import { fetchWaypoints } from "../lib/waypoints";

const DEFAULT_CENTER: LatLng = [37.7749, -122.4194];
const DEFAULT_ZOOM = 15;

const MapScreen: React.FC = () => {
    const { selectedRouteIds } = useRouteSelection();
    const navigation = useNavigation<any>();

    const [coords, setCoords] = useState<LatLng[]>([]);
    const [waypoints, setWaypoints] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [initialLocationLoaded, setInitialLocationLoaded] = useState(false);

    const watchIdRef = useRef<number | null>(null);

    const {
        location,
        loading: locationLoading,
        error: locationError,
        getCurrentLocation,
        requestPermission,
        startWatching,
        stopWatching,
    } = useGeolocation({
        enableHighAccuracy: true,
        distanceFilter: 5,
        interval: 3000,
        showPermissionAlert: true,
        showErrorAlert: false,
    });

    // Initialize location tracking
    useEffect(() => {
        let mounted = true;

        const initLocationTracking = async () => {
            const hasPermission = await requestPermission();
            if (!hasPermission || !mounted) return;

            const watchId = startWatching();
            if (watchId !== null) {
                watchIdRef.current = watchId;
            } else {
                // Fallback to periodic updates
                const intervalId = setInterval(() => {
                    getCurrentLocation();
                }, 10000);
                watchIdRef.current = intervalId as any;
            }
        };

        initLocationTracking();

        return () => {
            mounted = false;
            if (watchIdRef.current !== null) {
                stopWatching(watchIdRef.current);
            }
        };
    }, []);

    // Track initial location load
    useEffect(() => {
        if (location && !initialLocationLoaded) {
            setInitialLocationLoaded(true);
        }
    }, [location, initialLocationLoaded]);

    // Fetch route coordinates
    useEffect(() => {
        let mounted = true;

        const fetchRoutes = async () => {
            try {
                setLoading(true);
                setError(null);

                if (selectedRouteIds.length === 0) {
                    if (mounted){
                        setCoords([]);
                        setWaypoints([]);
                    }
                    return;
                }

                const allCoords: LatLng[] = [];
                for (const id of selectedRouteIds) {
                    const geo = await fetchRouteGeo(id);
                    if (geo) {
                        allCoords.push(...flattenToLatLng(geo));
                    }
                }

                if (mounted) setCoords(allCoords);
            } catch (e: any) {
                if (mounted) setError(e?.message || 'Failed to load routes');
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchRoutes();

        return () => { mounted = false; };
    }, [selectedRouteIds.join(',')]);


    useEffect(() => {
        let mounted = true;

        const loadWaypoints = async () => {
          if (selectedRouteIds.length === 0) {
            setWaypoints([]);
            return;
          }

          try {
            const all: any[] = [];
            for (const id of selectedRouteIds) {
              const wps = await fetchWaypoints(id);
              all.push(...wps);
            }
            if (mounted) {
              setWaypoints(all);
              console.log(`[MapScreen] Loaded ${all.length} waypoints`);
            }
          } catch (err: any) {
            console.error("Failed to fetch waypoints:", err);
          }
        };

        loadWaypoints();

        return () => { mounted = false; };
      }, [selectedRouteIds.join(",")]);

    // Compute derived values
    const userLocation = location ? [location.lat, location.lng] as LatLng : null;
    const mapCenter = userLocation || DEFAULT_CENTER;
    const showLocationLoading = locationLoading && !initialLocationLoaded;
    const showError = error || (locationError && !initialLocationLoaded);


    const handleMapLongPress = (lat: number, lon: number) => {
      console.log("Long press received:", lat, lon);
      navigation.navigate("WaypointCreate", { lat, lon });
    };

    return (
        <View style={styles.container}>
            <LeafletMap
                coordinates={coords}
                userLocation={userLocation}
                center={mapCenter}
                zoom={DEFAULT_ZOOM}
                onMapLongPress={handleMapLongPress}
                waypoints={waypoints}
            />

            {/* Loading Overlay */}
            {(loading || showLocationLoading) && (
                <View style={styles.overlay}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.overlayText}>
                        {loading ? 'Loading routes…' : 'Getting location...'}
                    </Text>
                </View>
            )}

            {/* Error Overlay */}
            {showError && (
                <View style={styles.overlay}>
                    <Text style={styles.errorText}>
                        {error || locationError}
                    </Text>
                </View>
            )}

            {/* Tracking Indicator */}
            {location && (
                <View style={styles.trackingIndicator}>
                    <Text style={styles.trackingText}>• Tracking</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
    },
    overlayText: {
        marginTop: 12,
        fontSize: 16,
        color: colors.text,
    },
    errorText: {
        color: '#b00020',
        fontSize: 16,
        textAlign: 'center',
        paddingHorizontal: 24,
    },
    trackingIndicator: {
        position: 'absolute',
        top: 16,
        right: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.accent,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    trackingText: {
        color: colors.accent,
        fontSize: 12,
        fontWeight: '600',
    },
});

export default MapScreen;