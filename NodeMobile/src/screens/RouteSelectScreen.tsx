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
  StyleSheet,
} from "react-native";

import { useThemeStyles } from "../styles/theme";
import { createGlobalStyles } from "../styles/globalStyles";
import { fetchRouteList, toggleRouteUpvote } from "../lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouteSelection } from "../context/RouteSelectionContext";
import { syncRouteToOffline } from "../lib/bringOffline";
import { useAuth } from "../context/AuthContext";
import { useGeolocation } from "../hooks/useGeolocation";

type RouteItem = {
  id: number;
  slug: string;
  name: string;
  region?: string;
  upvotes?: number;
  start_lat?: number | null;
  start_lng?: number | null;
};

const FAVORITES_KEY_BASE = "favorite_route_ids";
const NEARBY_OPTIONS = [10, 25, 50, 75]; // miles

// Simple Haversine distance in miles
function computeDistanceMi(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  searchClear: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});


export default function RouteSelectScreen({ navigation }: any) {
  const { colors, styles: baseStyles } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);


  // auth
  const { user, userToken } = useAuth();

  // Real GPS location (same hook MapScreen uses)
  const { location, requestPermission, getCurrentLocation } = useGeolocation({
    enableHighAccuracy: true,
    distanceFilter: 10,
    interval: 10000,
    showPermissionAlert: true,
    showErrorAlert: false,
  });

  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 🔎 search
  const [query, setQuery] = useState("");

  const { selectedRouteIds, toggleRoute } = useRouteSelection();
  const [syncingRouteId, setSyncingRouteId] = useState<number | null>(null);

  // Favorites
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Nearby
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [nearbyRadiusMi, setNearbyRadiusMi] = useState<number>(
    NEARBY_OPTIONS[1] // default 25
  );

  // Per-user favorites key: different key for each logged-in user
  const favoritesKey = useMemo(
    () =>
      user && user.id != null
        ? `${FAVORITES_KEY_BASE}:user-${user.id}` // e.g. favorite_route_ids:user-4
        : `${FAVORITES_KEY_BASE}:anon`,
    [user]
  );

  // Load favorites whenever the key (i.e., active user) changes
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(favoritesKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setFavoriteIds(parsed);
          } else {
            setFavoriteIds([]);
          }
        } else {
          // brand-new user or no favorites yet
          setFavoriteIds([]);
        }
      } catch (e) {
        console.warn("Failed to load favorite routes", e);
        setFavoriteIds([]);
      }
    })();
  }, [favoritesKey]);

  // Ask for permission and grab one location fix
  useEffect(() => {
    let mounted = true;

    (async () => {
      const ok = await requestPermission();
      if (!ok || !mounted) return;
      await getCurrentLocation();
    })();

    return () => {
      mounted = false;
    };
  }, [requestPermission, getCurrentLocation]);

  // Sync hook location into our currentLocation state
  useEffect(() => {
    if (location) {
      setCurrentLocation({
        latitude: location.lat,
        longitude: location.lng,
      });
    }
  }, [location]);

  const persistFavorites = useCallback(
    async (ids: number[]) => {
      try {
        await AsyncStorage.setItem(favoritesKey, JSON.stringify(ids));
      } catch (e) {
        console.warn("Failed to save favorite routes", e);
      }
    },
    [favoritesKey]
  );

  const toggleFavorite = useCallback(
    (routeId: number) => {
      setFavoriteIds((prev) => {
        let next: number[];
        if (prev.includes(routeId)) {
          next = prev.filter((id) => id !== routeId);
        } else {
          next = [...prev, routeId];
        }
        persistFavorites(next);
        return next;
      });
    },
    [persistFavorites]
  );

  // Fetch route list
  const loadRoutes = useCallback(async () => {
    try {
      setRefreshing(true);
      const list = await fetchRouteList();
      console.log("[RouteSelect] sample route:", list[0]);
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

  // Upvote handler
  const handleUpvote = useCallback(
    async (routeId: number) => {
      try {
        if (!userToken) {
          Alert.alert(
            "Login required",
            "You must be logged in to upvote routes."
          );
          return;
        }

        const result = await toggleRouteUpvote(routeId, userToken);

        setRoutes((prev) =>
          prev.map((r) =>
            r.id === routeId ? { ...r, upvotes: result.upvotes } : r
          )
        );
      } catch (e: any) {
        console.error("Upvote failed:", e);
        Alert.alert("Error", "Could not upvote route.");
      }
    },
    [userToken]
  );

  // Search + Nearby + Favorites filter
  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base: RouteItem[] = routes;

    // Nearby filter – only if we have a location
    if (showNearbyOnly && currentLocation) {
      const { latitude, longitude } = currentLocation;
      base = base.filter((r) => {
        if (r.start_lat == null || r.start_lng == null) return false;
        const dist = computeDistanceMi(
          latitude,
          longitude,
          r.start_lat,
          r.start_lng
        );
        return dist <= nearbyRadiusMi;
      });
    }

    // Favorites filter
    if (showFavoritesOnly) {
      base = base.filter((r) => favoriteIds.includes(r.id));
    }

    // Text search
    if (!q) return base;

    return base.filter((r) => {
      const name = r.name?.toLowerCase() ?? "";
      const region = r.region?.toLowerCase() ?? "";
      return name.includes(q) || region.includes(q);
    });
  }, [
    routes,
    query,
    showFavoritesOnly,
    favoriteIds,
    showNearbyOnly,
    currentLocation,
    nearbyRadiusMi,
  ]);

  // basic handler for taking a route offline
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

      {/* Nearby + Favorites pills */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-start",
          marginTop: 6,
          marginBottom: 4,
        }}
      >
        {/* Nearby pill */}
        <TouchableOpacity
          onPress={() => setShowNearbyOnly((prev) => !prev)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: showNearbyOnly ? colors.accent : colors.border,
            backgroundColor: showNearbyOnly
              ? colors.accent + "22"
              : "transparent",
            marginRight: 8,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: showNearbyOnly ? colors.accent : colors.textSecondary,
            }}
          >
            Nearby ({nearbyRadiusMi} mi)
          </Text>
        </TouchableOpacity>

        {/* Favorites pill */}
        <TouchableOpacity
          onPress={() => setShowFavoritesOnly((prev) => !prev)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: showFavoritesOnly ? colors.accent : colors.border,
            backgroundColor: showFavoritesOnly
              ? colors.accent + "22"
              : "transparent",
          }}
        >
          <Text
            style={{
              marginRight: 4,
              fontSize: 14,
              color: showFavoritesOnly ? colors.accent : colors.textSecondary,
            }}
          >
            {showFavoritesOnly ? "★" : "☆"}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: showFavoritesOnly ? colors.accent : colors.textSecondary,
            }}
          >
            Favorites
          </Text>
        </TouchableOpacity>
      </View>

      {/* Nearby distance options when pill is active */}
      {showNearbyOnly && (
        <View
          style={{
            marginBottom: 10,
            paddingHorizontal: 4,
            alignSelf: "stretch",
          }}
        >
          {currentLocation ? (
            <>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.textSecondary,
                  marginBottom: 6,
                }}
              >
                Show routes within{" "}
                <Text style={{ color: colors.accent }}>
                  {nearbyRadiusMi} miles
                </Text>{" "}
                of your location
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                }}
              >
                {NEARBY_OPTIONS.map((mi) => {
                  const selected = mi === nearbyRadiusMi;
                  return (
                    <TouchableOpacity
                      key={mi}
                      onPress={() => setNearbyRadiusMi(mi)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: selected ? colors.accent : colors.border,
                        backgroundColor: selected
                          ? colors.accent + "33"
                          : "transparent",
                        marginRight: 8,
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: selected
                            ? colors.accent
                            : colors.textSecondary,
                        }}
                      >
                        {mi} mi
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            <Text
              style={{
                fontSize: 12,
                color: colors.textSecondary,
              }}
            >
              Turn on location to use Nearby.
            </Text>
          )}
        </View>
      )}
{/* Search input */}
<View
  style={[
    styles.searchContainer,
    {
      borderColor: colors.border,
      backgroundColor: colors.backgroundAlt,
    },
  ]}
