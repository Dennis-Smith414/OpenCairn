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
} from "react-native";
import { useThemeStyles } from "../styles/theme";
import { createGlobalStyles } from "../styles/globalStyles";
import { useOfflineBackend } from "../context/OfflineContext";
import { fetchOfflineRoutes } from "../lib/files";
import { syncRouteToOnline } from "../lib/syncOnline";
import { useAuth } from "../context/AuthContext";

export default function FileManagerScreen() {
  const { colors } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { mode, setMode } = useOfflineBackend();
  const { userToken } = useAuth();

  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingRouteId, setSyncingRouteId] = useState<number | null>(null);

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

  // initial + when backend mode changes
  useEffect(() => {
    loadOfflineRoutes();
  }, [mode]);

  // pull-to-refresh
  async function onRefresh() {
    try {
      setRefreshing(true);
      await loadOfflineRoutes();
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

      // 1) push local changes for this route to remote
      await syncRouteToOnline(routeId, userToken);

      // 2) reload offline list (last_synced_at etc. should update)
      await loadOfflineRoutes();
    } catch (err: any) {
      console.error("[FileManager] handleResync error:", err);
      Alert.alert("Sync failed", String(err?.message ?? err));
    } finally {
      setSyncingRouteId(null);
    }
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
          <Text style={globalStyles.icon}>📁</Text>
          <Text style={globalStyles.pageTitle}>File Manager</Text>
          <Text style={globalStyles.subtitle}>
            Manage your offline route data
          </Text>

          {/* Backend Mode Selector */}
          <View style={styles.modeSection}>
            <Text style={styles.modeLabel}>Backend Mode</Text>

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

            <Text style={styles.modeHint}>
              Current: {mode.toUpperCase()}
            </Text>
          </View>

          {/* Offline Route List */}
          <View style={styles.routesContainer}>
            <Text style={styles.sectionTitle}>Downloaded Routes</Text>

            {loading && (
              <ActivityIndicator size="large" color={colors.primary} />
            )}

            {!loading && routes.length === 0 && (
              <Text style={styles.empty}>No offline routes found.</Text>
            )}

            {routes.map((r) => {
              const isSyncing = syncingRouteId === r.id;
              return (
                <View key={r.id} style={styles.routeCard}>
                  <Text style={styles.routeName}>{r.name}</Text>

                  <Text style={styles.meta}>
                    Waypoints: {r.waypoint_count} • Comments: {r.comment_count}
                  </Text>

                  <Text style={styles.meta}>
                    Last Sync: {r.last_synced_at ?? "Never"}
                  </Text>

                  <TouchableOpacity
                    onPress={() => handleResync(r.id)}
                    style={[
                      styles.syncButton,
                      isSyncing && { opacity: 0.6 },
                    ]}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.syncButtonText}>Sync Online</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
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
      <Text style={[chipStyles.label, { color: active ? "#fff" : colors.text }]}>
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
    routesContainer: {
      marginTop: 26,
      width: "100%",
      paddingHorizontal: 16,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 12,
      textAlign: "center",
    },
    empty: {
      color: colors.muted,
      textAlign: "center",
      marginTop: 10,
    },
    routeCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
      borderColor: colors.border,
      borderWidth: 1,
    },
    routeName: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 4,
    },
    meta: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 4,
    },
    syncButton: {
      marginTop: 10,
      backgroundColor: colors.primary,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
    },
    syncButtonText: {
      color: "#fff",
      fontWeight: "600",
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
