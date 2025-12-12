// src/screens/MapScreen.tsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { StyleSheet, View, ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useRouteSelection } from "../context/RouteSelectionContext";
import { useGeolocation } from "../hooks/useGeolocation";
import { fetchRouteGeo } from "../lib/api";
import { featureCollectionToSegments } from "../utils/geoUtils";
import { colors } from "../styles/theme";
import { fetchWaypoints, fetchWaypoint } from "../lib/waypoints";
import { WaypointPopup } from "../components/MapLibre/WaypointPopup";
import { WaypointDetail } from "../components/MapLibre/WaypointDetail";
import TripTracker from '../components/TripTracker/TripTracker';

// NEW: MapLibre map component (Leaflet-compatible props)
import MapLibreMap, { LatLng, Track } from "../components/MapLibre/MapLibreMap";

//43.075678763073164, -87.88565891395142

const DEFAULT_CENTER: LatLng = [43.075678763073164, -87.88565891395142];
const DEFAULT_ZOOM = 15;

// Add distance calculation utility
const calculateDistance = (coord1: LatLng, coord2: LatLng): number => {
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const MapScreen: React.FC = () => {
  const { selectedRouteIds, selectedRoutes } = useRouteSelection();
  const navigation = useNavigation<any>();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [waypoints, setWaypoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLocationLoaded, setInitialLocationLoaded] = useState(false);
  const [selectedWaypoint, setSelectedWaypoint] = useState<any | null>(null);
  const [showWaypointDetail, setShowWaypointDetail] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const [tripStats, setTripStats] = useState<any>(null);
  const [routeTotalDistance, setRouteTotalDistance] = useState<number>(0);
  const [showTripTracker, setShowTripTracker] = useState(true);
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

  // Calculate total route distance
  const calculateTotalRouteDistance = useCallback((tracks: Track[]): number => {
    let totalDistance = 0;
    tracks.forEach(track => {
      if (Array.isArray(track.coords[0])) {
        // Track.coords is LatLng[][]
        (track.coords as LatLng[][]).forEach(segment => {
          for (let i = 1; i < segment.length; i++) {
            totalDistance += calculateDistance(segment[i-1], segment[i]);
          }
        });
      } else {
        // Track.coords is LatLng[]
        const coords = track.coords as LatLng[];
        for (let i = 1; i < coords.length; i++) {
          totalDistance += calculateDistance(coords[i-1], coords[i]);
        }
      }
    });
    return totalDistance;
  }, []);

  // ---- Load helpers (memoized so we can call on focus) ----
  const loadRoutes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (selectedRouteIds.length === 0) {
        setTracks([]);
        setWaypoints([]);
        setRouteTotalDistance(0);
        return;
      }

      const nextTracks: Track[] = [];
      for (const id of selectedRouteIds) {
        const fc = await fetchRouteGeo(id);
        if (!fc) continue;
        const segments = featureCollectionToSegments(fc); // LatLng[][]
        if (segments.length === 0) continue;
        nextTracks.push({
          id,
          coords: segments,
          color: selectedRoutes.find((r) => r.id === id)?.color,
        });
      }
      setTracks(nextTracks);

      const totalDist = calculateTotalRouteDistance(nextTracks);
      setRouteTotalDistance(totalDist);

    } catch (e: any) {
      setError(e?.message || "Failed to load routes");
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(selectedRouteIds), calculateTotalRouteDistance]);

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

  useEffect(() => {
    if (location && !initialLocationLoaded) setInitialLocationLoaded(true);
  }, [location, initialLocationLoaded]);

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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await loadWaypoints();

        const id = selectedWaypoint?.id;
        if (!id) return;

        try {
          const fresh = await fetchWaypoint(id);
          if (!active) return;

          setWaypoints((prev) => prev.map((w) => (w.id === fresh.id ? { ...w, ...fresh } : w)));
          setSelectedWaypoint((prev) => (prev && prev.id === fresh.id ? { ...prev, ...fresh } : prev));
        } catch (e) {
          console.warn("[MapScreen] refresh selected waypoint failed:", e);
        }
      })();

      return () => {
        active = false;
      };
    }, [loadWaypoints, selectedWaypoint?.id])
  );

  const userLocation = location ? ([location.lat, location.lng] as LatLng) : null;
  const mapCenter = userLocation || DEFAULT_CENTER;
  const showLocationLoading = locationLoading && !initialLocationLoaded;
  const showError = error || (locationError && !initialLocationLoaded);

  const handleMapLongPress = (lat: number, lon: number) => {
    console.log("Long press at:", lat, lon);
  };

  //Trigger to move TripTracker UI 
  //const hasActiveWaypoint = (!!selectedWaypoint && !showWaypointDetail) || showWaypointDetail;

  const hasActiveWaypoint = !!selectedWaypoint;
  const hasWaypointDetail = !!showWaypointDetail;

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

  const handleWaypointDeleted = () => {
    setShowWaypointDetail(false);
    setSelectedWaypoint(null);
    loadWaypoints();
  };

  return (
    <View style={styles.container}>
      <MapLibreMap
        tracks={tracks}
        userLocation={userLocation}
        autoFitOnTracks
        center={mapCenter}
        zoom={DEFAULT_ZOOM}
        onMapLongPress={handleMapLongPress}
        waypoints={waypoints}
        onWaypointPress={(wp) => {
          if (!wp) {
            setSelectedWaypoint(null);
            setShowWaypointDetail(false);
          } else {
            setSelectedWaypoint(wp);
          }
        }}
        showTrackingButton
      />

      <TouchableOpacity
        style={styles.trackerToggleButton}
        onPress={() => setShowTripTracker(prev => !prev)}
        activeOpacity={0.7}
      >
      <Text style={styles.toggleButtonText}>
          {showTripTracker ? '📊' : '📊'}
        </Text>
      </TouchableOpacity>

      {/* Trip Tracker Component */}
    {tracks.length > 0 && (
      <TripTracker
        totalRouteDistance={routeTotalDistance}
        currentPosition={userLocation}
        tracks={tracks}
        onStatsUpdate={setTripStats}
        hasActiveWaypoint={!!selectedWaypoint && !showWaypointDetail}
        hasWaypointDetail={hasWaypointDetail}
        visible={showTripTracker && !showWaypointDetail}
      />
    )}

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
        id={selectedWaypoint?.id}
        name={selectedWaypoint?.name ?? ""}
        description={selectedWaypoint?.description ?? ""}
        type={selectedWaypoint?.type}
        username={selectedWaypoint?.username ?? "Unknown user"}
        dateUploaded={selectedWaypoint?.created_at ?? ""}
        distance={selectedWaypoint?.distance}
        iconRequire={selectedWaypoint?.iconRequire}
        onExpand={handleExpandWaypoint}
        onClose={() => setSelectedWaypoint(null)}
      />
      {showError && (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>{error || locationError}</Text>
        </View>
      )}

      {selectedWaypoint && (
        <View
          style={styles.waypointDetailWrapper}
          pointerEvents="box-none"
        >
          <WaypointDetail
            visible={showWaypointDetail}
            id={selectedWaypoint?.id}
            name={selectedWaypoint?.name ?? ""}
            description={selectedWaypoint?.description ?? ""}
            type={selectedWaypoint?.type ?? "generic"}
            username={selectedWaypoint?.username ?? "Unknown user"}
            dateUploaded={selectedWaypoint?.created_at ?? ""}
            distance={selectedWaypoint?.distance}
            onClose={handleCloseWaypointDetail}
            iconRequire={selectedWaypoint?.iconRequire}
            ownerId={selectedWaypoint?.user_id}
            onDeleted={handleWaypointDeleted}
          />
        </View>
      )}
    </View>
  );
};


const styles = StyleSheet.create({
  container: { flex: 1 },
  trackerToggleButton: {
    position: 'absolute',
    bottom: 450,
    right: 6,
    backgroundColor: '#fff', 
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    
    // Shadow/Elevation
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 1000,
  },

  toggleButtonText: {
    fontSize: 26,
    color: '#000', 
    textAlign: 'center',
  },

  toggleButtonIcon: {
    fontSize: 28,
    color: '#000', 
  },
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
    waypointDetailWrapper: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,      // iOS
      elevation: 9999,   // Android
    },
});

export default MapScreen;
