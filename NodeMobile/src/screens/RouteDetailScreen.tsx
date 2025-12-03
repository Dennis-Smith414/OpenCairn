// screens/RouteDetailScreen.tsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";

import { useThemeStyles } from "../styles/theme";
import { createGlobalStyles } from "../styles/globalStyles";
import { fetchRouteDetail } from "../lib/routes";
import { CommentList } from "../components/comments/CommentList";
import { syncRouteToOffline } from "../lib/bringOffline";
import { useAuth } from "../context/AuthContext";
import { useRouteSelection } from "../context/RouteSelectionContext"; // ✅ NEW
import { getRouteOffline } from "../offline/routes/routes";


export default function RouteDetailScreen({ route, navigation }) {
  const { colors } = useThemeStyles();
  const globalStyles = createGlobalStyles(colors);
  const { user, userToken } = useAuth();

  const { selectedRouteIds, toggleRoute } = useRouteSelection(); // ✅ NEW

  const { routeId, routeName } = route.params;

  const [detail, setDetail] = useState<any>(null);
  const [gpx, setGpx] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [syncing, setSyncing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true);
      const { route: data, gpx } = await fetchRouteDetail(routeId, {
        includeGpx: true,
      });

      console.log("[RouteDetail] loaded route:", data);

      setDetail(data);
      setGpx(gpx);

      if (data?.name) {
        navigation.setOptions?.({ title: data.name });
      }
    } catch (err) {
      console.error("[RouteDetail] load error:", err);
    } finally {
      setLoading(false);
    }
  }, [routeId, navigation]);

    const refreshOfflineStatus = useCallback(async () => {
      try {
        const offlineRoute = await getRouteOffline(routeId);
        setIsOffline(!!offlineRoute);
      } catch (err) {
        console.log("[RouteDetail] offline status check failed:", err);
        setIsOffline(false);
      }
    }, [routeId]);

  useEffect(() => {
    if (routeName) {
      navigation.setOptions?.({ title: routeName });
    }
    loadDetail();
    refreshOfflineStatus();

  }, [loadDetail, routeName, refreshOfflineStatus]);

  const gpxNames = useMemo(() => {
    if (!gpx?.features) return [];
    return gpx.features
      .map((f) => f.properties?.name || null)
      .filter((n) => n && n.trim().length > 0);
  }, [gpx]);

  const handleOfflineSave = async () => {
    if (!userToken) {
      Alert.alert(
        "Login required",
        "You must be logged in to save routes offline."
      );
      return;
    }

    try {
      setSyncing(true);
      await syncRouteToOffline(routeId, {
        token: userToken,
        currentUserId: user?.id,
      });

      await refreshOfflineStatus();

      Alert.alert("Offline Ready", `This route is now available offline.`);
    } catch (err: any) {
      console.error("sync offline error:", err);
      Alert.alert("Sync failed", err?.message ?? "Couldn't sync route.");
    } finally {
      setSyncing(false);
    }
  };

  // Toggle selection handler
  const handleToggleSelected = () => {
    if (!detail?.id) return;

    toggleRoute({
      id: detail.id,
      name: detail.name,
    });

    const nowSelected = !selectedRouteIds.includes(detail.id);
    Alert.alert(
      nowSelected ? "Added to Map" : "Removed from Map",
      nowSelected
        ? "This route will now appear on your map."
        : "This route was removed from your map."
    );
  };

  if (loading && !detail) {
    return (
      <View style={[globalStyles.container, { padding: 16 }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[globalStyles.subText, { marginTop: 8 }]}>
          Loading route…
        </Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={[globalStyles.container, { padding: 16 }]}>
        <Text style={globalStyles.headerText}>Route not found</Text>
        <Text style={[globalStyles.subText, { marginTop: 8 }]}>
          Could not load this route.
        </Text>
      </View>
    );
  }

  const createdStr = detail.created_at
    ? new Date(detail.created_at).toLocaleDateString()
    : "";
  const updatedStr =
    detail.updated_at && detail.updated_at !== detail.created_at
      ? new Date(detail.updated_at).toLocaleDateString()
      : "";

  const isSelected = selectedRouteIds.includes(detail.id);

  return (
    <View style={[globalStyles.container, { padding: 16 }]}>
      {/* Back Button (matches SettingsScreen style) */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ alignSelf: "flex-start", marginLeft: 8, marginBottom: 8 }}
      >
        <Text style={{ fontSize: 16, color: colors.accent }}>← Back</Text>
      </TouchableOpacity>

      {/* ------- TITLE ------- */}
      <Text style={globalStyles.headerText}>{detail.name}</Text>

      {detail.description ? (
        <Text
          style={[
            globalStyles.bodyText,
            {
              color: colors.textPrimary,
              marginTop: 6,
              marginBottom: 4,
            },
          ]}
        >
          {detail.description}
        </Text>
      ) : null}

      {/* ------- META CARD ------- */}
      <View
        style={{
          marginTop: 6,
          marginBottom: 16,
          padding: 12,
          borderRadius: 10,
          backgroundColor: colors.card,
        }}
      >
        {detail.region && (
          <Text
            style={[
              globalStyles.bodyText,
              { color: colors.textPrimary, marginBottom: 6 },
            ]}
          >
            Region: <Text style={{ fontWeight: "600" }}>{detail.region}</Text>
          </Text>
        )}

        <Text
          style={[
            globalStyles.subText,
            { color: colors.textSecondary, marginBottom: 4 },
          ]}
        >
          Created by:{" "}
          <Text style={{ fontWeight: "600", color: colors.textPrimary }}>
            {detail.username || "Unknown"}
          </Text>
        </Text>

        {createdStr ? (
          <Text style={[globalStyles.subText, { color: colors.textSecondary }]}>
            Created: {createdStr}
          </Text>
        ) : null}

        {updatedStr ? (
          <Text
            style={[
              globalStyles.subText,
              { color: colors.textSecondary, marginTop: 4 },
            ]}
          >
            Updated: {updatedStr}
          </Text>
        ) : null}

        {gpxNames.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text
              style={[
                globalStyles.bodyText,
                { color: colors.textPrimary, marginBottom: 4 },
              ]}
            >
              GPX Files
            </Text>

            {gpxNames.map((name, idx) => (
              <Text
                key={idx}
                style={[
                  globalStyles.subText,
                  { color: colors.textSecondary, marginTop: 2 },
                ]}
              >
                • {name}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* ------- COMMENTS ------- */}
      <View
        style={{
          flex: 1,
          width: "100%",
          paddingBottom: 54,
        }}
      >
        <Text
          style={[
            globalStyles.bodyText,
            { color: colors.textPrimary, marginBottom: 6 },
          ]}
        >
          Comments
        </Text>

        <CommentList routeId={detail.id} />
      </View>

      {/* ------- BOTTOM BUTTON ROW ------- */}
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          marginTop: 8,
        }}
      >
        {/* SELECT/DESELECT ROUTE BUTTON */}
        <TouchableOpacity
          onPress={handleToggleSelected}
          style={[
            globalStyles.button,
            {
              flex: 1,
              marginRight: 8,
              paddingVertical: 12,
              backgroundColor: isSelected ? colors.card : colors.accent,
              borderWidth: isSelected ? 1 : 0,
              borderColor: colors.accent,
            },
          ]}
        >
          <Text
            style={[
              globalStyles.buttonText,
              {
                textAlign: "center",
                color: isSelected
                  ? colors.accent
                  : globalStyles.buttonText?.color,
              },
            ]}
          >
            {isSelected ? "Remove from Map" : "Add to Map"}
          </Text>
        </TouchableOpacity>

        {/* ------- OFFLINE BUTTON ------- */}
        <TouchableOpacity
          onPress={handleOfflineSave}
          disabled={syncing}
          style={[
            globalStyles.button,
            {
              flex: 1,
              marginLeft: 8,
              paddingVertical: 12,
              backgroundColor: isOffline ? colors.card : colors.accent,
              opacity: syncing ? 0.6 : 1,
              borderWidth: isOffline ? 1 : 0,
              borderColor: isOffline ? colors.accent : "transparent",
            },
          ]}
        >
          <Text
            style={[
              globalStyles.buttonText,
              {
                textAlign: "center",
                color: isOffline
                  ? colors.accent
                  : globalStyles.buttonText?.color,
              },
            ]}
          >
            {syncing
              ? "Saving…"
              : isOffline
              ? "Offline Ready"
              : "Save for Offline"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}