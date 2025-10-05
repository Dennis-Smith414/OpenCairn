import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { useRouteSelection } from '../context/RouteSelectionContext';
import { useGeolocation } from '../hooks/useGeolocation';
import { fetchRouteGeo } from '../lib/api';
import { flattenToLatLng } from '../utils/geoUtils';
import LeafletMap, { LatLng } from '../components/LeafletMap/LeafletMap';
import { colors } from '../styles/theme';

const MapScreen: React.FC = () => {
    const { selectedRouteIds } = useRouteSelection();
    const routeIdsKey = selectedRouteIds.join(',');

    const [coords, setCoords] = useState<LatLng[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
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

    useEffect(() => {
        const initLocationTracking = async () => {
            console.log('[MapScreen] Initializing location tracking...');

            const hasPermission = await requestPermission();
            if (hasPermission) {
                console.log('[MapScreen] Permission granted, starting continuous tracking...');

                const watchId = startWatching();
                if (watchId !== null) {
                    watchIdRef.current = watchId;
                    console.log('[MapScreen] Continuous location tracking started, watchId:', watchId);
                } else {
                    console.warn('[MapScreen] Failed to start continuous tracking, falling back to periodic updates');
                    const intervalId = setInterval(() => {
                        console.log('[MapScreen] Periodic location update');
                        getCurrentLocation();
                    }, 10000);

                    watchIdRef.current = intervalId as any;
                }
            } else {
                console.log('[MapScreen] Location permission denied');
            }
        };

        initLocationTracking();

        return () => {
            if (watchIdRef.current !== null) {
                if (typeof watchIdRef.current === 'number') {
                    stopWatching(watchIdRef.current);
                    console.log('[MapScreen] Stopped location watching');
                } else {
                    clearInterval(watchIdRef.current);
                    console.log('[MapScreen] Stopped periodic location updates');
                }
            }
        };
    }, []);

    useEffect(() => {
        if (location && !initialLocationLoaded) {
            setInitialLocationLoaded(true);
        }
    }, [location, initialLocationLoaded]);

    useEffect(() => {
        if (location) {
            console.log('[MapScreen] Location updated:', location);
        }
    }, [location]);

    useEffect(() => {
        if (locationError) {
            console.error('[MapScreen] Location error:', locationError);
        }
    }, [locationError]);

    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                setLoading(true);
                setErr(null);

                if (selectedRouteIds.length === 0) {
                    if (alive) setCoords([]);
                    return;
                }

                const collected: LatLng[] = [];
                for (const id of selectedRouteIds) {
                    console.log(`[MapScreen] Fetching GeoJSON for route ${id}`);
                    const geo = await fetchRouteGeo(id);
                    if (!geo) continue;
                    collected.push(...flattenToLatLng(geo));
                }
                if (alive) setCoords(collected);
            } catch (e: any) {
                if (alive) setErr(String(e?.message || e));
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => { alive = false; };
    }, [routeIdsKey]);

    const userLocation = location ? [location.lat, location.lng] : null;
    const mapCenter = location ? [location.lat, location.lng] : [37.7749, -122.4194];

    const showLocationLoading = locationLoading && !initialLocationLoaded;

    return (
        <View style={{ flex: 1 }}>
            <LeafletMap
                coordinates={coords}
                userLocation={userLocation}
                center={mapCenter}
                zoom={15}
            />

            {(loading || showLocationLoading) && (
                <View style={styles.overlay}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.msg}>
                        {loading ? 'Loading route tracks…' : 'Getting location...'}
                    </Text>
                </View>
            )}

            {!!err && (
                <View style={styles.overlay}>
                    <Text style={[styles.msg, styles.err]}>Error: {err}</Text>
                </View>
            )}

            {!!locationError && !initialLocationLoaded && (
                <View style={styles.overlay}>
                    <Text style={[styles.msg, styles.err]}>Location: {locationError}</Text>
                </View>
            )}

            {location && (
                <View style={styles.trackingIndicator}>
                    <Text style={styles.trackingText}>
                        • Tracking your location
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        inset: 0 as any,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.6)',
    },
    msg: {
        marginTop: 8,
        fontSize: 16,
    },
    err: {
        color: '#b00020',
        textAlign: 'center',
        fontSize: 16,
    },
    trackingIndicator: {
        position: 'absolute',
        top: 16,
        right: 16,
        backgroundColor: 'rgba(255,255,255,0.9)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.accent,
    },
    trackingText: {
        color: colors.accent,
        fontSize: 12,
        fontWeight: '600',
    },
});

export default MapScreen;