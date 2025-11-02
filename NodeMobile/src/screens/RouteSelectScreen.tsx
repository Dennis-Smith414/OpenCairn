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
import { fetchRouteList } from "../lib/api";
import { useRouteSelection } from "../context/RouteSelectionContext";

type RouteItem = {
  id: number;
  slug: string;
  name: string;
  region?: string;
};

export default function RouteSelectScreen({ navigation }: any) {
  const { colors, styles: baseStyles } = useThemeStyles();
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
      <View style={[baseStyles.container, { padding: 16 }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[baseStyles.subText, { marginTop: 8 }]}>
          Loading routes…
        </Text>
      </View>
    );
  }

  return (
    <View style={[baseStyles.container, { padding: 16, backgroundColor: colors.background }]}>
      <Text style={[baseStyles.headerText, { color: colors.textPrimary }]}>
        Select Routes
      </Text>

      {/* 🔎 Search input */}
      <View
        style={{
          width: "100%",
          marginTop: 10,
          marginBottom: 6,
          borderWidth: 1,
          borderColor: colors.accent,
          borderRadius: 12,
          backgroundColor: colors.backgroundAlt,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
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
          <TouchableOpacity onPress={() => setQuery("")} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text style={{ color: colors.textSecondary }}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Create new route button */}
      <TouchableOpacity
        style={[
          baseStyles.button,
          { backgroundColor: colors.accent, marginVertical: 8, paddingVertical: 10, width: "100%" },
        ]}
        onPress={() => navigation.navigate("RouteCreate")}
      >
        <Text style={baseStyles.buttonText}>＋ Create / Upload Route</Text>
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
            <TouchableOpacity
              style={{
                padding: 12,
                marginVertical: 6,
                marginHorizontal: 16,
                borderRadius: 12,
                backgroundColor: isSelected ? colors.primary : colors.backgroundAlt,
                borderWidth: 1,
                borderColor: colors.accent,
              }}
              onPress={() => toggleRoute({ id: item.id, name: item.name })}
            >
              <Text
                style={[
                  baseStyles.bodyText,
                  { color: isSelected ? colors.background : colors.textPrimary },
                ]}
              >
                {item.name}
              </Text>
              {!!item.region && (
                <Text
                  style={[
                    baseStyles.subText,
                    { color: isSelected ? colors.background : colors.textSecondary },
                  ]}
                >
                  {item.region}
                </Text>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={[baseStyles.subText, { marginTop: 10, color: colors.textSecondary }]}>
            {routes.length ? "No matching routes." : "No routes found."}
          </Text>
        }
      />
    </View>
  );
}
