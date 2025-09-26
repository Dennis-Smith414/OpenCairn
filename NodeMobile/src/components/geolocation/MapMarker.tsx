//import { LocationCoords } from '../../hooks/useGeolocation';
import { LocationCoords } from "../../hooks/useGeolocation";

export interface MapMarker {
  position: LocationCoords;
  title: string;
  icon: string;
  id?: string;
}

export interface MapMarkerProps extends MapMarker {
  onPress?: () => void;
}

//Marker types
//More can be added 
//Please please get rid of the tacky markers
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

//function to create markers
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

//function to create user location marker
export const createUserLocationMarker = (position: LocationCoords): MapMarker =>
  createMarker(position, 'USER_LOCATION', 'Your Location', undefined, 'user-location');

//function to update user location in markers array
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

//function to add user location marker if it doesn't exist
export const addOrUpdateUserLocationMarker = (
markers: MapMarker[], position: LocationCoords,
): MapMarker[] => {
  const hasUserMarker = markers.some(marker => marker.id === 'user-location');
  
  if (hasUserMarker) {
    return updateUserLocationMarker(markers, position);
  } else {
    return [...markers, createUserLocationMarker(position)];
  }
};