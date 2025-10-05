// src/components/GeolocationMap/GeolocationMap.types.ts
import { GeolocationOptions } from '../../hooks/useGeolocation'; // Adjust path

export interface LocationCoords {
    lat: number;
    lng: number;
}

export interface GeolocationMapProps {
    initialCenter?: LocationCoords;
    initialZoom?: number;
    staticMarkers?: MapMarker[];
    showUserLocation?: boolean;
    centerOnUserLocation?: boolean;
    trackUserLocation?: boolean;
    geolocationOptions?: GeolocationOptions;
    onLocationChange?: (location: LocationCoords) => void;
    onLocationError?: (error: string) => void;
    mapLayers?: Array<{
        baseLayerName: string;
        url: string;
        attribution: string;
    }>;
    tracks?: [number, number][][];
    style?: object;
}

export interface MapMarker {
    position: LocationCoords;
    title: string;
    icon: string;
    id?: string;
}