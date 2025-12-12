// src/screens/FileManagerScreen.tsx
import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { pick } from "@react-native-documents/picker";
import { useThemeStyles } from "../styles/theme";
import { createGlobalStyles } from "../styles/globalStyles";
import { useOfflineBackend } from "../context/OfflineContext";
import { fetchOfflineRoutes, removeOfflineRoute } from "../lib/files";
import { syncRouteToOnline } from "../lib/syncOnline";
import { useAuth } from "../context/AuthContext";
import { OfflineRoutesList } from "../components/files/OfflineRoutesList";
import {
  OfflineBasemap,
  listBasemapsOffline,
  importBasemapFromUri,
  setActiveBasemap,
  deleteBasemapOffline,
} from "../offline/basemaps";

export default function FileManagerScreen() {
  const { colors } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { mode, setMode } = useOfflineBackend();
  const { userToken } = useAuth();

  // ---------------------------------
  // Offline routes
  // ---------------------------------
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingRouteId, setSyncingRouteId] = useState<number | null>(null);
  const [removingRouteId, setRemovingRouteId] = useState<number | null>(null);

  // ---------------------------------
  // Offline basemaps (PMTiles)
  // ---------------------------------
  const [basemaps, setBasemaps] = useState<OfflineBasemap[]>([]);
  const [basemapsLoading, setBasemapsLoading] = useState(false);
  const [importingBasemap, setImportingBasemap] = useState(false);
  const [deletingBasemapId, setDeletingBasemapId] = useState<number | null>(
    null
  );
  const [activeBasemapId, setActiveBasemapId] = useState<number | null>(null);

  // ---------------------------------
  // Load offline routes
  // ---------------------------------
  async function loadOfflineRoutes() {
    try {
      setLoading(true);
      const data = await fetchOfflineRoutes();
      setRoutes(data);
    } catch (err) {
      console.error("[FileManager] loadOfflineRoutes error:", err);
      Alert.alert("Error", "Failed to load offline routes.");
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------
  // Load basemaps (PMTiles)
  // ---------------------------------
  async function loadOfflineBasemaps() {
    try {
      setBasemapsLoading(true);
      const items = await listBasemapsOffline();
      setBasemaps(items);
      const active = items.find((b) => b.is_active === 1);
      setActiveBasemapId(active ? active.id : null);
    } catch (err) {
      console.error("[FileManager] loadOfflineBasemaps error:", err);
      Alert.alert("Error", "Failed to load offline basemaps.");
    } finally {
      setBasemapsLoading(false);
    }
  }

  // initial + when backend mode changes
  useEffect(() => {
    loadOfflineRoutes();
    loadOfflineBasemaps();
  }, [mode]);

  // pull-to-refresh
  async function onRefresh() {
    try {
      setRefreshing(true);
      await loadOfflineRoutes();
      await loadOfflineBasemaps();
    } finally {
      setRefreshing(false);
    }
  }

  // ---------------------------------
  // Handle "Re-Sync" → push changes ONLINE
  // ---------------------------------
  async function handleResync(routeId: number) {
    if (!userToken) {
      Alert.alert("Not logged in", "You must be logged in to sync online.");
      return;
    }

    try {
      setSyncingRouteId(routeId);
      console.log("[FileManager] handleResync →", routeId);

      await syncRouteToOnline(routeId, userToken);
      await loadOfflineRoutes();
    } catch (err: any) {
      console.error("[FileManager] handleResync error:", err);
      Alert.alert("Sync failed", String(err?.message ?? err));
    } finally {
      setSyncingRouteId(null);
    }
  }

  // ---------------------------------
  // Handle Remove from offline DB
  // ---------------------------------
  async function handleRemove(routeId: number) {
    try {
      setRemovingRouteId(routeId);
      await removeOfflineRoute(routeId);
      await loadOfflineRoutes();
    } catch (err: any) {
      console.error("[FileManager] handleRemove error:", err);
      Alert.alert(
        "Remove failed",
        String(err?.message ?? "Failed to remove offline route.")
      );
    } finally {
      setRemovingRouteId(null);
    }
  }

  // ---------------------------------
  // PMTiles: Import basemap
  // ---------------------------------
  async function handleImportBasemap() {
    try {
      setImportingBasemap(true);

      const picked = await pick({
        allowMultiSelection: false,
        // ⚡ Platform-specific type:
        //  - Android: generic "*/*" (we filter by extension)
        //  - iOS: generic "public.data" UTI
        type: Platform.OS === "android" ? "*/*" : "public.data",
      } as any);

      if (!picked) {
        return;
      }

      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file?.uri) {
        return;
      }

      const name = file.name ?? "basemap.pmtiles";
      if (!name.toLowerCase().endsWith(".pmtiles")) {
        Alert.alert("Wrong file type", "Please select a .pmtiles file.");
        return;
      }

      console.log("[FileManager] Import PMTiles from", file.uri, name);

      const basemap = await importBasemapFromUri({
        uri: file.uri,
        name,
      });

      await loadOfflineBasemaps();

      Alert.alert(
        "Basemap imported",
        `"${basemap.name}" is now available as an offline basemap.`
      );
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? "");

      // Special-case the Android "no file picker" situation
      if (
        Platform.OS === "android" &&
        msg.includes("ActivityNotFoundException")
      ) {
        Alert.alert(
          "No file picker available",
          "Android couldn't find an app to pick files.\n\n" +
            "On an emulator, make sure you're using a Google Play system image " +
            "with a Files/Documents app, or install a file manager.\n\n" +
            "On a real device this should work out of the box."
        );
        return;
      }

      // Quietly ignore user cancellation
      if (/cancelled|canceled/i.test(msg)) {
        return;
      }

      console.error("[FileManager] handleImportBasemap error:", err);
      Alert.alert("Import failed", msg || "Could not import PMTiles file.");
    } finally {
      setImportingBasemap(false);
    }
  }

  // ---------------------------------
  // PMTiles: Set active basemap
  // ---------------------------------
  async function handleSetActiveBasemap(id: number) {
    try {
      await setActiveBasemap(id);
      setActiveBasemapId(id);
      await loadOfflineBasemaps();
    } catch (err: any) {
      console.error("[FileManager] handleSetActiveBasemap error:", err);
      Alert.alert(
        "Error",
        String(err?.message ?? "Failed to set active basemap.")
      );
    }
  }

  // ---------------------------------
  // PMTiles: Delete basemap
  // ---------------------------------
  async function handleDeleteBasemap(id: number) {
    Alert.alert(
      "Delete basemap?",
      "This will remove the PMTiles file from your device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingBasemapId(id);
              await deleteBasemapOffline(id);
              await loadOfflineBasemaps();
            } catch (err: any) {
              console.error("[FileManager] handleDeleteBasemap error:", err);
              Alert.alert(
                "Delete failed",
                String(err?.message ?? "Failed to delete basemap.")
              );
            } finally {
              setDeletingBasemapId(null);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={globalStyles.filesContainer}>
          {/* Header */}
          <Text style={globalStyles.pageTitle}>File Manager</Text>
          <Text style={globalStyles.subtitle}>
            Manage your offline route data and basemaps
          </Text>

          {/* Backend Mode Selector */}
          <View style={styles.modeSection}>
            <Text style={styles.modeLabel}>Toggle Online / Offline Mode</Text>

            <View style={styles.modeRow}>
              <ModeChip
                label="Online"
                active={mode === "online"}
                onPress={() => setMode("online" as any)}
                colors={colors}
              />
              <ModeChip
                label="Offline"
                active={mode === "offline"}
                onPress={() => setMode("offline" as any)}
                colors={colors}
              />
            </View>

            <Text style={styles.modeHint}>Current: {mode.toUpperCase()}</Text>
          </View>

          {/* Offline Route List */}
          <OfflineRoutesList
            routes={routes}
            loading={loading}
            syncingRouteId={syncingRouteId}
            removingRouteId={removingRouteId}
            onResync={handleResync}
            onRemove={handleRemove}
            colors={colors}
          />

          {/* PMTiles Basemaps Section */}
          <View style={styles.basemapSection}>
            <Text style={styles.basemapTitle}>Offline Basemaps (PMTiles)</Text>
            <Text style={styles.basemapSubtitle}>
              Import PMTiles files to use as offline map backgrounds. Basemaps
              are managed here and used automatically by the map when supported.
            </Text>

            <TouchableOpacity
              style={[
                styles.importButton,
                importingBasemap && { opacity: 0.7 },
              ]}
              onPress={handleImportBasemap}
              disabled={importingBasemap}
            >
              {importingBasemap ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.importButtonLabel}>
                  Import PMTiles file
                </Text>
              )}
            </TouchableOpacity>

            {basemapsLoading ? (
              <View style={styles.basemapLoadingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.basemapLoadingText}>
                  Loading basemaps…
                </Text>
              </View>
            ) : basemaps.length === 0 ? (
              <Text style={styles.basemapEmpty}>
                No offline basemaps yet. Import a PMTiles file to get started.
              </Text>
            ) : (
              <View style={styles.basemapList}>
                {basemaps.map((bm) => {
                  const isActive = bm.id === activeBasemapId;
                  const isDeleting = deletingBasemapId === bm.id;

                  const sizeMb =
                    typeof bm.size_bytes === "number"
                      ? (bm.size_bytes / (1024 * 1024)).toFixed(1)
                      : null;

                  return (
                    <View key={bm.id} style={styles.basemapRow}>
                      <View style={styles.basemapInfo}>
                        <View style={styles.basemapTitleRow}>
                          <Text style={styles.basemapName}>{bm.name}</Text>
                          {isActive && (
                            <View style={styles.activeBadge}>
                              <Text style={styles.activeBadgeText}>
                                ACTIVE
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.basemapMeta}>
                          {sizeMb ? `${sizeMb} MB` : "Size unknown"}
                        </Text>
                      </View>

                      <View style={styles.basemapActions}>
                        {!isActive && (
                          <TouchableOpacity
                            style={styles.basemapActionButton}
                            onPress={() => handleSetActiveBasemap(bm.id)}
                          >
                            <Text style={styles.basemapActionText}>
                              Set active
                            </Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.basemapActionButton}
                          onPress={() => handleDeleteBasemap(bm.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <ActivityIndicator size="small" />
                          ) : (
                            <Text style={styles.basemapDeleteText}>
                              Delete
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

type ModeChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
};

function ModeChip({ label, active, onPress, colors }: ModeChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        chipStyles.base,
        { borderColor: colors.border },
        active && {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
      ]}
    >
      <Text
        style={[
          chipStyles.label,
          { color: active ? "#fff" : colors.text },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modeSection: {
      marginTop: 24,
      alignItems: "center",
      width: "100%",
    },
    modeLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
    },
    modeRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 6,
    },
    modeHint: {
      fontSize: 13,
      color: colors.muted,
      marginTop: 4,
    },

    // Basemaps section
    basemapSection: {
      marginTop: 32,
      width: "100%",
    },
    basemapTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 4,
    },
    basemapSubtitle: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 12,
    },
    importButton: {
      marginTop: 4,
      alignSelf: "flex-start",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: colors.primary,
      marginBottom: 12,
    },
    importButtonLabel: {
      color: "#fff",
      fontWeight: "600",
      fontSize: 14,
    },
    basemapLoadingRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      gap: 8,
    },
    basemapLoadingText: {
      fontSize: 13,
      color: colors.muted,
    },
    basemapEmpty: {
      fontSize: 13,
      color: colors.muted,
      marginTop: 8,
    },
    basemapList: {
      marginTop: 4,
      gap: 8,
    } as any,
    basemapRow: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    basemapInfo: {
      flex: 1,
      marginRight: 8,
    },
    basemapTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    } as any,
    basemapName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    basemapMeta: {
      marginTop: 2,
      fontSize: 12,
      color: colors.muted,
    },
    activeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    activeBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: "#fff",
      letterSpacing: 0.5,
    },
    basemapActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    } as any,
    basemapActionButton: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    basemapActionText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: "500",
    },
    basemapDeleteText: {
      fontSize: 12,
      color: colors.danger ?? "#d9534f",
      fontWeight: "500",
    },
  });

const chipStyles = StyleSheet.create({
  base: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
});
