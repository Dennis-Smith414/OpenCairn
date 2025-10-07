// src/components/GeolocationMap/GeolocationMap.tsx
import React, { useState, useEffect } from 'react';
import { LeafletView } from 'react-native-leaflet-view';
import { View } from 'react-native';
import { useGeolocation } from '../../hooks/useGeolocation'; // Adjust path
import { LocationCoords, GeolocationMapProps, MapMarker } from './GeoLocationMap.types.ts';
import { DEFAULT_CENTER, DEFAULT_ZOOM, DEFAULT_MAP_LAYERS } from './GeolocationMap.constants';
import { addOrUpdateUserLocationMarker, generateShapes } from './utils/mapUtils';
import { styles } from './GeolocationMap.styles';

const GeolocationMap: React.FC<GeolocationMapProps> = ({
                                                           initialCenter = DEFAULT_CENTER,
                                                           initialZoom = DEFAULT_ZOOM,
                                                           staticMarkers = [],
                                                           showUserLocation = true,
                                                           centerOnUserLocation = false,
                                                           trackUserLocation = false,
                                                           geolocationOptions = {},
                                                           onLocationChange,
                                                           onLocationError,
                                                           mapLayers = DEFAULT_MAP_LAYERS,
                                                           tracks = [],
                                                           style,
                                                       }) => {
    const [mapCenter, setMapCenter] = useState<LocationCoords>(initialCenter);
    const [allMarkers, setAllMarkers] = useState<MapMarker[]>(staticMarkers);
    const [watchId, setWatchId] = useState<number | null>(null);
    const [hasInitialCenter, setHasInitialCenter] = useState(false);

    const {
        location,
        error,
        getCurrentLocation,
        startWatching,
        stopWatching,
        requestPermission,
    } = useGeolocation({
        watchPosition: false,
        ...geolocationOptions,
    });

    useEffect(() => {
        if (location) {
            console.log('[GeolocationMap] GOT LOCATION:', location);
            if (showUserLocation) {
                setAllMarkers(prev => addOrUpdateUserLocationMarker(prev, location));
            }
            onLocationChange?.(location);

            if (trackUserLocation || (centerOnUserLocation && !hasInitialCenter)) {
                setMapCenter(location);
            }
            if (centerOnUserLocation && !hasInitialCenter) {
                setHasInitialCenter(true);
            }
        }
    }, [location, showUserLocation, centerOnUserLocation, trackUserLocation, hasInitialCenter, onLocationChange]);

    useEffect(() => {
        if (error) {
            onLocationError?.(error);
        }
    }, [error, onLocationError]);

    useEffect(() => {
        if (showUserLocation) {
            requestPermission().then((hasPermission: any) => {
                if (hasPermission) {
                    getCurrentLocation();
                    if (trackUserLocation) {
                        const id = startWatching();
                        setWatchId(id);
                    }
                }
            });
        }
        return () => {
            if (watchId) stopWatching(watchId);
        };
    }, [showUserLocation, trackUserLocation, requestPermission, getCurrentLocation, startWatching, stopWatching]);

    useEffect(() => {
        setAllMarkers(prev => {
            const userMarker = prev.find(m => m.id === 'user-location');
            return userMarker ? [userMarker, ...staticMarkers] : staticMarkers;
        });
    }, [staticMarkers]);

    const leafletMarkers = allMarkers.map(marker => ({
        position: marker.position,
        title: marker.title,
        icon: marker.icon,
    }));

    const leafletShapes = generateShapes(tracks);

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

export default GeolocationMap;