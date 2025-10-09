import React, { useRef, useState, useCallback, useEffect } from 'react';
import { WebView } from 'react-native-webview';
import { WebView as WebViewType } from 'react-native-webview';

export type LatLng = [number, number];

interface MapPayload {
  coords: LatLng[];
}

interface Waypoint {
  id: number;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  type?: string;
}

interface LeafletMapProps {
  coordinates: LatLng[];
  center?: LatLng;
  zoom?: number;
  userLocation?: LatLng | null;
  onMapReady?: () => void;
  onMapLongPress?: (lat: number, lon: number) => void;
  waypoints?: Waypoint[];
}

const FALLBACK_CENTER: LatLng = [37.7749, -122.4194];
const DEFAULT_ZOOM = 13;

const LeafletMap: React.FC<LeafletMapProps> = ({
  coordinates,
  center = FALLBACK_CENTER,
  zoom = DEFAULT_ZOOM,
  userLocation = null,
  onMapReady,
  onMapLongPress,
  waypoints = [],
}) => {
  const webRef = useRef<WebViewType>(null);
  const [isReady, setIsReady] = useState(false);

  const handleMessage = useCallback(
      (event: any) => {
        const raw = event.nativeEvent.data;

        // Log all raw incoming messages
        console.log("WebView message:", raw);

        try {
          const data = typeof raw === "string" ? JSON.parse(raw) : null;
          if (!data) return;

          switch (data.type) {
            case "LOG":
              console.log("Map log:", data.msg);
              break;

            case "MAP_READY":
              setIsReady(true);
              onMapReady?.();
              break;

            case "LONG_PRESS":
              console.log("Long press received from map:", data.lat, data.lon);
              if (onMapLongPress) onMapLongPress(data.lat, data.lon);
              break;

            default:
              console.log("Unrecognized message type:", data.type);
              break;
          }
        } catch (e) {
          console.error("LeafletMap: Message parse error:", e, raw);
        }
      },
      [onMapReady, onMapLongPress]
    );

  useEffect(() => {
    if (!isReady) return;
    webRef.current?.injectJavaScript(`
      window.__setView(${center[0]}, ${center[1]}, ${zoom});
      true;
    `);
  }, [isReady, center, zoom]);

  useEffect(() => {
    if (!isReady) return;
    if (coordinates.length) {
      const payload: MapPayload = { coords: coordinates };
      webRef.current?.injectJavaScript(`
        window.__clearMap();
        window.__setCoords(${JSON.stringify(payload)});
        true;
      `);
    } else {
      webRef.current?.injectJavaScript(`window.__clearMap(); true;`);
    }
  }, [isReady, coordinates]);

  useEffect(() => {
    if (!isReady) return;
    if (userLocation) {
      webRef.current?.injectJavaScript(`
        window.__setUserLocation(${userLocation[0]}, ${userLocation[1]});
        true;
      `);
    } else {
      webRef.current?.injectJavaScript(`window.__removeUserLocation(); true;`);
    }
  }, [isReady, userLocation]);

  useEffect(() => {
      if (!isReady || !waypoints) return;

      // Serialize waypoints safely to JSON for injection
      const wpJson = JSON.stringify(waypoints);

      webRef.current?.injectJavaScript(`
        try {
          window.__setWaypoints(${wpJson});
          true;
        } catch (err) {
          console.log('Error injecting waypoints', err);
          false;
        }
      `);
    }, [isReady, waypoints]);

  return (
    <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={require("./LeafletHTML.html")}
          onMessage={handleMessage}
          style={{ flex: 1 }}
          // Debug-friendly settings (optional)
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          mixedContentMode="always"
        />
  );
};

export default LeafletMap;
