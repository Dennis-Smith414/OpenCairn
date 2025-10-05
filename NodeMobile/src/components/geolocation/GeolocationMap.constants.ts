// src/components/GeolocationMap/GeolocationMap.constants.ts
import { LocationCoords, MapMarker } from './GeoLocationMap.types.ts';

export const DEFAULT_CENTER: LocationCoords = { lat: 43.07598420667566, lng: -87.88549477499282 };
export const DEFAULT_ZOOM = 17;

export const DEFAULT_MAP_LAYERS = [
    {
        baseLayerName: 'OpenStreetMap',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
    },
];

export const MarkerTypes = {
    USER_LOCATION: {
        icon: '📱',
        title: 'Your Location',
    },
    STATIC_PIN: {
        icon: '📍',
        title: 'Location Pin',
    },
    DESTINATION: {
        icon: '🎯',
        title: 'Destination',
    },
    BUILDING: {
        icon: '🏢',
        title: 'Building',
    },
} as const;