// src/components/MapLibre/MapLibreMap.tsx
import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { StyleSheet, View, TouchableOpacity, Text } from "react-native";
import {
  MapView,
  Camera,
  UserLocation,
  ShapeSource,
  LineLayer,
  CircleLayer,
  RasterSource,
  RasterLayer,
  Images,
  SymbolLayer,
  VectorSource,
  FillLayer,
} from "@maplibre/maplibre-react-native";
import { getDistanceMeters, boundsFromTracks } from "../../utils/geoUtils";
import { colors } from "../../styles/theme";
import { useOfflineBackend } from "../../context/OfflineContext";
import {OFFLINE_API_BASE as OFFLINE_BASE} from "../../config/env"; //Delete / refactor later

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
  distance?: number;   // meters
  iconRequire?: any;
  user_id?: number;
}

export interface Track {
  id: string | number;
  coords: LatLng[] | LatLng[][];
  color?: string;
  weight?: number;
}

interface Props {
  tracks?: Track[];
  center?: LatLng;
  autoFitOnTracks?: boolean;
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
  autoFitOnTracks,
  zoom = DEFAULT_ZOOM,
  userLocation = null,
  onMapReady,
  onMapLongPress,
  waypoints = [],
  onWaypointPress,
  showTrackingButton = true,
}) => {
  const cameraRef = useRef<any>(null);
  const [tracking, setTracking] = useState<boolean>(true);
  const zoomRef = useRef<number>(zoom ?? DEFAULT_ZOOM);
  const lastUserLocRef = useRef<LatLng | null>(null);
  const { mode } = useOfflineBackend();
  const isOfflineMode = mode === "offline";
  const [markedLocation, setMarkedLocation] = useState<{ lat: number; lon: number } | null>(null);

  // Icons (keeps your popup UI parity)
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

  // Convert tracks → MultiLineString features (lon,lat order)
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

  // Waypoints as FeatureCollection
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

  // Follow-me pill action
  const enableTracking = useCallback(() => {
    setTracking(true);
    if (userLocation) {
      cameraRef.current?.setCamera({
        centerCoordinate: [userLocation[1], userLocation[0]],
        zoomLevel: Math.max(10, zoomRef.current ?? DEFAULT_ZOOM),
        animationDuration: 600,
      });
    }
  }, [userLocation]);

  // Zoom buttons (imperative only)
  const zoomIn = useCallback(() => {
    zoomRef.current = Math.min(22, (zoomRef.current ?? DEFAULT_ZOOM) + 1);
    cameraRef.current?.setCamera({ zoomLevel: zoomRef.current, animationDuration: 250 });
  }, []);

  const zoomOut = useCallback(() => {
    zoomRef.current = Math.max(2, (zoomRef.current ?? DEFAULT_ZOOM) - 1);
    cameraRef.current?.setCamera({ zoomLevel: zoomRef.current, animationDuration: 250 });
  }, []);

  // Long-press → “Marked Location”
  const onLongPress = useCallback(
    (e: any) => {
      const coords = e?.geometry?.coordinates; // [lon, lat]
      if (!coords) return;
      const [lon, lat] = coords;

      setMarkedLocation({ lat, lon });

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

  // Waypoint tap -> decorate with icon + distance
  const onWaypointPressInternal = useCallback(
    (e: any) => {
      const f = e?.features?.[0];
      if (!f) return;
      const p = f.properties || {};
      const g = f.geometry;

      if (p.point_count != null) {
            return;
          }

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

  //DEBUG useEffect
  useEffect(() => {
    console.log(
      "[MapLibreMap] mode =",
      isOfflineMode ? "offline" : "online",
      "| waypoints.length =",
      waypoints?.length
    );
    if (waypoints?.length) {
      console.log("[MapLibreMap] first wp:", waypoints[0]);
    }
  }, [isOfflineMode, waypoints]);


  // “Map ready” ping
  useEffect(() => {
    const t = setTimeout(() => onMapReady?.(), 300);
    return () => clearTimeout(t);
  }, [onMapReady]);

  // Track last user location for the center-on-me button
  const onUserLocUpdate = useCallback((pos: any) => {
    const { coords } = pos || {};
    if (coords?.latitude && coords?.longitude) {
      lastUserLocRef.current = [coords.latitude, coords.longitude];
    }
  }, []);

  //Center on tracks
  useEffect(() => {
    if (!tracks?.length || !cameraRef.current || !autoFitOnTracks) return;
    const bb = boundsFromTracks(tracks);
    if (!bb) return;
    // fitBounds expects [lon, lat]
    cameraRef.current.fitBounds(
      [bb.sw[1], bb.sw[0]],
      [bb.ne[1], bb.ne[0]],
      40,   // padding px
      400   // duration ms
    );
  }, [tracks, autoFitOnTracks]);

  const centerOnUserNow = useCallback(() => {
    const loc = userLocation || lastUserLocRef.current;
    if (loc) {
      cameraRef.current?.setCamera({
        centerCoordinate: [loc[1], loc[0]],
        zoomLevel: Math.max(12, zoomRef.current ?? DEFAULT_ZOOM),
        animationDuration: 400,
      });
      setTracking(true);
    }
  }, [userLocation]);

  const onMapError = useCallback((e: any) => {
    console.warn("[MapLibre] Map error:", JSON.stringify(e?.nativeEvent || e));
  }, []);
  const onStyleLoaded = useCallback(() => {
    // console.log("[MapLibre] Style loaded");
  }, []);

  const onMapPress = useCallback(() => {
    // clear any active waypoint popup
    onWaypointPress?.(null);
    // clear the temporary marked location icon
    setMarkedLocation(null);
  }, [onWaypointPress]);

  return (
    <View style={styles.container}>
        <MapView
          key={isOfflineMode ? "offline-map" : "online-map"}
          style={StyleSheet.absoluteFill}
          logoEnabled={false}
          compassEnabled
          onPress={onMapPress}
          onLongPress={onLongPress}
          onMapError={onMapError}
          onDidFinishLoadingStyle={onStyleLoaded}
        >
        <Images
          images={{
            generic: require("../../assets/icons/waypoints/generic.png"),
            water: require("../../assets/icons/waypoints/water.png"),
            campsite: require("../../assets/icons/waypoints/campsite.png"),
            "road-access-point": require("../../assets/icons/waypoints/road-access-point.png"),
            intersection: require("../../assets/icons/waypoints/intersection.png"),
            navigation: require("../../assets/icons/waypoints/navigation.png"),
            hazard: require("../../assets/icons/waypoints/hazard.png"),
            landmark: require("../../assets/icons/waypoints/landmark.png"),
            "parking-trailhead": require("../../assets/icons/waypoints/parking-trailhead.png"),
          }}
        />

        {/* Base map: OSM raster tiles */}
        {/* Base map */}
        {!isOfflineMode && (
          // 🌐 Online: OSM raster tiles
          <RasterSource
            id="osm"
            tileUrlTemplates={["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]}
            tileSize={256}
          >
            <RasterLayer id="osm-layer" />
          </RasterSource>
        )}

        {isOfflineMode && (
          <VectorSource
            id="offline-basemap"
            tileUrlTemplates={[`${OFFLINE_BASE}/tiles/{z}/{x}/{y}.mvt`]}
            minZoomLevel={4}
            maxZoomLevel={14}
          >
            <FillLayer
              id="offline-water"
              sourceLayerID="water"
              style={{
                fillColor: "#a0c8f0",
                fillOpacity: 1,
              }}
            />
            <FillLayer
              id="offline-landuse"
              sourceLayerID="landuse"
              style={{
                fillColor: "#dcd9d0",
                fillOpacity: 1,
              }}
            />
            <LineLayer
              id="offline-roads"
              sourceLayerID="transportation"
              style={{
                lineColor: "#c0a26b",
                lineWidth: 1.0,
              }}
            />
            <SymbolLayer
              id="offline-places"
              sourceLayerID="place"
              style={{
                textField: ["get", "name"],
                textSize: 12,
                textHaloColor: "#ffffff",
                textHaloWidth: 1,
              }}
            />
          </VectorSource>
        )}

        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [center[1], center[0]],
            zoomLevel: zoomRef.current,
          }}
        />

        {/* Native user location dot */}
        <UserLocation visible onUpdate={onUserLocUpdate} />

        {/* Routes */}
        {routeFeatures.map(({ id, feature }) => (
          <ShapeSource key={id} id={id} shape={feature}>
            <LineLayer
              id={`${id}-line`}
              style={{
                lineColor: ["get", "color"],
                lineWidth: ["get", "weight"],
                lineOpacity: 0.95,
              }}
            />
          </ShapeSource>
        ))}

        {/* Waypoints (clustered circles) */}
        <ShapeSource
          id="waypoints"
          shape={waypointFC}
          cluster
          clusterRadius={40}
          onPress={onWaypointPressInternal}
        >
        <CircleLayer
          id="wp-cluster"
          filter={["has", "point_count"]}
          style={{
            circleRadius: [
              "interpolate",
              ["linear"],
              ["get", "point_count"],
              5, 10,
              50, 24
            ],
            circleColor: "rgba(0,0,0,0.25)",  // softer, greyish
            circleOpacity: 0.4,
            circleStrokeColor: "#ffffff",
            circleStrokeWidth: 1.2,
          }}
        />
           <SymbolLayer
             id="wp-point"
             filter={["!", ["has", "point_count"]]}
             style={{
               iconImage: [
                 "coalesce",
                 ["get", "type"],  // use e.g. "water", "campsite", "road-access-point", etc.
                 "generic",
               ],
               iconAllowOverlap: true,
               iconIgnorePlacement: true,
               iconSize: 0.8,         // adjust to taste
             }}
           />
        </ShapeSource>
        {markedLocation && (
                  <ShapeSource
                    id="marked-location"
                    shape={{
                      type: "FeatureCollection",
                      features: [
                        {
                          type: "Feature",
                          geometry: {
                            type: "Point",
                            coordinates: [markedLocation.lon, markedLocation.lat], // [lon, lat]
                          },
                          properties: {
                            type: "generic",
                          },
                        },
                      ],
                    }}
                  >
                    <SymbolLayer
                      id="marked-location-icon"
                      style={{
                        iconImage: "generic",
                        iconAllowOverlap: true,
                        iconIgnorePlacement: true,
                        iconSize: 0.9,
                      }}
                    />
                  </ShapeSource>
                )}
      </MapView>

      {/* Zoom controls */}
      <View style={styles.zoomGroup}>
        <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn}>
          <Text style={styles.zoomTxt}>＋</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut}>
          <Text style={styles.zoomTxt}>－</Text>
        </TouchableOpacity>
      </View>

        {/* Center-on-user */}
        <TouchableOpacity
          style={[styles.zoomBtn, styles.centerBtn, { backgroundColor: colors.primary }]}
          onPress={centerOnUserNow}
        >
          <Text style={[styles.zoomTxt]}>◎</Text>
        </TouchableOpacity>


      {/* Follow-me pill */}
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

  zoomGroup: {
    position: "absolute",
    right: 12,
    bottom: 575,
    gap: 8,
  },
  zoomBtn: {
    backgroundColor: "rgba(255,255,255,0.95)",
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  zoomTxt: { fontSize: 22, fontWeight: "700" },

centerBtn: {
  position: "absolute",
  right: 12,
  bottom: 525,
  zIndex: 10,
  elevation: 4,
},

  centerTxt: { fontSize: 18, fontWeight: "700" },
});

export default MapLibreMap;
