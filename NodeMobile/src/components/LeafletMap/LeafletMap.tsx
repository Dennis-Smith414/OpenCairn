import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { WebView as WebViewType } from 'react-native-webview';

export type LatLng = [number, number];

interface MapPayload {
    coords: LatLng[];
}

export interface LeafletMapProps {
    coordinates: LatLng[];
    center?: LatLng;
    zoom?: number;
    lineColor?: string;
    lineWeight?: number;
    userLocation?: LatLng | null;
    onMapReady?: () => void;
    onLocationError?: (error: string) => void;
}

const FALLBACK_CENTER: LatLng = [37.7749, -122.4194];
const DEFAULT_ZOOM = 13;
const DEFAULT_LINE_COLOR = '#2196F3';
const DEFAULT_LINE_WEIGHT = 4;

function generateLeafletHTML(
    center: LatLng,
    zoom: number,
    lineColor: string,
    lineWeight: number
): string {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="initial-scale=1, maximum-scale=1, width=device-width"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    html, body, #map { height: 100%; margin: 0; }
    .leaflet-container { background: #e6edf2; }
    .attribution {
      position: absolute; right: 8px; bottom: 8px;
      background: rgba(255, 255, 255, 0.85);
      padding: 4px 6px; border-radius: 6px;
      font: 12px/1.2 system-ui, -apple-system, Roboto, Arial;
      z-index: 1000;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="attribution">© OpenStreetMap</div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { zoomControl: true });
    const baseLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);
    
    map.setView([${center[0]}, ${center[1]}], ${zoom});
    
    window.__lineColor = '${lineColor}';
    window.__lineWeight = ${lineWeight};
    
    let currentPolyline = null;
    let userMarker = null;
    
    const userIcon = L.divIcon({
      className: 'user-location-marker',
      html: '<div style="background: #4285F4; width: 10px; height: 10px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    
    window.__clearMap = function() {
      try {
        if (currentPolyline) {
          map.removeLayer(currentPolyline);
          currentPolyline = null;
        }
      } catch (e) { console.error('[Leaflet] Clear error:', e); }
    };
    
    window.__setUserLocation = function(lat, lng) {
      try {
        if (userMarker) {
          userMarker.setLatLng([lat, lng]);
        } else {
          userMarker = L.marker([lat, lng], { 
            icon: userIcon,
            zIndexOffset: 1000
          }).addTo(map);
          userMarker.bindPopup('Your Location');
        }
      } catch (e) { 
        console.error('[Leaflet] Set user location error:', e);
      }
    };
    
    window.__removeUserLocation = function() {
      try {
        if (userMarker) {
          map.removeLayer(userMarker);
          userMarker = null;
        }
      } catch (e) { console.error('[Leaflet] Remove user location error:', e); }
    };
    
    window.__setCoords = function(payload) {
      try {
        const coords = (payload?.coords) || [];
        if (!coords.length) return;
        
        if (currentPolyline) map.removeLayer(currentPolyline);
        
        currentPolyline = L.polyline(coords, {
          color: window.__lineColor || '${lineColor}',
          weight: window.__lineWeight || ${lineWeight},
          opacity: 0.8
        }).addTo(map);
        
        map.fitBounds(currentPolyline.getBounds(), { padding: [20, 20] });
      } catch (e) { console.error('[Leaflet] Set coords error:', e); }
    };
    
    setTimeout(() => {
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'MAP_READY' }));
    }, 100);
  </script>
</body>
</html>`;
}

const LeafletMap: React.FC<LeafletMapProps> = ({
                                                   coordinates,
                                                   center = FALLBACK_CENTER,
                                                   zoom = DEFAULT_ZOOM,
                                                   lineColor = DEFAULT_LINE_COLOR,
                                                   lineWeight = DEFAULT_LINE_WEIGHT,
                                                   userLocation = null,
                                                   onMapReady,
                                                   onLocationError,
                                               }) => {
    const webRef = useRef<WebViewType>(null);
    const [isReady, setIsReady] = useState(false);

    const html = useMemo(() => {
        return generateLeafletHTML(FALLBACK_CENTER, DEFAULT_ZOOM, lineColor, lineWeight);
    }, [lineColor, lineWeight]);

    const handleMessage = useCallback((event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'MAP_READY') {
                setIsReady(true);
                onMapReady?.();
            }
        } catch (e) {
            console.error('LeafletMap: Message parse error:', e);
        }
    }, [onMapReady]);

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
            webRef.current?.injectJavaScript(`
                window.__clearMap();
                true;
            `);
        }
    }, [isReady, coordinates]);

    useEffect(() => {
        if (!isReady) return;

        if (userLocation) {
            const [lat, lng] = userLocation;
            webRef.current?.injectJavaScript(`
                window.__setUserLocation(${lat}, ${lng});
                true;
            `);
        } else {
            webRef.current?.injectJavaScript(`
                window.__removeUserLocation();
                true;
            `);
        }
    }, [isReady, userLocation]);

    useEffect(() => {
        if (isReady && center) {
            const [lat, lng] = center;
            webRef.current?.injectJavaScript(`
                map.setView([${lat}, ${lng}], ${zoom});
                true;
            `);
        }
    }, [isReady, center, zoom]);

    return (
        <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html }}
            onMessage={handleMessage}
            style={{ flex: 1 }}
        />
    );
};

export default LeafletMap;