>
<TextInput
  value={query}
  onChangeText={setQuery}
  placeholder="Search name / region…"
  placeholderTextColor={colors.textSecondary ?? "#888"}
  style={[
    styles.searchInput,
    { color: colors.textPrimary },  // ✅ theme-aware text color
  ]}
  returnKeyType="search"
/>

  {!!query && (
    <TouchableOpacity
      onPress={() => setQuery("")}
      style={styles.searchClear}
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

          const isFavorite = favoriteIds.includes(item.id);

          return (
            <View
              style={{
                padding: 12,
                marginVertical: 6,
                marginHorizontal: 16,
                borderRadius: 12,
                backgroundColor: isSelected ? colors.primary : colors.backgroundAlt,
                borderWidth: 1,
                borderColor: colors.accent,
                backgroundColor: isSelected
                  ? colors.primary
                  : colors.backgroundAlt,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
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

                <View
                  style={{
                    paddingRight: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => toggleFavorite(item.id)}
                    style={{ paddingHorizontal: 4, paddingVertical: 2 }}
                  >
                    <Text
                      style={{
                        fontSize: 18,
                        color: isFavorite
                          ? colors.accent
                          : colors.textSecondary,
                      }}
                    >
                      {isFavorite ? "★" : "☆"}
                    </Text>
                  </TouchableOpacity>

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
