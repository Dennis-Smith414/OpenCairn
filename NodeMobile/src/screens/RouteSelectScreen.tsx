// screens/RouteSelectScreen.tsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { useThemeStyles } from "../styles/theme";
import { createGlobalStyles } from "../styles/globalStyles";
import { fetchRouteList } from "../lib/api";
import { useRouteSelection } from "../context/RouteSelectionContext";
import { syncRouteToOffline } from "../lib/bringOffline";
import { useAuth } from "../context/AuthContext";  // 👈 NEW

type RouteItem = {
  id: number;
  slug: string;
  name: string;
  region?: string;
};

export default function RouteSelectScreen({ navigation }: any) {
  const { colors, styles: baseStyles } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);

  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 🔎 search
  const [query, setQuery] = useState("");

  const { selectedRouteIds, toggleRoute } = useRouteSelection();
  const { userToken, user } = useAuth();              // 👈 NEW
  const [syncingRouteId, setSyncingRouteId] = useState<number | null>(null); // 👈 NEW

  // Fetch route list
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

  // 🔎 Fast in-memory filter (name or region, case-insensitive)
  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter((r) => {
      const name = r.name?.toLowerCase() ?? "";
      const region = r.region?.toLowerCase() ?? "";
      return name.includes(q) || region.includes(q);
    });
  }, [routes, query]);

  // 👇 NEW: basic test handler for taking a route offline
  const handleDownloadRoute = useCallback(
    async (routeId: number, routeName: string) => {
      if (!userToken) {
        Alert.alert(
          "Login required",
          "You must be logged in to sync routes for offline use."
        );
        return;
      }

      try {
        setSyncingRouteId(routeId);
        await syncRouteToOffline(routeId, {
          token: userToken,
          currentUserId: user?.id,
        });

        Alert.alert(
          "Offline ready",
          `Route "${routeName}" has been synced to the offline database.`
        );
      } catch (err: any) {
        console.error("syncRouteToOffline error:", err);
        Alert.alert(
          "Sync failed",
          err?.message ?? "Failed to sync route for offline use."
        );
      } finally {
        setSyncingRouteId(null);
      }
    },
    [userToken, user?.id]
  );

  if (loading) {
    return (
      <View style={[globalStyles.container, { padding: 16 }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[globalStyles.subText, { marginTop: 8 }]}>
          Loading routes…
        </Text>
      </View>
    );
  }

  return (
    <View style={[globalStyles.container, { padding: 16 }]}>
      <Text style={globalStyles.headerText}>Select Routes</Text>

      {/* 🔎 Search input */}
      <View style={globalStyles.input}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name / region…"
          placeholderTextColor={colors.textSecondary}
          style={{
            flex: 1,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: colors.textPrimary,
          }}
          returnKeyType="search"
        />
        {!!query && (
          <TouchableOpacity
            onPress={() => setQuery("")}
            style={{ paddingHorizontal: 12, paddingVertical: 10 }}
          >
            <Text style={{ color: colors.textSecondary }}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Create new route button */}
      <TouchableOpacity
        style={[
          globalStyles.button,
          {
            backgroundColor: colors.accent,
            marginVertical: 8,
            paddingVertical: 10,
            width: "100%",
          },
        ]}
        onPress={() => navigation.navigate("RouteCreate")}
      >
        <Text style={globalStyles.buttonText}>＋ Create / Upload Route</Text>
      </TouchableOpacity>

      <FlatList
        data={filteredRoutes}
        keyExtractor={(item) => String(item.id)}
        style={{ width: "100%", marginTop: 8 }}
        refreshing={refreshing}
        onRefresh={loadRoutes}
        renderItem={({ item }) => {
          const isSelected = selectedRouteIds.includes(item.id);
          const isSyncing = syncingRouteId === item.id;

          return (
            <TouchableOpacity
              style={{
                padding: 12,
                marginVertical: 6,
                marginHorizontal: 16,
                borderRadius: 12,
                backgroundColor: isSelected
                  ? colors.primary
                  : colors.backgroundAlt,
                borderWidth: 1,
                borderColor: colors.accent,
              }}
              onPress={() => toggleRoute({ id: item.id, name: item.name })}
              activeOpacity={0.8}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      globalStyles.bodyText,
                      {
                        color: isSelected
                          ? colors.background
                          : colors.textPrimary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {item.region && (
                    <Text
                      style={[
                        globalStyles.subText,
                        {
                          color: isSelected
                            ? colors.background
                            : colors.textSecondary,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.region}
                    </Text>
                  )}
                </View>

                {/* 👇 NEW: simple "Offline" test button */}
                <TouchableOpacity
                  onPress={() => handleDownloadRoute(item.id, item.name)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: colors.accent,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                  activeOpacity={0.9}
                >
                  {isSyncing ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.background}
                    />
                  ) : (
                    <Text
                      style={{
                        color: colors.background,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      Offline
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text
            style={[
              globalStyles.subText,
              { marginTop: 10, color: colors.textSecondary },
            ]}
          >
            {routes.length ? "No matching routes." : "No routes found."}
          </Text>
        }
      />
    </View>
  );
}
