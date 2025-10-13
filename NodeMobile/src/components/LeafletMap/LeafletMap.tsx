import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { StyleSheet, Image, View, TouchableOpacity, Text } from "react-native";
import { WebView } from "react-native-webview";
import { getDistanceMeters } from "../../utils/geoUtils";

import type { WebViewMessageEvent } from "react-native-webview";

export type LatLng = [number, number];

interface MapPayload { coords: LatLng[]; }

export interface Waypoint {
  id: number;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  type?: string;
    //Optional fields:
  distance?: number; // meters
  iconRequire?: any;
}

interface LeafletMapProps {
  coordinates: LatLng[];
  center?: LatLng;
  zoom?: number;
  userLocation?: LatLng | null;
  onMapReady?: () => void;
  onMapLongPress?: (lat: number, lon: number) => void;
  waypoints?: Waypoint[];
  onWaypointPress?: (wp: Waypoint | null) => void;
  showTrackingButton?: boolean; // default true
}



const FALLBACK_CENTER: LatLng = [43.075915779364294, -87.88550589992784]; // <--Fall back is now UWM rendering the fallback should be removed later on
const DEFAULT_ZOOM = 13;

const LeafletMap: React.FC<LeafletMapProps> = ({
  coordinates,
  center = FALLBACK_CENTER,
  zoom = DEFAULT_ZOOM,
  userLocation = null,
  onMapReady,
  onMapLongPress,
  waypoints = [],
  onWaypointPress,
  showTrackingButton = true,
}) => {
  const webRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  const didSetInitialView = useRef(false);

  // Follow-me state 
  const [tracking, setTracking] = useState<boolean>(true); //<--- Detects noable changes in postion

  const lastLocationRef = useRef<LatLng | null>(null);


  // React Native image requires (used for popup)
    const rnIcons = {
      generic: require("../../assets/icons/waypoints/generic.png"),
      water: require("../../assets/icons/waypoints/water.png"),
      campsite: require("../../assets/icons/waypoints/campsite.png"),
      roadAccess: require("../../assets/icons/waypoints/road-access-point.png"),
      intersection: require("../../assets/icons/waypoints/intersection.png"),
      hazard: require("../../assets/icons/waypoints/hazard.png"),
      landmark: require("../../assets/icons/waypoints/landmark.png"),
      parkingTrailhead: require("../../assets/icons/waypoints/parking-trailhead.png"),
    };

    // Leaflet (WebView) image URIs — needs .uri resolved
    const iconUrls = useMemo(
      () => ({
        generic: Image.resolveAssetSource(rnIcons.generic).uri,
        water: Image.resolveAssetSource(rnIcons.water).uri,
        campsite: Image.resolveAssetSource(rnIcons.campsite).uri,
        roadAccess: Image.resolveAssetSource(rnIcons.roadAccess).uri,
        intersection: Image.resolveAssetSource(rnIcons.intersection).uri,
        hazard: Image.resolveAssetSource(rnIcons.hazard).uri,
        landmark: Image.resolveAssetSource(rnIcons.landmark).uri,
        parkingTrailhead: Image.resolveAssetSource(rnIcons.parkingTrailhead).uri,
      }),
      []
    );

  // --- messages from HTML ---
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const raw = event.nativeEvent.data;
      try {
        const data = typeof raw === "string" ? JSON.parse(raw) : null;
        if (!data) return;

        switch (data.type) {

          case "MAP_READY":
            setIsReady(true);
            onMapReady?.();
            break;

          case "LONG_PRESS": {
            const { lat, lon } = data;

            const wp = {
              id: null,
              name: "Marked Location",
              description: "",
              type: "generic",
              username: "",
              created_at: new Date().toISOString(),
              lat,
              lon,
            };

            if (userLocation) {
              const meters = getDistanceMeters(userLocation, [lat, lon]);
              wp.distance = meters;
            }

            wp.iconRequire = rnIcons.generic;

            onWaypointPress?.(wp);
            break;
          }


          case "WAYPOINT_CLICK":
            if (data.waypoint) {
              const wp = data.waypoint;
              const typeKey = wp.type || "generic";

              //For popup display in React Native
              wp.iconRequire = rnIcons[typeKey] || rnIcons.generic;

              //For distance
              if (userLocation) {
                const meters = getDistanceMeters(
                  [userLocation[0], userLocation[1]],
                  [wp.lat, wp.lon]
                );
                wp.distance = meters;
              }

              onWaypointPress?.(wp);
            }
            break;


          case "MAP_TAP":
            onWaypointPress?.(null);
            break;

          case "USER_GESTURE":
            // user dragged/zoomed → stop following
            setTracking(false);
            break;
          default:
            break;
        }
      } catch (e) {
        console.error("LeafletMap message parse error:", e, raw);
      }
    },
    [onMapLongPress, onMapReady, onWaypointPress, userLocation]
  );

  // set initial camera ONCE
  useEffect(() => {
    if (!isReady || didSetInitialView.current) return;
    didSetInitialView.current = true;
    webRef.current?.injectJavaScript(`
      window.__setView(${center[0]}, ${center[1]}, ${zoom});
      true;
    `);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  // draw route (fits once) and stop following so user can explore
  useEffect(() => {
    if (!isReady) return;
    if (coordinates && coordinates.length) {
      const payload: MapPayload = { coords: coordinates };
      webRef.current?.injectJavaScript(`
        window.__clearMap();
        window.__setCoords(${JSON.stringify(payload)});
        true;
      `);
      setTracking(false);
    } else {
      webRef.current?.injectJavaScript(`window.__clearMap(); true;`);
    }
  }, [isReady, coordinates]);

  // Blue location dot should NEVER pan now
  useEffect(() => {
    if (!isReady) return;
    if (userLocation) {
      const [lat, lng] = userLocation;
      const lastLoc = lastLocationRef.current;

      //Check if there is a noteworthy change in positon
      const hasChanged = !lastLoc || 
        Math.abs(lastLoc[0] - lat) > 0.00001 ||
        Math.abs(lastLoc[1] - lng) > 0.00001;

      //Update the users postion
      if (hasChanged) {
        lastLocationRef.current = [lat, lng];
        webRef.current?.injectJavaScript(`
          window.__setUserLocation(${lat}, ${lng});
          true;
      `);

      }
    } else {
      webRef.current?.injectJavaScript(`window.__removeUserLocation(); true;`);
    }
  }, [isReady, userLocation, tracking]);



  useEffect(() => {
    if (!isReady) return;
    const payload = { waypoints: waypoints || [], iconUrls };
    webRef.current?.injectJavaScript(`
      try { window.__setWaypoints(${JSON.stringify(payload)}); true; }
      catch (err) { console.log('Error injecting waypoints', err); false; }
    `);
  }, [isReady, waypoints, iconUrls]);

  // pill action
  const enableTracking = () => {
    setTracking(true);
    if (isReady && userLocation) {
      const [lat, lng] = userLocation;
      webRef.current?.injectJavaScript(`window.__panTo(${lat}, ${lng}); true;`);
    }
  };


  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={require("./LeafletHTML.html")}
        onMessage={handleMessage}
        style={styles.map}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        mixedContentMode="always"
      />

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
  map: { flex: 1 },

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

export default LeafletMap;