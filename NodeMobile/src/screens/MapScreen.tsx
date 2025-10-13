// src/screens/MapScreen.tsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { StyleSheet, View, ActivityIndicator, Text } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useRouteSelection } from "../context/RouteSelectionContext";
import { useGeolocation } from "../hooks/useGeolocation";
import { fetchRouteGeo } from "../lib/api";
import { flattenToLatLng } from "../utils/geoUtils";
import LeafletMap, { LatLng } from "../components/LeafletMap/LeafletMap";
import { colors } from "../styles/theme";
import { fetchWaypoints } from "../lib/waypoints";
import { WaypointPopup } from "../components/LeafletMap/WaypointPopup";
import { WaypointDetail } from "../components/LeafletMap/WaypointDetail";

const DEFAULT_CENTER: LatLng = [37.7749, -122.4194];
const DEFAULT_ZOOM = 15;

const MapScreen: React.FC = () => {
  const { selectedRouteIds } = useRouteSelection();
  const navigation = useNavigation<any>();

  const [coords, setCoords] = useState<LatLng[]>([]);
  const [waypoints, setWaypoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLocationLoaded, setInitialLocationLoaded] = useState(false);
  const [selectedWaypoint, setSelectedWaypoint] = useState<any | null>(null);
  const [showWaypointDetail, setShowWaypointDetail] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const {
    location,
    loading: locationLoading,
    error: locationError,
    getCurrentLocation,
    requestPermission,
    startWatching,
    stopWatching,
  } = useGeolocation({
    enableHighAccuracy: true,
    distanceFilter: 5,
    interval: 3000,
    showPermissionAlert: true,
    showErrorAlert: false,
  });

  // ---- Load helpers (memoized so we can call on focus) ----
  const loadRoutes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (selectedRouteIds.length === 0) {
        setCoords([]);
        setWaypoints([]);
        return;
      }

      const allCoords: LatLng[] = [];
      for (const id of selectedRouteIds) {
        const geo = await fetchRouteGeo(id);
        if (geo) allCoords.push(...flattenToLatLng(geo));
      }
      setCoords(allCoords);
    } catch (e: any) {
      setError(e?.message || "Failed to load routes");
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(selectedRouteIds)]);

  const loadWaypoints = useCallback(async () => {
    if (selectedRouteIds.length === 0) {
      setWaypoints([]);
      return;
    }
    try {
      const all: any[] = [];
      for (const id of selectedRouteIds) {
        const wps = await fetchWaypoints(id);
        all.push(...wps);
      }
      setWaypoints(all);
      console.log(`[MapScreen] Loaded ${all.length} waypoints`);
    } catch (err) {
      console.error("Failed to fetch waypoints:", err);
    }
  }, [JSON.stringify(selectedRouteIds)]);

  // ---- Init location tracking ----
  useEffect(() => {
    let mounted = true;
    const initLocationTracking = async () => {
      const hasPermission = await requestPermission();
      if (!hasPermission || !mounted) return;

      const watchId = startWatching();
      if (watchId !== null) {
        watchIdRef.current = watchId;
      } else {
        const intervalId = setInterval(() => {
          getCurrentLocation();
        }, 10000);
        watchIdRef.current = intervalId as any;
      }
    };
    initLocationTracking();

    return () => {
      mounted = false;
      if (watchIdRef.current !== null) {
        stopWatching(watchIdRef.current);
      }
    };
  }, [requestPermission, startWatching, stopWatching, getCurrentLocation]);

  // Track initial location load
  useEffect(() => {
    if (location && !initialLocationLoaded) setInitialLocationLoaded(true);
  }, [location, initialLocationLoaded]);

  // Load routes when selected routes change
  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadRoutes();
      if (!mounted) return;
    })();
    return () => {
      mounted = false;
    };
  }, [loadRoutes]);

  // Load waypoints when selected routes change
  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadWaypoints();
      if (!mounted) return;
    })();
    return () => {
      mounted = false;
    };
  }, [loadWaypoints]);

  // 🔁 Refetch when the screen regains focus (after creating a waypoint)
  useFocusEffect(
    useCallback(() => {
      // Clear any open popup when refocusing (optional)
      setSelectedWaypoint(null);
      // Refresh waypoints (and routes if you want)
      loadWaypoints();
      // If your route geometry can change when creating waypoints, also do:
      // loadRoutes();
    }, [loadWaypoints /*, loadRoutes*/])
  );

  // Derived values
  const userLocation = location ? ([location.lat, location.lng] as LatLng) : null;
  const mapCenter = userLocation || DEFAULT_CENTER;
  const showLocationLoading = locationLoading && !initialLocationLoaded;
  const showError = error || (locationError && !initialLocationLoaded);

  const handleMapLongPress = (lat: number, lon: number) => {
    console.log("Long press at:", lat, lon);
    // LeafletHTML + LeafletMap now handle the temp marker + popup
  };

    const handleExpandWaypoint = () => {
      if (selectedWaypoint?.name === "Marked Location") {
        navigation.navigate("WaypointCreate", {
          lat: selectedWaypoint.lat,
          lon: selectedWaypoint.lon,
        });
      } else {
        setShowWaypointDetail(true);
      }
    };

    const handleCloseWaypointDetail = () => {
      setShowWaypointDetail(false);
      setSelectedWaypoint(null);
    };


  return (
    <View style={styles.container}>
      <LeafletMap
        coordinates={coords}
        userLocation={userLocation}
        center={mapCenter}
        zoom={DEFAULT_ZOOM}
        onMapLongPress={handleMapLongPress}
        waypoints={waypoints}
        onWaypointPress={(wp) => {
          if (!wp) {
            // 🧭 User tapped off-map: clear both popup and detail
            setSelectedWaypoint(null);
            setShowWaypointDetail(false);
          } else {
            // 🪧 User tapped a waypoint
            setSelectedWaypoint(wp);
          }
        }}
      />


      {(loading || showLocationLoading) && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.overlayText}>
            {loading ? "Loading routes…" : "Getting location..."}
          </Text>
        </View>
      )}

      <WaypointPopup
        visible={!!selectedWaypoint && !showWaypointDetail}
        name={selectedWaypoint?.name ?? ""}
        description={selectedWaypoint?.description ?? ""}
        type={selectedWaypoint?.type}
        username={selectedWaypoint?.username ?? "Unknown user"}
        dateUploaded={selectedWaypoint?.created_at ?? ""}
        distance={selectedWaypoint?.distance}
        votes={selectedWaypoint?.votes ?? 0}
        iconRequire={selectedWaypoint?.iconRequire}
        onUpvote={() => console.log("Upvoted", selectedWaypoint?.id)}
        onDownvote={() => console.log("Downvoted", selectedWaypoint?.id)}
        onExpand={handleExpandWaypoint}
        onClose={() => setSelectedWaypoint(null)}
      />

      <WaypointDetail
        visible={showWaypointDetail}
        name={selectedWaypoint?.name ?? ""}
        description={selectedWaypoint?.description ?? ""}
        type={selectedWaypoint?.type ?? "generic"}
        username={selectedWaypoint?.username ?? "Unknown user"}
        dateUploaded={selectedWaypoint?.created_at ?? ""}
        distance={selectedWaypoint?.distance}
        votes={selectedWaypoint?.votes ?? 0}
        onUpvote={() => console.log("Upvoted", selectedWaypoint?.id)}
        onDownvote={() => console.log("Downvoted", selectedWaypoint?.id)}
        onClose={handleCloseWaypointDetail}
        iconRequire={selectedWaypoint?.iconRequire}
      />


      {showError && (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>{error || locationError}</Text>
        </View>
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  overlayText: { marginTop: 12, fontSize: 16, color: colors.text },
  errorText: {
    color: "#b00020",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  trackingIndicator: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accent,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  trackingText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
});

export default MapScreen;
