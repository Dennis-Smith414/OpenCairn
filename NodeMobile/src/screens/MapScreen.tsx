import React, { useState } from "react";
import { LeafletView } from "react-native-leaflet-view";
import { View, Text } from "react-native";
import { Picker } from "@react-native-picker/picker"; // install if not already: npm install @react-native-picker/picker
import { baseStyles, colors, fonts } from "../styles/theme";

const MapScreen = () => {
  const [layer, setLayer] = useState("opentopo");

  // Define open map layers
  const mapLayers: Record<string, any> = {
    osm: {
      baseLayerName: "OpenStreetMap",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "© OpenStreetMap contributors",
    },
    opentopo: {
      baseLayerName: "OpenTopoMap",
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: "© OpenTopoMap contributors",
    },
    cyclosm: {
      baseLayerName: "CyclOSM",
      url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
      attribution: "© OpenStreetMap contributors © CyclOSM",
    },
  };

  return (
    <View style={baseStyles.container}>
      <LeafletView
        mapCenterPosition={{ lat: 43.0759842, lng: -87.8854947 }}
        zoom={13}
        mapLayers={[mapLayers[layer]]}
        mapMarkers={[
          {
            position: { lat: 43.0759842, lng: -87.8854947 },
            title: "UWM pin",
            icon: "📍",
          },
        ]}
      />

      {/* Dropdown menu for layer selection */}
      <View
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          backgroundColor: colors.backgroundAlt,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.accent,
          width: 180,
        }}
      >
        <Picker
          selectedValue={layer}
          onValueChange={(itemValue) => setLayer(itemValue)}
          style={{
            ...fonts.body,
            color: colors.textPrimary,
            width: "100%",
          }}
          dropdownIconColor={colors.accent}
        >
          <Picker.Item label="OpenStreetMap" value="osm" />
          <Picker.Item label="OpenTopoMap" value="opentopo" />
          <Picker.Item label="CyclOSM" value="cyclosm" />
        </Picker>
      </View>
    </View>
  );
};

export default MapScreen;
