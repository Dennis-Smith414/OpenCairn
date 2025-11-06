// screens/RouteCreateScreen.tsx
import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  ActivityIndicator, StyleSheet, FlatList, ScrollView,
  Platform, KeyboardAvoidingView,
} from "react-native";
import { pick } from "@react-native-documents/picker";
import RNFS from "react-native-fs";
import { baseStyles, colors } from "../styles/theme";
import { useAuth } from "../context/AuthContext";

//import {API_BASE as BASE} from "../lib/api";
import {API_BASE as BASE} from "../config/env";

import { createRoute } from "../lib/routes";
import { uploadGpxToExistingRoute } from "../lib/uploadGpx";

type PickedFile = { uri: string; name: string };
>>>>>>> 6e0094c4f4fa20f553c84f244ab3f34d38a78a8a

export default function RouteCreateScreen({ navigation }: any) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const { userToken } = useAuth();

  const normalizeSelection = (chosen: any): any[] =>
    Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];

<<<<<<< HEAD
    const handleSubmit = async () => {
        if (!name || !fileUri) {
            Alert.alert("Missing info", "Please provide a name and GPX file.");
            return;
        }
        setUploading(true);
        try {
            // Upload GPX file, and get auth (this inserts the route + gpx rows)
            const uploadResult = await uploadGpxFile(fileUri, userToken);
            // PATCH to set user, name, and region
            const res = await fetch(`${API_BASE}/api/routes/${uploadResult.id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${userToken}`,
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
=======
  const pickFiles = async () => {
    try {
      const chosen = await pick({ allowMultiSelection: true } as any);
      const arr = normalizeSelection(chosen);
      if (!arr.length) return;
>>>>>>> 6e0094c4f4fa20f553c84f244ab3f34d38a78a8a

      const prepared: PickedFile[] = [];
      for (const f of arr) {
        if (!/\.gpx$/i.test(f.name)) {
          Alert.alert("Warning", `“${f.name}” does not look like a .gpx file.`);
        }
        const destPath = `${RNFS.CachesDirectoryPath}/${f.name}`;
        await RNFS.copyFile(f.uri, destPath);
        prepared.push({ uri: `file://${destPath}`, name: f.name });
      }

      setFiles((prev) => {
        const seen = new Set(prev.map((p) => p.name));
        const merged = [...prev];
        for (const p of prepared) if (!seen.has(p.name)) merged.push(p);
        return merged;
      });
    } catch (e) {
      console.error("File pick failed:", e);
      Alert.alert("Error", "Could not pick GPX file(s).");
    }
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const clearAll = () => setFiles([]);

  const handleSubmit = async () => {
    if (!name.trim()) return Alert.alert("Missing info", "Please provide a route name.");
    if (!files.length) return Alert.alert("Missing GPX", "Please select at least one GPX file.");
    if (!userToken) return Alert.alert("Not signed in", "You must be logged in to create a route.");

    setUploading(true);
    try {
      const route = await createRoute(userToken, {
        name: name.trim(),
        region: region.trim() || undefined,
      });

      // Sequential uploads; switch to Promise.all for parallel if desired
      for (const f of files) {
        await uploadGpxToExistingRoute(route.id!, f.uri, userToken);
      }

      Alert.alert(
        "Success",
        `Route created with ${files.length} GPX file${files.length > 1 ? "s" : ""}.`
      );
      navigation.goBack();
    } catch (e: any) {
      console.error("[RouteCreateScreen] create+upload failed:", e);
      Alert.alert("Upload failed", e?.message || "Could not create route.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[baseStyles.container, styles.container]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={[baseStyles.headerText, styles.header]}>Create New Route</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <Text style={styles.label}>Route Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter route name"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            editable={!uploading}
          />

          <Text style={styles.label}>Region (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter region"
            placeholderTextColor={colors.textSecondary}
            value={region}
            onChangeText={setRegion}
            editable={!uploading}
          />

          {/* Primary picker */}
          <TouchableOpacity
            style={[styles.fileButton, files.length > 0 && styles.fileButtonSelected]}
            onPress={pickFiles}
            disabled={uploading}
          >
            <Text style={styles.fileButtonText}>
              {files.length ? `✓ ${files.length} file(s) selected` : "Select GPX File(s)"}
            </Text>
          </TouchableOpacity>

          {/* Files card — always render so width/spacing stay identical */}
          <View style={styles.filesWrapper}>
            {files.length > 0 ? (
              <FlatList
                scrollEnabled={false}
                data={files}
                keyExtractor={(item) => item.name}
                style={styles.filesList}
                contentContainerStyle={{ paddingVertical: 4 }}
                renderItem={({ item }) => (
                  <View style={styles.fileRow}>
                    <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                    <TouchableOpacity onPress={() => removeFile(item.name)} disabled={uploading}>
                      <Text style={styles.removeLink}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No GPX files selected</Text>
                <Text style={styles.emptyText}>
                  Tap “Select GPX File(s)” or “Add another GPX” to attach files.
                </Text>
              </View>
            )}
          </View>

          {/* Secondary actions: always visible to keep layout stable */}
          <View style={styles.fileActionsRow}>
            <TouchableOpacity
              style={[styles.smallBtn, { borderColor: colors.accent }]}
              onPress={pickFiles}
              disabled={uploading}
            >
              <Text style={styles.smallBtnText}>＋ Add another GPX</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.smallBtn, { borderColor: colors.border, opacity: files.length ? 1 : 0.5 }]}
              onPress={clearAll}
              disabled={uploading || files.length === 0}
            >
              <Text style={styles.smallBtnText}>Clear all</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.helperText}>
            Tip: if multi-select isn’t supported on your device, tap “Add another GPX” again to pick files one by one.
          </Text>
        </View>
      </ScrollView>

      {/* Sticky footer with centered CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            baseStyles.button,
            baseStyles.buttonPrimary,
            styles.submitButton,
            uploading && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={uploading}
          activeOpacity={0.9}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={baseStyles.buttonText}>Create Route</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, flex: 1 },
  header: { textAlign: "center" },
  scroll: { flex: 1, marginTop: 8 },
  scrollContent: { paddingBottom: 20 },
  form: { gap: 8 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.backgroundAlt,
  },
  fileButton: {
    alignSelf: "stretch",                // 👈 ensure full width always
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 8,
    borderStyle: "dashed",
    padding: 20,
    alignItems: "center",
    marginTop: 16,
    backgroundColor: colors.backgroundAlt,
  },
  fileButtonSelected: {
    backgroundColor: colors.backgroundAlt,
    borderStyle: "solid",
    borderColor: colors.primary,
  },
  fileButtonText: { fontSize: 16, fontWeight: "600", color: colors.text },
  filesWrapper: {
    alignSelf: "stretch",                // 👈 keep same width as button/inputs
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.backgroundAlt,
    maxHeight: 160,
    minHeight: 120,
    overflow: "hidden",
  },
  filesList: { maxHeight: 160 },
  emptyState: {
    flex: 1,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  emptyIcon: { fontSize: 20, marginBottom: 6 },
  emptyTitle: {
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: "center",
  },
  fileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  fileName: { flex: 1, marginRight: 12, color: colors.text },
  removeLink: { color: colors.accent, fontWeight: "700" },
  fileActionsRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-start",
    alignSelf: "stretch",                // 👈 match width
  },
  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  smallBtnText: { color: colors.text },
  helperText: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
  },
  footer: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  submitButton: { alignSelf: "center", minWidth: 220 },
  submitButtonDisabled: { opacity: 0.6 },
});
