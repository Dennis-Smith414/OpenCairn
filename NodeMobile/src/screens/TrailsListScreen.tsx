import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { API_BASE, fetchTrailList } from "../lib/api";

type TrailRow = {
  id: number | string;
  slug?: string;
  name: string;
  distance_m?: number | null;
  points_n?: number | null;
  updated_at?: string;
};

export default function TrailsListScreen({ navigation }: { navigation: any }) {
  const [items, setItems] = useState<TrailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const list = await fetchTrailList();
        if (alive) setItems(Array.isArray(list) ? list : []);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={S.center}>
        <ActivityIndicator />
        <Text style={S.subtle}>Loading from {API_BASE}</Text>
      </View>
    );
  }

  if (err) {
    return (
      <View style={S.center}>
        <Text style={S.err}>Error: {err}</Text>
        <Text style={S.subtle}>{API_BASE}</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={S.center}>
        <Text>No trails found.</Text>
        <Text style={S.subtle}>{API_BASE}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(it) => String(it.id)}
      contentContainerStyle={{ padding: 16 }}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListHeaderComponent={() => (
        <Text style={S.header}>Trails ({items.length})</Text>
      )}
      renderItem={({ item }) => {
        const km =
          item.distance_m != null
            ? (item.distance_m / 1000).toFixed(2) + " km"
            : "—";
        return (
          <TouchableOpacity
            style={S.row}
            onPress={() =>
              navigation.navigate("TrailMap", {
                id: Number(item.id),
                name: item.name,
              })
            }
          >
            <Text style={S.title}>{item.name}</Text>
            <Text style={S.subtle}>Distance: {km}</Text>
            {item.updated_at && (
              <Text style={S.subtle}>
                Updated: {new Date(item.updated_at).toLocaleString()}
              </Text>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const S = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  err: { color: "#b00020", marginTop: 8, textAlign: "center" },
  header: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  row: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fff",
    elevation: 2, // Android shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  title: { fontSize: 16, fontWeight: "600", color: "#111", marginBottom: 4 },
  subtle: { color: "#666" },
});
