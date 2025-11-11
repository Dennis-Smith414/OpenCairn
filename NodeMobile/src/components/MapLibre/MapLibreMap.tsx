import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { StyleSheet, View, TouchableOpacity, Text } from "react-native";
import MapboxGL from "react-native-maplibre-gl/maps";
import { getDistanceMeters } from "../../utils/geoUtils";

export type LatLng = [number, number];

export interface Waypoint {
  id?: number | null;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  type?: string;
  username?: string;
  created_at?: string;
  // Optional fields added client-side:
  distance?: number;   // meters
  iconRequire?: any;
  user_id?: number;
}

export interface Track {
  id: string | number;
  // One continuous line: LatLng[]
  // Multiple disjoint segments: LatLng[][]
  coords: LatLng[] | LatLng[][];
  color?: string;
  weight?: number;
}

interface Props {
  tracks?: Track[];
  center?: LatLng;
  zoom?: number;
  userLocation?: LatLng | null;
  onMapReady?: () => void;
  onMapLongPress?: (lat: number, lon: number) => void;
  waypoints?: Waypoint[];
  onWaypointPress?: (wp: Waypoint | null) => void;
  showTrackingButton?: boolean; // default true
}

const DEFAULT_CENTER: LatLng = [37.7749, -122.4194];
const DEFAULT_ZOOM = 13;

