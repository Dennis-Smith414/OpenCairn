// screens/RouteCreateScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { pick } from "@react-native-documents/picker";
import RNFS from "react-native-fs";
import { useThemeStyles } from "../styles/theme";
import { uploadGpxFile } from "../lib/uploadGpx";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../config/env";

export default function RouteCreateScreen({ navigation }: any) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { userToken } = useAuth();


  // theme
  const { colors, styles: baseStyles } = useThemeStyles();

  const pickFile = async () => {
    try {
      const [file] = await pick();
      if (!file) return;
      const destPath = `${RNFS.CachesDirectoryPath}/${file.name}`;
      await RNFS.copyFile(file.uri, destPath);
      setFileUri(`file://${destPath}`);
      setFileName(file.name);
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
      const uploadResult = await uploadGpxFile(fileUri, userToken);

      const res = await fetch(`${API_BASE}/api/routes/${uploadResult.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
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
    <View style={[baseStyles.container, styles.container]}>
      <Text style={baseStyles.headerText}>Create New Route</Text>

      <View style={styles.form}>
        {/* Label */}
        <Text style={[styles.label, { color: colors.textPrimary }]}>Route Name *</Text>

        {/* Input */}
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.border,
              backgroundColor: colors.backgroundAlt || "rgba(255,255,255,0.06)",
              color: colors.textPrimary,
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            },
          ]}
          placeholder="Enter route name"
          placeholderTextColor={colors.textSecondary}
          value={name}
          onChangeText={setName}
          editable={!uploading}
        />

        {/* Label */}
        <Text style={[styles.label, { color: colors.textPrimary }]}>Region (Optional)</Text>

        {/* Input */}
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.border,
              backgroundColor: colors.backgroundAlt || "rgba(255,255,255,0.06)",
              color: colors.textPrimary,
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            },
          ]}
          placeholder="Enter region"
          placeholderTextColor={colors.textSecondary}
          value={region}
          onChangeText={setRegion}
          editable={!uploading}
        />

        {/* File picker */}
        <TouchableOpacity
          style={[
            styles.fileButton,
            {
              borderColor: colors.border,
              backgroundColor: "rgba(255,255,255,0.05)",
            },
            fileUri && { backgroundColor: colors.primary, borderStyle: "solid" },
          ]}
          onPress={pickFile}
          disabled={uploading}
        >
          <Text
            style={[
              styles.fileButtonText,
              { color: fileUri ? "#093536" : colors.textPrimary }, // readable on turquoise
            ]}
          >
            {fileUri ? `✓ ${fileName}` : "📎 Select GPX File"}
          </Text>
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          style={[
            baseStyles.button,
            baseStyles.buttonPrimary,
            styles.submitButton,
            uploading && styles.submitButtonDisabled,
            
          ]}
          onPress={handleSubmit}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={baseStyles.buttonText}>Create Route</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // structural only; colors come inline from theme
  container: {
    padding: 20,
  },
  form: {
    marginTop: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1.5, // slightly thicker for dark mode
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  fileButton: {
    borderWidth: 2,
    borderRadius: 10,
    borderStyle: "dashed",
    padding: 22,
    alignItems: "center",
    marginTop: 24,
  },
  fileButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  submitButton: {
    marginTop: 32,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
});