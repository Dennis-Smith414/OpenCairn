// screens/RouteEditScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import RNFS from "react-native-fs";
import { pick } from "@react-native-documents/picker";

import { useThemeStyles } from "../styles/theme";
import { createGlobalStyles } from "../styles/globalStyles";
import { useAuth } from "../context/AuthContext";
import {
  fetchRouteDetail,
  updateRoute,
  deleteRouteGpxByName,
} from "../lib/routes";

type PickedFile = { uri: string; name: string };

type Props = {
  navigation: any;
  route: { params: { routeId: number; routeName?: string } };
};

export default function RouteEditScreen({ navigation, route }: Props) {
  const { colors } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);
  const styles = makeStyles(colors);
  const { userToken } = useAuth();

  const { routeId, routeName } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [description, setDescription] = useState("");

  const [existingTracks, setExistingTracks] = useState<string[]>([]);
  const [tracksToRemove, setTracksToRemove] = useState<string[]>([]);
  const [filesToAdd, setFilesToAdd] = useState<PickedFile[]>([]);

  const normalizeSelection = (chosen: any): any[] =>
    Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true);
      const { route: r, gpx } = await fetchRouteDetail(routeId, {
        includeGpx: true,
      });

      setName(r.name ?? "");
      setRegion(r.region ?? "");
      setDescription(r.description ?? "");

      if (r.name) {
        navigation.setOptions?.({ title: `Edit: ${r.name}` });
      } else if (routeName) {
        navigation.setOptions?.({ title: `Edit: ${routeName}` });
      }

      const trackNames: string[] =
        gpx?.features
          ?.map((f: any) => f?.properties?.name || null)
          .filter((n: string | null) => n && n.trim().length > 0) ?? [];

      setExistingTracks(trackNames);
      setTracksToRemove([]);
      setFilesToAdd([]);
    } catch (e) {
      console.error("[RouteEditScreen] load failed:", e);
      Alert.alert("Error", "Could not load route details.");
    } finally {
      setLoading(false);
    }
  }, [routeId, routeName, navigation]);

  useEffect(() => {
    if (routeName) {
      navigation.setOptions?.({ title: `Edit: ${routeName}` });
    }
    loadDetail();
  }, [loadDetail, routeName, navigation]);

  const pickFiles = async () => {
    try {
      const chosen = await pick({ allowMultiSelection: true } as any);
      const arr = normalizeSelection(chosen);
      if (!arr.length) return;

      const prepared: PickedFile[] = [];
      for (const f of arr) {
        if (!/\.gpx$/i.test(f.name)) {
          Alert.alert("Warning", `"${f.name}" does not look like a .gpx file.`);
        }
        const destPath = `${RNFS.CachesDirectoryPath}/${f.name}`;
        await RNFS.copyFile(f.uri, destPath);
        prepared.push({ uri: `file://${destPath}`, name: f.name });
      }

      setFilesToAdd((prev) => {
        const seen = new Set(prev.map((p) => p.name));
        const merged = [...prev];
        for (const p of prepared) if (!seen.has(p.name)) merged.push(p);
        return merged;
      });
    } catch (e) {
      console.error("[RouteEditScreen] file pick failed:", e);
      Alert.alert("Error", "Could not pick GPX file(s).");
    }
  };

  const removeNewFile = (name: string) => {
    setFilesToAdd((prev) => prev.filter((f) => f.name !== name));
  };

  const clearNewFiles = () => setFilesToAdd([]);

  const toggleRemoveTrack = (name: string) => {
    setTracksToRemove((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      return Alert.alert("Missing info", "Please provide a route name.");
    }
    if (!userToken) {
      return Alert.alert(
        "Not signed in",
        "You must be logged in to edit a route."
      );
    }

    setSaving(true);
    try {
      // 1) Update basic metadata (online-only; throws if offline)
      await updateRoute(routeId, userToken, {
        name: name.trim(),
        region: region.trim() || undefined,
        description: description.trim() || undefined,
      });

      // 2) Upload newly added GPX files
      for (const f of filesToAdd) {
        // Reuse existing helper
        // NOTE: this helper is online-only already
        await uploadGpxToExistingRoute(routeId, f.uri, userToken);
      }

      // 3) Delete marked GPX tracks
      for (const trackName of tracksToRemove) {
        await deleteRouteGpxByName(routeId, trackName, userToken);
      }

      Alert.alert("Success", "Route updated successfully.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      console.error("[RouteEditScreen] save failed:", e);
      Alert.alert("Update failed", e?.message || "Could not update route.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[
          globalStyles.container,
          { padding: 16, alignItems: "center", justifyContent: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[globalStyles.subText, { marginTop: 8 }]}>
          Loading route…
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[globalStyles.container, styles.container]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Back Button (match create/detail screens) */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ alignSelf: "flex-start", marginLeft: 8, marginBottom: 8 }}
      >
        <Text style={{ fontSize: 16, color: colors.accent }}>← Back</Text>
      </TouchableOpacity>

      <Text style={globalStyles.headerText}>Edit Route</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <Text style={globalStyles.label}>Route Name *</Text>
          <TextInput
            style={globalStyles.input}
            placeholder="Enter route name"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            editable={!saving}
          />

          <Text style={globalStyles.label}>Region (Optional)</Text>
          <TextInput
            style={globalStyles.input}
            placeholder="Enter region"
            placeholderTextColor={colors.textSecondary}
            value={region}
            onChangeText={setRegion}
            editable={!saving}
          />

          <Text style={globalStyles.label}>Description (Optional)</Text>
          <TextInput
            style={[
              globalStyles.input,
              { minHeight: 90, textAlignVertical: "top" },
            ]}
            placeholder="Enter description"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            editable={!saving}
            multiline
          />

          {/* Existing GPX tracks */}
          <Text style={[globalStyles.label, { marginTop: 12 }]}>
            Existing GPX Tracks
          </Text>
          <View className="filesWrapper" style={styles.filesWrapper}>
            {existingTracks.length > 0 ? (
              <FlatList
                scrollEnabled={false}
                data={existingTracks}
                keyExtractor={(item) => item}
                style={styles.filesList}
                contentContainerStyle={{ paddingVertical: 4 }}
                renderItem={({ item }) => {
                  const marked = tracksToRemove.includes(item);
                  return (
                    <View style={styles.fileRow}>
                      <Text
                        style={[
                          styles.fileName,
                          marked && {
                            textDecorationLine: "line-through",
                            color: colors.textSecondary,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {item}
                      </Text>
                      <TouchableOpacity
                        onPress={() => toggleRemoveTrack(item)}
                        disabled={saving}
                      >
                        <Text style={styles.removeLink}>
                          {marked ? "Undo" : "Remove"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No GPX tracks found</Text>
                <Text style={styles.emptyText}>
                  You can attach new GPX files below.
                </Text>
              </View>
            )}
          </View>

          {/* New GPX files */}
          <Text style={[globalStyles.label, { marginTop: 12 }]}>
            Add GPX File(s)
          </Text>

          <TouchableOpacity
            style={[
              globalStyles.fileButton,
              filesToAdd.length > 0 && globalStyles.fileButtonSelected,
            ]}
            onPress={pickFiles}
            disabled={saving}
          >
            <Text style={globalStyles.fileButtonText}>
              {filesToAdd.length
                ? `✓ ${filesToAdd.length} file(s) selected`
                : "Select GPX File(s)"}
            </Text>
          </TouchableOpacity>

          <View style={styles.filesWrapper}>
            {filesToAdd.length > 0 ? (
              <FlatList
                scrollEnabled={false}
                data={filesToAdd}
                keyExtractor={(item) => item.name}
                style={styles.filesList}
                contentContainerStyle={{ paddingVertical: 4 }}
                renderItem={({ item }) => (
                  <View style={styles.fileRow}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => removeNewFile(item.name)}
                      disabled={saving}
                    >
                      <Text style={styles.removeLink}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No new GPX files</Text>
                <Text style={styles.emptyText}>
                  Tap "Select GPX File(s)" to attach files.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.fileActionsRow}>
            <TouchableOpacity
              style={[styles.smallBtn, { borderColor: colors.accent }]}
              onPress={pickFiles}
              disabled={saving}
            >
              <Text style={styles.smallBtnText}>＋ Add another GPX</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.smallBtn,
                {
                  borderColor: colors.border,
                  opacity: filesToAdd.length ? 1 : 0.5,
                },
              ]}
              onPress={clearNewFiles}
              disabled={saving || filesToAdd.length === 0}
            >
              <Text style={styles.smallBtnText}>Clear new files</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.helperText}>
            Tracks marked "Remove" will be deleted when you save changes.
          </Text>
        </View>
      </ScrollView>

      {/* Sticky footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            globalStyles.button,
            globalStyles.buttonPrimary,
            styles.submitButton,
            saving && styles.submitButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={globalStyles.buttonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: { padding: 20, flex: 1 },
    scroll: { flex: 1, marginTop: 8 },
    scrollContent: { paddingBottom: 20 },
    form: { gap: 8 },
    filesWrapper: {
      alignSelf: "stretch",
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
    emptyTitle: {
      fontWeight: "600",
      color: colors.textPrimary,
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
    fileName: { flex: 1, marginRight: 12, color: colors.textPrimary },
    removeLink: { color: colors.accent, fontWeight: "700" },
    fileActionsRow: {
      marginTop: 10,
      flexDirection: "row",
      gap: 10,
      justifyContent: "flex-start",
      alignSelf: "stretch",
    },
    smallBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
    },
    smallBtnText: { color: colors.textPrimary },
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
