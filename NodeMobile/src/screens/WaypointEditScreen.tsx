// src/screens/WaypointEditScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { Picker } from "@react-native-picker/picker";
import { baseStyles, useThemeStyles } from "../styles/theme"; // ⬅️ use theme hook
import { useAuth } from "../context/AuthContext";
import { fetchWaypoint, updateWaypoint, Waypoint } from "../lib/waypoints";

type RouteParams = { id: number };

export default function WaypointEditScreen({ navigation }: any) {
  const { params } = useRoute<any>();
  const waypointId: number = Number((params as RouteParams)?.id);
  const { userToken } = useAuth();
  const { colors: c } = useThemeStyles(); // ⬅️ active palette

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [type, setType] = useState("generic");
  const [routeName, setRouteName] = useState<string>("");

  const waypointTypes = [
    { label: "Generic", value: "generic" },
    { label: "Water", value: "water" },
    { label: "Campsite", value: "campsite" },
    { label: "Road / Access Point", value: "road-access-point" },
    { label: "Intersection", value: "intersection" },
    { label: "Navigation", value: "navigation" },
    { label: "Hazard", value: "hazard" },
    { label: "Landmark", value: "landmark" },
    { label: "Parking / Trailhead", value: "parking-trailhead" },
  ];

  const loadWaypoint = useCallback(async () => {
    try {
      setLoading(true);
      const w: Waypoint = await fetchWaypoint(waypointId);
      setName(w.name ?? "");
      setDesc(w.description ?? "");
      setLat(w.lat != null ? Number(w.lat).toFixed(5).toString() : "");
      setLon(w.lon != null ? Number(w.lon).toFixed(5).toString() : "");
      setType(w.type ?? "generic");
      setRouteName(w.route_name ?? `Route #${w.route_id}`);
    } catch (e: any) {
      console.error("Failed to load waypoint:", e);
      Alert.alert("Error", e?.message || "Failed to load waypoint.");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [waypointId, navigation]);

  useEffect(() => {
    if (!waypointId) {
      Alert.alert("Error", "Missing waypoint id.");
      navigation.goBack();
      return;
    }
    loadWaypoint();
  }, [waypointId, loadWaypoint, navigation]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Missing Field", "Please enter a name.");
      return;
    }
    if (!userToken) {
      Alert.alert("Not logged in", "You must be logged in to edit a waypoint.");
      return;
    }

    try {
      setSaving(true);
      await updateWaypoint(userToken, waypointId, {
        name: name.trim(),
        description: desc,
        lat: parseFloat(lat) || 0,
        lon: parseFloat(lon) || 0,
        type,
      });
      Alert.alert("Saved", "Waypoint updated.");
      navigation.goBack();
    } catch (e: any) {
      console.error("Update failed:", e);
      Alert.alert("Error", e?.message || "Failed to update waypoint.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background, // ⬅️ themed bg while loading
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={c.textSecondary} />
        <Text style={{ color: c.textSecondary, marginTop: 8 }}>
          Loading waypoint…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }} // ⬅️ themed bg
      contentContainerStyle={{ alignItems: "center", paddingVertical: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ alignSelf: "flex-start", marginLeft: 24, marginBottom: 8 }}
      >
        <Text style={{ fontSize: 16, color: c.accent }}>← Back</Text>
      </TouchableOpacity>

      <Text style={[baseStyles.headerText, { color: c.textPrimary }]}>
        Edit Waypoint
      </Text>

      {/* Read-only route */}
      <View style={{ width: "80%", marginBottom: 8, alignSelf: "center" }}>
        <Text style={{ color: c.textSecondary, marginBottom: 4 }}>Route</Text>
        <View
          style={{
            padding: 12,
            borderWidth: 1,
            borderColor: c.accent,
            borderRadius: 12,
            backgroundColor: c.backgroundAlt,
          }}
        >
          <Text style={{ color: c.textPrimary, fontWeight: "600" }}>
            {routeName}
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>
            (linked route cannot be changed)
          </Text>
        </View>
      </View>

      <TextInput
        placeholder="Name (required)"
        placeholderTextColor={c.textSecondary}
        style={[
          baseStyles.input,
          { borderColor: c.accent, backgroundColor: c.backgroundAlt, color: c.textPrimary },
        ]}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        placeholder="Description"
        placeholderTextColor={c.textSecondary}
        style={[
          baseStyles.input,
          { borderColor: c.accent, backgroundColor: c.backgroundAlt, color: c.textPrimary },
        ]}
        value={desc}
        onChangeText={setDesc}
        multiline
      />
      <TextInput
        placeholder="Latitude"
        placeholderTextColor={c.textSecondary}
        style={[
          baseStyles.input,
          { borderColor: c.accent, backgroundColor: c.backgroundAlt, color: c.textPrimary },
        ]}
        value={lat}
        onChangeText={setLat}
        keyboardType="numeric"
      />
      <TextInput
        placeholder="Longitude"
        placeholderTextColor={c.textSecondary}
        style={[
          baseStyles.input,
          { borderColor: c.accent, backgroundColor: c.backgroundAlt, color: c.textPrimary },
        ]}
        value={lon}
        onChangeText={setLon}
        keyboardType="numeric"
      />

      {/* Type Picker */}
      <View
        style={{
          width: "80%",
          borderWidth: 1,
          borderColor: c.accent,
          borderRadius: 12,
          marginVertical: 8,
          backgroundColor: c.backgroundAlt,
        }}
      >
        <Picker
          selectedValue={type}
          onValueChange={(value) => setType(value)}
          style={{ color: c.textPrimary }}
          dropdownIconColor={c.textSecondary}
        >
          {waypointTypes.map((item) => (
            <Picker.Item key={item.value} label={item.label} value={item.value} />
          ))}
        </Picker>
      </View>

      <TouchableOpacity
        style={[baseStyles.button, { backgroundColor: c.primary }]} // ⬅️ themed btn
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={baseStyles.buttonText}>
          {saving ? "Saving…" : "Save Changes"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
