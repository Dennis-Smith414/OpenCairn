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
import MapLibreMap, { LatLng, Track, ProgressPoint } from "../components/MapLibre/MapLibreMap";
import { projectOntoSegment } from "../utils/geoProgress";

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
  const [progressMap, setProgressMap] = useState<Record<string | number, ProgressPoint>>({});
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
    // Tighter than before (was 5m / 3s) so the dot updates ~1/sec and the
    // smoothed dot has fresh, frequent targets to glide toward on a walk.
    distanceFilter: 2,
    interval: 1000,
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
  
  //Fix the infite rendering error
  const userLocation = useMemo<LatLng | null>(
    () => (location ? [location.lat, location.lng] : null),
    [location?.lat, location?.lng]
  );
  const mapCenter = userLocation || DEFAULT_CENTER;
  const showLocationLoading = locationLoading && !initialLocationLoaded;
  const showError = error || (locationError && !initialLocationLoaded);

  // How far along each loaded GPX route the user has walked. Stored as the index
  // of the last fully-passed segment plus the exact projected point on the next
  // segment, so the grey "hiked" line can be cut at a continuously-sliding point
  // rather than snapping to a route vertex (which looks chunky on a sparse GPX).
  //
  // To stay smooth AND not jump around we:
  //   • project the user onto the trail SEGMENT (not the nearest vertex), so the
  //     cut point slides ~1.4m/fix instead of hopping vertex-to-vertex;
  //   • advance MONOTONICALLY — progress never rewinds, even at a switchback;
  //   • search only a WINDOW of segments ahead of current progress, so a nearby
  //     loop can't hijack it;
  //   • require the user within ON_ROUTE_M of the route, so wandering off-trail
  //     doesn't drag progress along.
  // A one-time global seed lets progress start correctly when joining mid-trail.
  const progressRef = useRef<Record<string | number, ProgressPoint>>({});
  const seededRef = useRef<Record<string | number, boolean>>({});

  useEffect(() => {
    if (!userLocation || tracks.length === 0) return;

    const ON_ROUTE_M = 40; // must be this close to the route to count as progress
    const WINDOW = 60;     // segments to look ahead from current progress
    const up = { lat: userLocation[0], lng: userLocation[1] };

    const next: Record<string | number, ProgressPoint> = { ...progressRef.current };

    tracks.forEach((track) => {
      const flat: LatLng[] = Array.isArray(track.coords[0])
        ? (track.coords as LatLng[][]).flat()
        : (track.coords as LatLng[]);
      if (flat.length < 2) return;

      const cur = progressRef.current[track.id];
      let startSeg = cur ? cur.seg : 0;

      // Seed once, when the user is actually near the route (handles joining
      // mid-trail). Until then keep retrying and don't advance.
      if (!seededRef.current[track.id]) {
        let gMin = Infinity;
        let gIdx = 0;
        flat.forEach((p, i) => {
          const d = calculateDistance(userLocation, p);
          if (d < gMin) { gMin = d; gIdx = i; }
        });
        if (gMin <= ON_ROUTE_M) {
          startSeg = Math.min(gIdx, flat.length - 2);
          seededRef.current[track.id] = true;
        }
      }

      // Best (closest) projection onto any segment in the forward window.
      const endSeg = Math.min(flat.length - 2, startSeg + WINDOW);
      let best: { seg: number; t: number; point: LatLng; dist: number } | null = null;
      for (let s = startSeg; s <= endSeg; s++) {
        const a = { lat: flat[s][0], lng: flat[s][1] };
        const b = { lat: flat[s + 1][0], lng: flat[s + 1][1] };
        const proj = projectOntoSegment(up, a, b);
        const pt: LatLng = [proj.point.lat, proj.point.lng];
        const dist = calculateDistance(userLocation, pt);
        if (!best || dist < best.dist) best = { seg: s, t: proj.t, point: pt, dist };
      }
      if (!best) return;

      // Forward = a later segment, or the same segment but further along it.
      const forward =
        !cur || best.seg > cur.seg || (best.seg === cur.seg && best.t >= cur.t);

      if (best.dist <= ON_ROUTE_M && forward) {
        next[track.id] = { seg: best.seg, t: best.t, point: best.point };
      } else if (cur) {
        next[track.id] = cur; // off-route or would rewind: hold position
      } else {
        next[track.id] = { seg: startSeg, t: 0, point: flat[startSeg] };
      }
    });

    progressRef.current = next;
    setProgressMap(next);
  }, [userLocation, tracks]);

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
        progressMap={progressMap}
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
        testID="map-tracker-toggle-button"
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
