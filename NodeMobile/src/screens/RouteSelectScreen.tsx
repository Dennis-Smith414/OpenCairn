// screens/RouteSelectScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { pick } from "@react-native-documents/picker";
import RNFS from "react-native-fs";
import { baseStyles, colors } from "../styles/theme";
import { fetchRouteList } from "../lib/api";
import { uploadGpxFile } from "../utils/uploadGpx";

type RouteItem = {
  id: number;
  slug: string;
  name: string;
  region?: string;
};

export default function RouteSelectScreen({ navigation }: any) {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // -------------------------------
  // 📡 Fetch route list (with safer error handling)
  // -------------------------------
  const loadRoutes = useCallback(async () => {
    try {
      setRefreshing(true);
      const list = await fetchRouteList();
      setRoutes(list);
    } catch (e: any) {
      console.error("Failed to fetch routes:", e);
      Alert.alert("Error", "Could not load routes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  // -------------------------------
  // 🧭 Helper: Copy to local file
  // -------------------------------
  async function copyToLocalFile(file: any): Promise<string> {
    if (!file?.uri) throw new Error("File has no URI");

    if (file.uri.startsWith("file://")) {
      return file.uri; // already local
    }

    const destPath = `${RNFS.CachesDirectoryPath}/${file.name || "upload.gpx"}`;
    console.log("Copying GPX to local path:", destPath);

    try {
      await RNFS.copyFile(file.uri, destPath);
      return `file://${destPath}`;
    } catch (err) {
      console.error("Manual file copy failed:", err);
      throw new Error("Could not copy file locally");
    }
  }

  // -------------------------------
  // 📤 Upload GPX route
  // -------------------------------
  const selectAndUploadGpx = async () => {
    try {
      const [file] = await pick();
      if (!file) {
        Alert.alert("No file selected");
        return;
      }
      console.log("Picked file:", file);

      const localUri = await copyToLocalFile(file);
      console.log("Uploading from URI:", localUri);

      const result = await uploadGpxFile(localUri);
      console.log("Upload success:", result);

      Alert.alert("Upload complete", `Uploaded: ${result.name}`);
      await loadRoutes();
    } catch (err: any) {
      if (err?.message?.includes("User canceled")) return;
      console.error("Upload failed:", err);
      Alert.alert("Upload failed", err.message || "An error occurred.");
    }
  };

  // -------------------------------
  // 🧭 Route selection
  // -------------------------------
  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const confirmSelection = () => {
    navigation.navigate("Map", { routeIds: selected });
  };

  // -------------------------------
  // ⏳ Loading state
  // -------------------------------
  if (loading) {
    return (
      <View style={baseStyles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={baseStyles.subText}>Loading routes…</Text>
      </View>
    );
  }

  // -------------------------------
  // 🖼️ UI
  // -------------------------------
  return (
    <View style={[baseStyles.container, { padding: 16 }]}>
      <Text style={baseStyles.headerText}>Select Routes</Text>

      {/* 📁 Upload button */}
      <TouchableOpacity
        style={[
          baseStyles.button,
          {
            backgroundColor: colors.accent,
            marginVertical: 8,
            paddingVertical: 10,
          },
        ]}
        onPress={selectAndUploadGpx}
      >
        <Text style={baseStyles.buttonText}>＋ Upload GPX Route</Text>
      </TouchableOpacity>

      <FlatList
        data={routes}
        keyExtractor={(item) => String(item.id)}
        style={{ width: "100%", marginTop: 8 }}
        refreshing={refreshing}
        onRefresh={loadRoutes}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{
              padding: 12,
              marginVertical: 6,
              marginHorizontal: 16,
              borderRadius: 12,
              backgroundColor: selected.includes(item.id)
                ? colors.primary
                : colors.backgroundAlt,
              borderWidth: 1,
              borderColor: colors.accent,
            }}
            onPress={() => toggle(item.id)}
          >
            <Text style={baseStyles.bodyText}>{item.name}</Text>
            {item.region && (
              <Text style={baseStyles.subText}>{item.region}</Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={baseStyles.subText}>No routes found.</Text>
        }
      />

      <TouchableOpacity
        style={[baseStyles.button, baseStyles.buttonPrimary]}
        onPress={confirmSelection}
      >
        <Text style={baseStyles.buttonText}>Show on Map</Text>
      </TouchableOpacity>
    </View>
  );
}
