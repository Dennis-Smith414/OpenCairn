// screens/RouteSelectScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { globalStyles, theme } from '../styles/globalStyles'; // <-- NEW IMPORT
import { fetchRouteList } from "../lib/api";
import { useRouteSelection } from "../context/RouteSelectionContext";

type RouteItem = {
  id: number;
  slug: string;
  name: string;
  region?: string;
};

export default function RouteSelectScreen({ navigation }: any) {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { selectedRoutes, selectedRouteIds, toggleRoute, clearSelection } = useRouteSelection();

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

  if (loading) {
    return (
      <View style={globalStyles.container}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={globalStyles.subText}>Loading routes…</Text>
      </View>
    );
  }

  return (
    <View style={[globalStyles.container, { padding: 16 }]}>
      <Text style={globalStyles.headerText}>Select Routes</Text>

      {/* Create new route button */}
      <TouchableOpacity
        style={[
          globalStyles.button,
          {
            backgroundColor: theme.colors.accent,
            marginVertical: 8,
            paddingVertical: 10,
          },
        ]}
        onPress={() => navigation.navigate("RouteCreate")}
      >
        <Text style={globalStyles.buttonText}>＋ Create / Upload Route</Text>
      </TouchableOpacity>

      <FlatList
        data={routes}
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
                backgroundColor: isSelected
                  ? theme.colors.primary
                  : theme.colors.backgroundAlt,
                borderWidth: 1,
                borderColor: theme.colors.accent,
              }}
              onPress={() => toggleRoute({ id: item.id, name: item.name })} // ✅ updated
            >
              <Text style={globalStyles.bodyText}>{item.name}</Text>
              {item.region && (
                <Text style={globalStyles.subText}>{item.region}</Text>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={globalStyles.subText}>No routes found.</Text>}
      />
    </View>
  );
}
