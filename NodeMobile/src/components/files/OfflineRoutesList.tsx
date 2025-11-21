// src/components/files/OfflineRoutesList.tsx
import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouteSelection } from "../../context/RouteSelectionContext";

type OfflineRoute = {
  id: number;
  name: string;
  waypoint_count?: number;
  comment_count?: number;
  last_synced_at?: string | null;
};

type Props = {
  routes: OfflineRoute[];
  loading: boolean;
  syncingRouteId: number | null;
  removingRouteId: number | null;
  onResync: (routeId: number) => void;
  onRemove: (routeId: number) => Promise<void> | void;
  colors: any;
};

export const OfflineRoutesList: React.FC<Props> = ({
  routes,
  loading,
  syncingRouteId,
  removingRouteId,
  onResync,
  onRemove,
  colors,
}) => {
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { selectedRouteIds, toggleRoute } = useRouteSelection();

  const handleRemovePress = (route: OfflineRoute) => {
    Alert.alert(
      "Remove offline copy",
      `Remove "${route.name}" and its offline data from this device?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => onRemove(route.id),
        },
      ]
    );
  };

  return (
    <View style={styles.routesContainer}>
      <Text style={styles.sectionTitle}>Downloaded Routes</Text>

      {loading && (
        <ActivityIndicator size="large" color={colors.primary} />
      )}

      {!loading && routes.length === 0 && (
        <Text style={styles.empty}>No offline routes found.</Text>
      )}

      {!loading &&
        routes.map((r) => {
          const isSelected = selectedRouteIds.includes(r.id);
          const isSyncing = syncingRouteId === r.id;
          const isRemoving = removingRouteId === r.id;

          return (
            <TouchableOpacity
              key={r.id}
              style={[
                styles.routeCard,
                isSelected && {
                  backgroundColor: colors.primary,
                  borderColor: colors.accent,
                },
              ]}
              activeOpacity={0.85}
              onPress={() => toggleRoute({ id: r.id, name: r.name })}
            >
              <Text
                style={[
                  styles.routeName,
                  isSelected && { color: colors.background },
                ]}
                numberOfLines={1}
              >
                {r.name}
              </Text>

              <Text
                style={[
                  styles.meta,
                  isSelected && { color: colors.background },
                ]}
              >
                Waypoints: {r.waypoint_count ?? 0} • Comments:{" "}
                {r.comment_count ?? 0}
              </Text>

              <Text
                style={[
                  styles.meta,
                  isSelected && { color: colors.background },
                ]}
              >
                Last Sync: {r.last_synced_at ?? "Never"}
              </Text>

              <View style={styles.buttonRow}>
                {/* Sync Online */}
                <TouchableOpacity
                  onPress={() => onResync(r.id)}
                  style={[
                    styles.syncButton,
                    (isSyncing || isRemoving) && { opacity: 0.6 },
                  ]}
                  disabled={isSyncing || isRemoving}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.syncButtonText}>Sync Online</Text>
                  )}
                </TouchableOpacity>

                {/* Remove */}
                <TouchableOpacity
                  onPress={() => handleRemovePress(r)}
                  style={[
                    styles.removeButton,
                    (isSyncing || isRemoving) && { opacity: 0.6 },
                  ]}
                  disabled={isSyncing || isRemoving}
                >
                  {isRemoving ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Text style={styles.removeButtonText}>Remove</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
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
    buttonRow: {
      marginTop: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    },
    syncButton: {
      flex: 1,
      backgroundColor: colors.primary,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
    },
    syncButtonText: {
      color: "#fff",
      fontWeight: "600",
    },
    removeButton: {
      flex: 1,
      backgroundColor: colors.backgroundAlt ?? colors.background,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    removeButtonText: {
      fontWeight: "600",
      color: "#e53935",
    },
  });
