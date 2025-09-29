// screens/RouteCreateScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { pick } from "@react-native-documents/picker";
import RNFS from "react-native-fs";
import { baseStyles, colors } from "../styles/theme";
import { uploadGpxFile } from "../utils/uploadGpx";

export default function RouteCreateScreen({ navigation }: any) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickFile = async () => {
    try {
      const [file] = await pick();
      if (!file) return;
      const destPath = `${RNFS.CachesDirectoryPath}/${file.name}`;
      await RNFS.copyFile(file.uri, destPath);
      setFileUri(`file://${destPath}`);
    } catch (e) {
      console.error("File pick failed:", e);
      Alert.alert("Error", "Could not pick GPX file.");
    }
  };

  const handleSubmit = async () => {
    if (!name || !fileUri) {
      Alert.alert("Missing info", "Please provide a name and GPX file.");
      return;
    }

    setUploading(true);
    try {
      // 1️⃣ Upload GPX file (this inserts the route + gpx rows)
      const uploadResult = await uploadGpxFile(fileUri);

      // 2️⃣ PATCH to set name and region
      const res = await fetch(`http://10.0.2.2:5100/api/routes/${uploadResult.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, region }),
      });
      if (!res.ok) throw new Error("Failed to set metadata");

      Alert.alert("Success", "Route created!");
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert("Upload failed", "Could not create route.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={[baseStyles.container, { padding: 20 }]}>
      <Text style={baseStyles.headerText}>Create New Route</Text>

      <Text style={{ marginTop: 16 }}>Name</Text>
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: colors.accent,
          borderRadius: 8,
          padding: 8,
          width: "100%",
          marginTop: 4,
        }}
        value={name}
        onChangeText={setName}
      />

      <Text style={{ marginTop: 16 }}>Region</Text>
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: colors.accent,
          borderRadius: 8,
          padding: 8,
          width: "100%",
          marginTop: 4,
        }}
        value={region}
        onChangeText={setRegion}
      />

      <TouchableOpacity
        style={[baseStyles.button, { backgroundColor: colors.accent, marginTop: 16 }]}
        onPress={pickFile}
      >
        <Text style={baseStyles.buttonText}>
          {fileUri ? "✅ File Selected" : "📎 Pick GPX File"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[baseStyles.button, baseStyles.buttonPrimary, { marginTop: 24 }]}
        onPress={handleSubmit}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={baseStyles.buttonText}>🚀 Create Route</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
