import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { Picker } from "@react-native-picker/picker";
import { baseStyles, colors } from "../styles/theme";
import { createWaypoint } from "../lib/waypoints";
import { useRouteSelection } from "../context/RouteSelectionContext";

export default function WaypointCreateScreen({ navigation }: any) {
    const route = useRoute<any>();
    const { selectedRouteIds } = useRouteSelection();

    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [lat, setLat] = useState("");
    const [lon, setLon] = useState("");
    const [routeId, setRouteId] = useState<number | undefined>(
    selectedRouteIds[0]
  );
  const [type, setType] = useState("generic");

  useEffect(() => {
      if (route.params?.lat && route.params?.lon) {
        setLat(route.params.lat.toFixed(5).toString());
        setLon(route.params.lon.toFixed(5).toString());
      }
    }, [route.params]);

  // Scroll picker options for types (can map to icons later)
  const waypointTypes = [
    { label: "Generic", value: "generic" },
    { label: "Water", value: "water" },
    { label: "Campsite", value: "campsite" },
    { label: "Road / Access Point", value: "road-access-point" },
    { label: "Intersection", value: "intersection" },
    { label: "Hazard", value: "hazard" },
    {label: "Landmark", value: "landmark"},
    {label: "Parking / Trailhead", value: "parking-trailhead"},
  ];

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert("Missing Field", "Please enter a name for the waypoint.");
      return;
    }
    if (!routeId) {
      Alert.alert("Missing Route", "Please select a route to add this waypoint to.");
      return;
    }

    try {
        // ⚠️ TEMPORARY AUTH BYPASS
        // TODO: Replace with a real token from user context after login integration
        const token = "demo-token-bypass";

        const waypointData = {
            route_id: routeId,
            name,
            description: desc,
            lat: parseFloat(lat) || 0,
            lon: parseFloat(lon) || 0,
            type,
        };

        console.log("Creating waypoint:", waypointData);

        const result = await createWaypoint(token, waypointData);
        console.log("Waypoint created:", result);

        Alert.alert("Success", "Waypoint created!");
        navigation.goBack();
        }
        catch (err: any) {
            console.error("Waypoint creation failed:", err);
            Alert.alert("Error", err.message || "Failed to create waypoint.");
        }
    };

  return (
    <ScrollView
      contentContainerStyle={{
        ...baseStyles.container,
        alignItems: "center",
        paddingVertical: 20,
      }}
    >
      <Text style={baseStyles.headerText}>Create Waypoint</Text>

      {/* Name (required) */}
      <TextInput
        placeholder="Name (required)"
        placeholderTextColor={colors.textSecondary}
        style={baseStyles.input}
        value={name}
        onChangeText={setName}
      />

      {/* Description */}
      <TextInput
        placeholder="Description"
        placeholderTextColor={colors.textSecondary}
        style={baseStyles.input}
        value={desc}
        onChangeText={setDesc}
        multiline
      />

      {/* Latitude */}
      <TextInput
        placeholder="Latitude"
        placeholderTextColor={colors.textSecondary}
        style={baseStyles.input}
        value={lat}
        onChangeText={setLat}
        keyboardType="numeric"
      />

      {/* Longitude */}
      <TextInput
        placeholder="Longitude"
        placeholderTextColor={colors.textSecondary}
        style={baseStyles.input}
        value={lon}
        onChangeText={setLon}
        keyboardType="numeric"
      />

      {/* Route Picker */}
      <View
        style={{
          width: "80%",
          borderWidth: 1,
          borderColor: colors.accent,
          borderRadius: 12,
          marginVertical: 8,
          backgroundColor: colors.backgroundAlt,
        }}
      >
        <Picker
          selectedValue={routeId}
          onValueChange={(value) => setRouteId(value)}
          style={{ color: colors.textPrimary }}
        >
          {selectedRouteIds.length > 0 ? (
            selectedRouteIds.map((id) => (
              <Picker.Item key={id} label={`Route ${id}`} value={id} />
            ))
          ) : (
            <Picker.Item label="No routes selected" value={undefined} />
          )}
        </Picker>
      </View>

      {/* Type Picker */}
      <View
        style={{
          width: "80%",
          borderWidth: 1,
          borderColor: colors.accent,
          borderRadius: 12,
          marginVertical: 8,
          backgroundColor: colors.backgroundAlt,
        }}
      >
        <Picker
          selectedValue={type}
          onValueChange={(value) => setType(value)}
          style={{ color: colors.textPrimary }}
        >
          {waypointTypes.map((item) => (
            <Picker.Item
              key={item.value}
              label={item.label}
              value={item.value}
            />
          ))}
        </Picker>
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[baseStyles.button, baseStyles.buttonPrimary]}
        onPress={handleSubmit}
      >
        <Text style={baseStyles.buttonText}>Save Waypoint</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
