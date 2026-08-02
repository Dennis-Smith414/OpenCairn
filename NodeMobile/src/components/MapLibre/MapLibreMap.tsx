// src/components/MapLibre/MapLibreMap.tsx
import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
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
} from "@maplibre/maplibre-react-native";
import { getDistanceMeters, boundsFromTracks } from "../../utils/geoUtils";
import { colors } from "../../styles/theme";
import { useOfflineBackend } from "../../context/OfflineContext";
import { PMTILES_BASE } from "../../config/env";
import {
  listBasemapsOffline,
  OfflineBasemap,
  syncActiveBasemapToNode,
} from "../../offline/basemaps";
import { OfflineBasemapLayers } from "./OfflineBasemapLayers";
import { useSmoothedLocation } from "../../hooks/useSmoothedLocation";
import { createKalmanEstimator } from "../../utils/kalmanLocation";
import {
  bindToRouteFactor,
  distanceToSegmentsMeters,
  nearestPointOnSegments,
  offRouteColor,
  offRouteFactor,
} from "../../utils/offRoute";

// DOT MODE — which estimator draws the gliding location dot, or "native" to
// fall straight back to the plain MapLibre puck (the known-good fallback)
// with no custom smoothing at all. This ONLY changes what's DRAWN; recorded
// tracks are unaffected either way.
//   "dead-reckon" — the original, tested, tuned glide (locationSmoothing.ts).
//   "kalman"      — prototype: weighs each fix by its reported GPS accuracy
//                   instead of treating every fix identically (kalmanLocation.ts).
// Flip this constant to A/B the two on a real walk; see the plan doc for the
// synthetic comparison tests this was validated against before field testing.
type DotMode = "native" | "dead-reckon" | "kalman";
const DOT_MODE: DotMode = "kalman";

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
  distance?: number; // meters
  iconRequire?: any;
  user_id?: number;
}

export interface Track {
  id: string | number;
  coords: LatLng[] | LatLng[][];
  color?: string;
  weight?: number;
}

// How far along a route the user has walked: the last fully-passed segment index
// plus the exact [lat,lng] point on it where the grey "hiked" line is cut.
//
// seedSeg/seedT/seedPoint record where the user was first detected ON this
// route (set once, then carried forward unchanged) — NOT where the route
// starts. Grey only covers seedPoint -> point (what was actually walked this
// session); the stretch before seedPoint stays blue like "remaining", since
// merely joining the route somewhere along its length doesn't mean the
// earlier portion was hiked. Without this, standing anywhere within
// ON_ROUTE_M of a point partway down a trail immediately greyed out
// everything from the trailhead to there.
export interface ProgressPoint {
  seg: number;
  t: number;
  point: LatLng;
  seedSeg: number;
  seedT: number;
  seedPoint: LatLng;
}

interface Props {
  tracks?: Track[];
  center?: LatLng;
  autoFitOnTracks?: boolean;
  zoom?: number;
  userLocation?: LatLng | null;
  // Raw metadata for the fix at `userLocation`, passed through untouched from
  // useGeolocation. Accuracy scales the off-route colour ramp; heading drives the
  // dot's direction arrow. Both are display-only.
  userAccuracy?: number | null;
  userHeading?: number | null;
  onMapReady?: () => void;
  onMapLongPress?: (lat: number, lon: number) => void;
  waypoints?: Waypoint[];
  onWaypointPress?: (wp: Waypoint | null) => void;
  showTrackingButton?: boolean; // default true
  progressMap?: Record<string | number, ProgressPoint>;
}

const DEFAULT_CENTER: LatLng = [37.7749, -122.4194];
const DEFAULT_ZOOM = 13;
const EMPTY_STYLE: any = {
  version: 8,
  name: "opencairn-empty",
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#f2efe9",
      },
    },
  ],
};


