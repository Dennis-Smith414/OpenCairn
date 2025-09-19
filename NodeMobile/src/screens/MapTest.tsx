import React from 'react';
import { LeafletView } from 'react-native-leaflet-view';
import { StyleSheet, View } from 'react-native';


const MapScreen = () => {
  return (
    <View style={styles.container}>
      <LeafletView
        mapCenterPosition={{ lat: 43.07598420667566, lng: -87.88549477499282 }}
        zoom={17}
        mapLayers={[
          {
            baseLayerName: 'OpenStreetMap',
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
          },
        ]}
        mapMarkers={[
          {
            position: { lat: 43.07598420667566, lng: -87.88549477499282 },
            title: 'UWM pin',
            icon: '📍',
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default MapScreen;