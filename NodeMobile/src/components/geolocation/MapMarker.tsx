// src/screens/MapScreen.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { useRouteSelection } from '../../context/RouteSelectionContext';
import { fetchRouteGeo } from '../../lib/api';
import { flattenToLatLng } from '../../utils/geoUtils';
import GeolocationMap from '../geolocation/GeoLocationMap';
import { colors } from '../../styles/theme';

const MapScreen: React.FC = () => {
    const { selectedRouteIds } = useRouteSelection();
    const routeIdsKey = selectedRouteIds.join(',');

    const [tracks, setTracks] = useState<[number, number][][]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                setLoading(true);
                setErr(null);

                if (selectedRouteIds.length === 0) {
                    if (alive) setTracks([]);
                    return;
                }

                const collected: [number, number][][] = [];
                for (const id of selectedRouteIds) {
                    console.log(`[MapScreen] Fetching GeoJSON for route ${id}`);
                    const geo = await fetchRouteGeo(id);
                    if (!geo) continue;
                    collected.push(flattenToLatLng(geo));
                }
                if (alive) setTracks(collected);
            } catch (e: any) {
                if (alive) setErr(String(e?.message || e));
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => { alive = false; };
    }, [routeIdsKey]);

    return (
        <View style={{ flex: 1 }}>
            <GeolocationMap
                tracks={tracks}
                showUserLocation={true}
                centerOnUserLocation={true}
                trackUserLocation={true}
            />

            {loading && (
                <View style={styles.overlay}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.msg}>Loading route tracks…</Text>
                </View>
            )}
            {!!err && (
                <View style={styles.overlay}>
                    <Text style={[styles.msg, styles.err]}>Error: {err}</Text>
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
    msg: { marginTop: 8 },
    err: { color: '#b00020', textAlign: 'center' },
});

export default MapScreen;

export class addOrUpdateUserLocationMarker {
}

export class MapMarker {
}