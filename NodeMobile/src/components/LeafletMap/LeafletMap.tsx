import React, { useRef, useState, useCallback, useEffect } from 'react';
import { WebView } from 'react-native-webview';
import { WebView as WebViewType } from 'react-native-webview';

export type LatLng = [number, number];

interface MapPayload {
  coords: LatLng[];
}

interface LeafletMapProps {
  coordinates: LatLng[];
  center?: LatLng;
  zoom?: number;
  userLocation?: LatLng | null;
  onMapReady?: () => void;
}

const FALLBACK_CENTER: LatLng = [37.7749, -122.4194];
const DEFAULT_ZOOM = 13;

const LeafletMap: React.FC<LeafletMapProps> = ({
  coordinates,
  center = FALLBACK_CENTER,
  zoom = DEFAULT_ZOOM,
  userLocation = null,
  onMapReady,
}) => {
  const webRef = useRef<WebViewType>(null);
  const [isReady, setIsReady] = useState(false);

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

  return (
    <WebView
      ref={webRef}
      originWhitelist={['*']}
      source={require('./LeafletHTML.html')}
      onMessage={handleMessage}
      style={{ flex: 1 }}
    />
  );
};

export default LeafletMap;