const MapLibreMap: React.FC<Props> = ({
  tracks = [],
  center = DEFAULT_CENTER,
  autoFitOnTracks,
  zoom = DEFAULT_ZOOM,
  userLocation = null,
  userAccuracy = null,
  userHeading = null,
  onMapReady,
  onMapLongPress,
  waypoints = [],
  onWaypointPress,
  showTrackingButton = true,
  progressMap = {},
}) => {
  const cameraRef = useRef<any>(null);
  const [tracking, setTracking] = useState<boolean>(true);
  const zoomRef = useRef<number>(zoom ?? DEFAULT_ZOOM);
  const lastUserLocRef = useRef<LatLng | null>(null);
  const { mode } = useOfflineBackend();
  const isOfflineMode = mode === "offline";
  const [markedLocation, setMarkedLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  // Active offline basemap (from offline_basemaps table)
  const [activeBasemap, setActiveBasemap] = useState<OfflineBasemap | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    async function loadActiveBasemap() {
      if (!isOfflineMode) {
        setActiveBasemap(null);
        return;
      }

      try {
        const all = await listBasemapsOffline();
        console.log("[DEBUG] offline basemaps:", all);
        if (cancelled) return;
        const active = all.find((b) => b.is_active === 1) || null;
        setActiveBasemap(active);
        console.log(
          "[MapLibreMap] offline basemap:",
          active ? `${active.name} (id=${active.id})` : "none"
        );
        await syncActiveBasemapToNode();
      } catch (err) {
        if (!cancelled) {
          console.warn("[MapLibreMap] failed to load basemaps:", err);
          setActiveBasemap(null);
        }
      }
    }

    loadActiveBasemap();
    return () => {
      cancelled = true;
    };
  }, [isOfflineMode]);

  // Icons
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

  // Convert tracks → split hiked (gray) + remaining (blue) features
  const splitRouteFeatures = useMemo(() => {
    return tracks.map((t) => {
      const flatLatLng: LatLng[] = Array.isArray(t.coords[0])
        ? (t.coords as LatLng[][]).flat()
        : (t.coords as LatLng[]);

      const flatGeo = flatLatLng.map(([lat, lon]) => [lon, lat]);
      const prog = progressMap[t.id];
      const color = t.color || '#0a84ff';
      // Thicker than the old default of 3: at typical hiking GPS accuracy the
      // dot rarely sits exactly on the line even when you're on the trail —
      // a wider line reads as "on the trail" over a bigger margin instead of
      // visibly missing it.
      const weight = t.weight ?? 6;

      // Cut the line at the projected points [lng,lat] for both the seed
      // (where the user joined the route) and the current position, so both
      // edges slide continuously instead of snapping to a vertex. Grey only
      // covers seed -> current; everything before the seed is "remaining"
      // too, since joining mid-route doesn't mean the earlier stretch was
      // walked (see ProgressPoint's comment).
      let hikedCoords: number[][] | null = null;
      const remainingParts: number[][][] = [];
      if (prog) {
        const cut = [prog.point[1], prog.point[0]]; // [lat,lng] -> [lng,lat]
        // Fall back to "no grey yet" (seed == current) if seed fields are
        // missing (e.g. a Fast-Refresh-preserved ProgressPoint from before
        // these fields existed) — never let a stale object crash the map
        // render, and never let the fallback itself recreate the old
        // retroactive-grey-from-start bug this was written to fix.
        const seedSeg = prog.seedSeg ?? prog.seg;
        const seedPointSrc = prog.seedPoint ?? prog.point;
        const seedCut = [seedPointSrc[1], seedPointSrc[0]];
        hikedCoords = [seedCut, ...flatGeo.slice(seedSeg + 1, prog.seg + 1), cut];
        const preSeed = [...flatGeo.slice(0, seedSeg + 1), seedCut];
        const postCurrent = [cut, ...flatGeo.slice(prog.seg + 1)];
        if (preSeed.length >= 2) remainingParts.push(preSeed);
        if (postCurrent.length >= 2) remainingParts.push(postCurrent);
      } else {
        remainingParts.push(flatGeo);
      }

      return {
        id: `route-${t.id}`,
        color,
        weight,
        hikedFeature: hikedCoords && hikedCoords.length >= 2 ? {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: hikedCoords },
          properties: { weight },
        } : null,
        remainingFeature: {
          type: 'Feature' as const,
          geometry:
            remainingParts.length === 1
              ? { type: 'LineString' as const, coordinates: remainingParts[0] }
              : { type: 'MultiLineString' as const, coordinates: remainingParts },
          properties: { color, weight },
        },
      };
    });
  }, [tracks, progressMap]);

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

  // Zoom buttons
  const zoomIn = useCallback(() => {
    zoomRef.current = Math.min(22, (zoomRef.current ?? DEFAULT_ZOOM) + 1);
    cameraRef.current?.setCamera({
      zoomLevel: zoomRef.current,
      animationDuration: 250,
    });
  }, []);

  const zoomOut = useCallback(() => {
    zoomRef.current = Math.max(2, (zoomRef.current ?? DEFAULT_ZOOM) - 1);
    cameraRef.current?.setCamera({
      zoomLevel: zoomRef.current,
      animationDuration: 250,
    });
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
        wp.distance = getDistanceMeters(
          [userLocation[0], userLocation[1]],
          [lat, lon]
        );
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

      // ignore cluster bubble taps
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
        wp.distance = getDistanceMeters(
          [userLocation[0], userLocation[1]],
          [lat, lon]
        );
      }

      onWaypointPress?.(wp);
    },
    [onWaypointPress, rnIcons, userLocation]
  );

  // DEBUG
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

  // Smoothed dot glides between fixes. Fed from the `userLocation` prop (the
  // app's own useGeolocation watch) rather than the native puck's onUpdate:
  // UserLocation returns null outright when visible={false}, so a hidden puck
  // emits nothing. Feeding from the known-live stream guarantees the dot actually
  // moves on a real walk.
  //
  // Hand-rolled rather than MapLibre's built-in animation on purpose. The
  // library does animate (UserLocation -> Annotation animated -> AnimatedPoint),
  // but it lerps POSITION ONLY over a hardcoded 1000 ms, leaves iconRotate to
  // snap, and sources fixes from its own LocationManager — which would cost us
  // both the shortest-arc heading glide and the `accuracy` value the off-route
  // colour needs. useSmoothedLocation does all three off one raw stream.
  //
  // Every polyline of every LOADED route, kept as separate segments. Sub-segments
  // are not concatenated: joining disjoint GPX tracks would invent a straight
  // bridge across country that the user could appear to be walking along.
  // Computed above the estimator/hook wiring below since snapToRoute closes over it.
  const routeSegments = useMemo<LatLng[][]>(() => {
    const out: LatLng[][] = [];
    for (const t of tracks) {
      if (Array.isArray(t.coords[0])) out.push(...(t.coords as LatLng[][]));
      else out.push(t.coords as LatLng[]);
    }
    return out.filter((s) => s.length >= 2);
  }, [tracks]);

  // Binds the dot to the route line, but ONLY as far as the fix reads as
  // genuinely on-route — blend fades to 0 using bindToRouteFactor, a MUCH
  // tighter ramp than the off-route colour's (offRouteFactor is deliberately
  // lenient under poor accuracy so it doesn't falsely flag amber; reusing
  // that same lenience for binding was a bug — it bound the dot onto the
  // line even tens of meters off-trail). An always-on/too-generous snap
  // would hide from a lost user that they've left the trail; see offRoute.ts's
  // file header. Identity is stable enough for useSmoothedLocation's ref
  // (recreated only when the loaded routes change, not per fix/frame).
  const snapToRoute = useCallback(
    (lat: number, lng: number, accuracy: number | null | undefined) => {
      if (routeSegments.length === 0) return { lat, lng, blend: 0 };
      const nearest = nearestPointOnSegments({ lat, lng }, routeSegments);
      if (!nearest) return { lat, lng, blend: 0 };
      const factor = bindToRouteFactor(nearest.distanceM, accuracy);
      return { lat: nearest.point.lat, lng: nearest.point.lng, blend: 1 - factor };
    },
    [routeSegments],
  );

  // Created once regardless of DOT_MODE (cheap — a closure with no internal
  // state until onFix runs) so flipping the constant doesn't need a remount.
  const kalmanEstimatorRef = useRef(createKalmanEstimator());
  const activeEstimator = DOT_MODE === "kalman" ? kalmanEstimatorRef.current : null;
  const { smoothed, pushFix } = useSmoothedLocation(
    DOT_MODE !== "native",
    activeEstimator,
    snapToRoute,
  );

  // Whether the platform has EVER given us a course. Until it has, the heading
  // arrow stays hidden rather than confidently pointing north — displaying a
  // direction we don't have would be exactly the kind of inference the dot is
  // supposed to avoid. Once set it stays set, so the arrow doesn't blink out
  // every time the user stops walking.
  const [hasHeading, setHasHeading] = useState(false);

  useEffect(() => {
    if (DOT_MODE !== "native" && userLocation) {
      // userLocation is [lat, lng]. A null heading means "platform has no course
      // right now" and the smoother carries the previous one forward. accuracy
      // is only consumed by the kalman estimator; the dead-reckoning path
      // ignores the extra argument.
      pushFix(userLocation[0], userLocation[1], userHeading, userAccuracy);
      if (userHeading != null) setHasHeading(true);
    }
  }, [userLocation, userHeading, userAccuracy, pushFix]);

  // Off-route colour feedback, in [0,1]. `tracks` IS the explicit opt-in — the
  // user loaded these routes on purpose — so with nothing loaded there is no
  // route to be off and the factor stays 0 (normal colour, no logic running).
  // Basemap trails are never consulted.
  //
  // Keyed on the RAW fix, never on `smoothed`: the polyline scan is O(vertices)
  // and `smoothed` changes every animation frame, which would run it at 60 Hz
  // instead of ~1 Hz. Measuring from the raw fix is also the honest thing to do —
  // the colour reflects where the user actually is, not where the dot is gliding.
  const offRoute = useMemo(() => {
    if (routeSegments.length === 0 || !userLocation) return 0;
    const dist = distanceToSegmentsMeters(
      { lat: userLocation[0], lng: userLocation[1] },
      routeSegments,
    );
    return offRouteFactor(dist, userAccuracy);
  }, [routeSegments, userLocation, userAccuracy]);

  const dotColor = useMemo(() => offRouteColor(offRoute), [offRoute]);

  const onUserLocUpdate = useCallback((pos: any) => {
    const { coords } = pos || {};
    if (coords?.latitude && coords?.longitude) {
      lastUserLocRef.current = [coords.latitude, coords.longitude];
    }
  }, []);

  // Center on tracks
  useEffect(() => {
    if (!tracks?.length || !cameraRef.current || !autoFitOnTracks) return;
    const bb = boundsFromTracks(tracks);
    if (!bb) return;
    // fitBounds expects [lon, lat]
    cameraRef.current.fitBounds(
      [bb.sw[1], bb.sw[0]],
      [bb.ne[1], bb.ne[0]],
      40,
      400
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

  // Build tile URL for active PMTiles basemap
  const offlineVectorTileUrlTemplates = useMemo(() => {
    if (!activeBasemap) return null;
    return [`${PMTILES_BASE}/tiles/{z}/{x}/{y}.mvt`];
  }, [activeBasemap]);

  return (
    <View style={styles.container}>
      <MapView
        key={
          isOfflineMode
            ? `offline-map-${activeBasemap?.id ?? "none"}`
            : "online-map"
        }
        style={StyleSheet.absoluteFill}
        logoEnabled={false}
        compassEnabled
        onPress={onMapPress}
        onLongPress={onLongPress}
        onMapError={onMapError}
        onDidFinishLoadingStyle={onStyleLoaded}
        mapStyle={EMPTY_STYLE}
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
            "user-heading": require("../../assets/icons/user-heading.png"),
          }}
        />

        {/* Online basemap: OSM raster tiles */}
        {!isOfflineMode && (
          <RasterSource
            id="osm"
            tileUrlTemplates={[
              "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            ]}
            tileSize={256}
          >
            <RasterLayer id="osm-layer" />
          </RasterSource>
        )}

        {/* Offline basemap: Vector PMTiles (if available) */}
        {isOfflineMode && offlineVectorTileUrlTemplates && (
          <OfflineBasemapLayers
            tileUrlTemplates={offlineVectorTileUrlTemplates}
            minZoom={activeBasemap?.min_zoom ?? 0}
            maxZoom={activeBasemap?.max_zoom ?? 14}
          />
        )}

        {/* Camera */}
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [center[1], center[0]],
            zoomLevel: zoomRef.current,
          }}
        />

        {/* Routes — split into hiked (gray) and remaining (blue) */}
        {splitRouteFeatures.map(({ id, hikedFeature, remainingFeature }) => (
          <React.Fragment key={id}>
            <ShapeSource id={`${id}-remaining`} shape={remainingFeature}>
              <LineLayer
                id={`${id}-remaining-line`}
                style={{
                  lineColor: ["get", "color"],
                  lineWidth: ["get", "weight"],
                  lineOpacity: 0.95,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </ShapeSource>
            {hikedFeature && (
              <ShapeSource id={`${id}-hiked`} shape={hikedFeature}>
                <LineLayer
                  id={`${id}-hiked-line`}
                  style={{
                    lineColor: "#888888",
                    lineWidth: ["get", "weight"],
                    lineOpacity: 0.7,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
              </ShapeSource>
            )}
          </React.Fragment>
        ))}

        {/* Waypoints (clustered) */}
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
                5,
                10,
                50,
                24,
              ],
              circleColor: "rgba(0,0,0,0.25)",
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
                ["get", "type"], // "water", "campsite", etc.
                "generic",
              ],
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconSize: 0.8,
            }}
          />
        </ShapeSource>

        {/* Marked location from long-press */}
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
                    coordinates: [markedLocation.lon, markedLocation.lat],
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

        {/* User location. When DOT_MODE is "dead-reckon" or "kalman", the native
            puck is HIDDEN but kept mounted so its onUpdate keeps feeding fixes to
            the smoother; the gliding dot below is drawn instead. Set DOT_MODE to
            "native" to show the native puck again (the known-good fallback). */}
        <UserLocation
          visible={DOT_MODE === "native"}
          renderMode="native"
          androidRenderMode="compass"
          showsUserHeadingIndicator={true}
          onUpdate={onUserLocUpdate}
        />

        {/* Smoothed (interpolated) location dot — display only.
            The coordinates are the smoothed REAL position: interpolated between
            consecutive raw fixes so the dot glides, never relocated onto a route.
            A dot pulled onto the line would hide from a lost user that they are
            off it, so the only thing the loaded route changes here is `dotColor`. */}
        {DOT_MODE !== "native" && smoothed && (
          <ShapeSource
            id="smooth-user-dot"
            shape={{
              type: "Feature",
              properties: {},
              geometry: {
                type: "Point",
                coordinates: [smoothed.lng, smoothed.lat],
              },
            }}
          >
            {/* soft accuracy-ish halo */}
            <CircleLayer
              id="smooth-user-dot-halo"
              style={{
                circleRadius: 16,
                circleColor: dotColor,
                circleOpacity: 0.18,
              }}
            />
            {/* Heading arrow, drawn under the core so the core overlaps its base.
                iconRotate takes the smoothed heading, which lerps along the
                shortest arc — 359° to 1° sweeps 2° through north, not 358° back.
                iconRotationAlignment "map" keeps it pinned to compass bearing
                rather than to the screen. */}
            <SymbolLayer
              id="smooth-user-dot-heading"
              style={{
                iconOpacity: hasHeading ? 1 : 0,
                iconImage: "user-heading",
                iconRotate: smoothed.heading,
                iconRotationAlignment: "map",
                iconPitchAlignment: "map",
                iconAllowOverlap: true,
                iconIgnorePlacement: true,
                iconSize: 0.5,
              }}
            />
            {/* solid core with white ring */}
            <CircleLayer
              id="smooth-user-dot-core"
              style={{
                circleRadius: 7,
                circleColor: dotColor,
                circleStrokeColor: "#FFFFFF",
                circleStrokeWidth: 2.5,
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
        testID="map-center-button"
        style={[
          styles.zoomBtn,
          styles.centerBtn,
          { backgroundColor: colors.primary },
        ]}
        onPress={centerOnUserNow}
      >
        <Text style={styles.zoomTxt}>◎</Text>
      </TouchableOpacity>

      {/* Follow-me pill */}
      {showTrackingButton && (
        <TouchableOpacity
          testID="map-tracking-pill"
          onPress={tracking ? undefined : enableTracking}
          activeOpacity={0.85}
          style={[styles.pill, tracking ? styles.pillOn : styles.pillOff]}
        >
          <View
            style={[styles.dot, tracking ? styles.dotOn : styles.dotOff]}
          />
          <Text style={styles.pillText}>
            {tracking ? "Tracking" : "Enable Tracking"}
          </Text>
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
