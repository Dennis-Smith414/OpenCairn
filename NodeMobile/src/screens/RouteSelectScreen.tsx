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
import { fetchRouteList, toggleRouteUpvote } from "../lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouteSelection } from "../context/RouteSelectionContext";

type RouteItem = {
  id: number;
  slug: string;
  name: string;
  region?: string;
  upvotes?: number; // from backend
};

export default function RouteSelectScreen({ navigation }: any) {
  const { colors } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);

  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 🔎 search
  const [query, setQuery] = useState("");

  const { selectedRouteIds, toggleRoute } = useRouteSelection();

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

  // Upvote handler (must be before any early return)
  const handleUpvote = useCallback(async (routeId: number) => {
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        Alert.alert("Login required", "You must be logged in to upvote routes.");
        return;
      }

      const result = await toggleRouteUpvote(routeId, token);

      // Update only that route's upvote count
      setRoutes((prev) =>
        prev.map((r) =>
          r.id === routeId ? { ...r, upvotes: result.upvotes } : r
        )
      );
    } catch (e: any) {
      console.error("Upvote failed:", e);
      Alert.alert("Error", "Could not upvote route.");
    }
  }, []);

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

          return (
            <View
              style={{
                marginVertical: 6,
                marginHorizontal: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.accent,
                backgroundColor: isSelected
                  ? colors.primary
                  : colors.backgroundAlt,
              }}
            >
              {/* Top row: name/region + upvote */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {/* Left: tap to select route */}
                <TouchableOpacity
                  style={{ flex: 1, padding: 12 }}
                  onPress={() =>
                    toggleRoute({ id: item.id, name: item.name })
                  }
                >
                  <Text
                    style={[
                      globalStyles.bodyText,
                      {
                        color: isSelected
                          ? colors.background
                          : colors.textPrimary,
                      },
                    ]}
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
                          marginTop: 2,
                        },
                      ]}
                    >
                      {item.region}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Right: upvote button + count */}
                <View
                  style={{
                    paddingRight: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => handleUpvote(item.id)}
                    style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                  >
                    <Text style={{ color: colors.accent, fontSize: 18 }}>
                      ▲
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12,
                      marginTop: -2,
                    }}
                  >
                    {item.upvotes ?? 0}
                  </Text>
                </View>
              </View>

              {/* Bottom row: comments button (left aligned under region) */}
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingBottom: 8,
                  paddingTop: 4,
                }}
              >
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate("RouteComments", {
                      routeId: item.id,
                      routeName: item.name,
                    })
                  }
                >
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: 13,
                    }}
                  >
                    View comments
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
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
