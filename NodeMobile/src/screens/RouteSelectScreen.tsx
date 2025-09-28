// screens/RouteSelectScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { baseStyles, colors } from "../styles/theme";
import { fetchRouteList } from "../lib/api";

type RouteItem = {
  id: number;
  slug: string;
  name: string;
  region?: string;
};

export default function RouteSelectScreen({ navigation }: any) {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchRouteList();
        setRoutes(list);
      } catch (e) {
        console.error("Failed to fetch routes:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (id: number) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const confirmSelection = () => {
    navigation.navigate("Map", { routeIds: selected });
  };

  if (loading) {
    return (
      <View style={baseStyles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={baseStyles.subText}>Loading routes…</Text>
      </View>
    );
  }

  return (
    <View style={[baseStyles.container, { padding: 16 }]}>
      <Text style={baseStyles.headerText}>Select Routes</Text>

      <FlatList
        data={routes}
        keyExtractor={(item) => String(item.id)}
        style={{ width: "100%", marginTop: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{
              padding: 12,
              marginVertical: 6,
              marginHorizontal: 16,
              borderRadius: 12,
              backgroundColor: selected.includes(item.id)
                ? colors.primary
                : colors.backgroundAlt,
              borderWidth: 1,
              borderColor: colors.accent,
            }}
            onPress={() => toggle(item.id)}
          >
            <Text style={baseStyles.bodyText}>{item.name}</Text>
            {item.region && (
              <Text style={baseStyles.subText}>{item.region}</Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={baseStyles.subText}>No routes found.</Text>
        }
      />

      <TouchableOpacity
        style={[baseStyles.button, baseStyles.buttonPrimary]}
        onPress={confirmSelection}
      >
        <Text style={baseStyles.buttonText}>Show on Map</Text>
      </TouchableOpacity>
    </View>
  );
}
