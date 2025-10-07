// src/components/GeolocationMap/utils/mapUtils.ts
import { LocationCoords, MapMarker } from '../GeoLocationMap.types.ts';
import { MapShape, MapShapeType, LatLng } from 'react-native-leaflet-view';
import { MarkerTypes } from '../GeolocationMap.constants';

export const createMarker = (
    position: LocationCoords,
    type: keyof typeof MarkerTypes,
    customTitle?: string,
    customIcon?: string,
    id?: string
): MapMarker => ({
    position,
    title: customTitle || MarkerTypes[type].title,
    icon: customIcon || MarkerTypes[type].icon,
    id,
});

export const createUserLocationMarker = (position: LocationCoords): MapMarker =>
    createMarker(position, 'USER_LOCATION', undefined, undefined, 'user-location');

export const updateUserLocationMarker = (
    markers: MapMarker[],
    newPosition: LocationCoords
): MapMarker[] => {
    return markers.map(marker =>
        marker.id === 'user-location'
            ? { ...marker, position: newPosition }
            : marker
    );
};

export const addOrUpdateUserLocationMarker = (
    markers: MapMarker[],
    position: LocationCoords
): MapMarker[] => {
    const hasUserMarker = markers.some(marker => marker.id === 'user-location');
    if (hasUserMarker) {
        return updateUserLocationMarker(markers, position);
    } else {
        return [...markers, createUserLocationMarker(position)];
    }
};

export function generateShapes(tracks: [number, number][][]): MapShape[] {
    return tracks.map((track, idx) => ({
        shapeType: MapShapeType.POLYLINE,
        shapeId: `track-${idx}`,
        positions: track.map(([lat, lng]) => ({ lat, lng })) as LatLng[],
        color: '#FF0000',
        weight: 4,
    }));
}