const MapLibreMap: React.FC<Props> = ({
  tracks = [],
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  userLocation = null,
  onMapReady,
  onMapLongPress,
  waypoints = [],
  onWaypointPress,
  showTrackingButton = true,
}) => {
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const [tracking, setTracking] = useState<boolean>(true);

  // Dev-only online style; we’ll swap to local later.
  const styleURL = "https://demotiles.maplibre.org/style.json";

  // Icons parity (RN requires) so MapScreen can pass iconRequire through when selecting a point
  const rnIcons = useMemo(
    () => ({
      generic: require("../../assets/icons/waypoints/generic.png"),
      water: require("../../assets/icons/waypoints/water.png"),
      campsite: require("../../assets/icons/waypoints/campsite.png"),
      roadAccess: require("../../assets/icons/waypoints/road-access-point.png"),
      intersection: require("../../assets/icons/waypoints/intersection.png"),
      navigation: require("../../assets/icons/waypoints/navigation.png"),
      hazard: require("../../assets/icons/waypoints/hazard.png"),
      landmark: require("../../assets/icons/waypoints/landmark.png"),
      parkingTrailhead: require("../../assets/icons/waypoints/parking-trailhead.png"),
    }),
    []
  );

  // Convert tracks into per-route MultiLineString features (color per route)
  const routeFeatures = useMemo(() => {
    return tracks.map((t) => {
      const multi: number[][][] =
        Array.isArray(t.coords[0])
          ? (t.coords as LatLng[][]).map((seg) => seg.map(([lat, lon]) => [lon, lat]))
          : [[(t.coords as LatLng[]).map(([lat, lon]) => [lon, lat])]];
      return {
        id: `route-${t.id}`,
        feature: {
          type: "Feature" as const,
          geometry: { type: "MultiLineString" as const, coordinates: multi },
          properties: { color: t.color || "#0a84ff", weight: t.weight ?? 3 },
        },
      };
    });
  }, [tracks]);

  // Waypoints as a single FeatureCollection (clusters on)
  const waypointFC = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: (waypoints || []).map((w) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [w.lon, w.lat] },
        properties: {
          id: w.id ?? null,
          name: w.name,
          description: w.description ?? "",
          type: w.type ?? "generic",
          username: w.username ?? "",
          created_at: w.created_at ?? "",
          user_id: w.user_id ?? null,
        },
      })),
    };
  }, [waypoints]);

  // Camera follow-me pill
  const enableTracking = useCallback(() => {
    setTracking(true);
    if (userLocation) {
      cameraRef.current?.setCamera({
        centerCoordinate: [userLocation[1], userLocation[0]],
        zoomLevel: Math.max(10, zoom),
        animationDuration: 600,
      });
    }
  }, [userLocation, zoom]);

  // Stop tracking on user gesture (pan/zoom)
  const stopTrackingOnGesture = useCallback(() => {
    setTracking(false);
  }, []);

  // Long-press -> temp “Marked Location” handoff
  const onLongPress = useCallback(
    (e: any) => {
      const coords = e?.geometry?.coordinates; // [lon, lat]
      if (!coords) return;
      const [lon, lat] = coords;

      // Build a synthetic waypoint (parity with Leaflet flow)
      const wp: any = {
        id: null,
        name: "Marked Location",
        description: "",
        type: "generic",
        username: "",
        created_at: new Date().toISOString(),
        lat,
        lon,
        iconRequire: rnIcons.generic,
      };
      if (userLocation) {
        wp.distance = getDistanceMeters([userLocation[0], userLocation[1]], [lat, lon]);
      }

      onMapLongPress?.(lat, lon);
      onWaypointPress?.(wp);
    },
    [onMapLongPress, onWaypointPress, rnIcons.generic, userLocation]
  );

  // Waypoint tap -> select feature and decorate with icon + distance
  const onWaypointPressInternal = useCallback(
    (e: any) => {
      const f = e?.features?.[0];
      if (!f) return;
      const p = f.properties || {};
      const g = f.geometry;

      const typeKey = p.type || "generic";
      const iconRequire =
        rnIcons[typeKey] ||
        rnIcons[
          typeKey === "road-access-point"
            ? "roadAccess"
            : typeKey === "parking-trailhead"
            ? "parkingTrailhead"
            : "generic"
        ];

      const lat = g?.coordinates?.[1];
      const lon = g?.coordinates?.[0];

      const wp: any = {
        id: p.id ?? null,
        name: p.name,
        description: p.description,
        type: p.type,
        username: p.username ?? "Unknown user",
        created_at: p.created_at,
        user_id: p.user_id ?? null,
        lat,
        lon,
        iconRequire,
      };

      if (userLocation) {
        wp.distance = getDistanceMeters([userLocation[0], userLocation[1]], [lat, lon]);
      }

      onWaypointPress?.(wp);
    },
    [onWaypointPress, rnIcons, userLocation]
  );

  // Initial “map ready”
  useEffect(() => {
    // FYI: MapboxGL.MapView doesn't expose an explicit "ready" event reliably across platforms,
    // but layers will render as soon as style is loaded. We can call onMapReady once after first mount.
    const timer = setTimeout(() => onMapReady?.(), 300);
    return () => clearTimeout(timer);
  }, [onMapReady]);

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        styleURL={styleURL}
        logoEnabled={false}
        compassEnabled
        onRegionWillChange={stopTrackingOnGesture}
        onRegionIsChanging={stopTrackingOnGesture}
        onRegionDidChange={stopTrackingOnGesture}
        onLongPress={onLongPress}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={zoom}
          centerCoordinate={[center[1], center[0]]} // [lon, lat]
          animationMode="flyTo"
          animationDuration={0}
        />

        {/* Native user location dot (independent of tracking state) */}
        <MapboxGL.UserLocation visible />

        {/* Routes */}
        {routeFeatures.map(({ id, feature }) => (
          <MapboxGL.ShapeSource key={id} id={id} shape={feature}>
            <MapboxGL.LineLayer
              id={`${id}-line`}
              style={{
                lineColor: ["get", "color"],
                lineWidth: ["get", "weight"],
                lineOpacity: 0.95,
              }}
            />
          </MapboxGL.ShapeSource>
        ))}

        {/* Waypoints (clustered circles for now; sprites optional later) */}
        <MapboxGL.ShapeSource
          id="waypoints"
          shape={waypointFC}
          cluster
          clusterRadius={40}
          onPress={onWaypointPressInternal}
        >
          <MapboxGL.CircleLayer
            id="wp-cluster"
            filter={["has", "point_count"]}
            style={{
              circleRadius: ["interpolate", ["linear"], ["get", "point_count"], 5, 14, 50, 24],
              circleOpacity: 0.8,
            }}
          />
          <MapboxGL.CircleLayer
            id="wp-point"
            filter={["!", ["has", "point_count"]]}
            style={{
              circleRadius: 5,
              circleOpacity: 0.9,
            }}
          />
        </MapboxGL.ShapeSource>
      </MapboxGL.MapView>

      {showTrackingButton && (
        <TouchableOpacity
          onPress={tracking ? undefined : enableTracking}
          activeOpacity={0.85}
          style={[styles.pill, tracking ? styles.pillOn : styles.pillOff]}
        >
          <View style={[styles.dot, tracking ? styles.dotOn : styles.dotOff]} />
          <Text style={styles.pillText}>{tracking ? "Tracking" : "Enable Tracking"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  pill: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pillOn: { backgroundColor: "rgba(230,255,240,0.95)" },
  pillOff: { backgroundColor: "rgba(255,255,255,0.95)" },
  pillText: { fontSize: 13, fontWeight: "600" },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  dotOn: { backgroundColor: "#22c55e" },
  dotOff: { backgroundColor: "#999" },
});

export default MapLibreMap;
