// screens/MapScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import { useRoute } from '@react-navigation/native';
import { fetchRouteGeo } from '../lib/api';
import { Feature, FeatureCollection, Geometry } from 'geojson';
import { colors } from '../styles/theme';

type LatLng = [number, number];

// ❗ stable empty array to avoid new [] identity each render
const EMPTY_IDS: number[] = [];

// --- HTML template for Leaflet map ---
const HTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="initial-scale=1, maximum-scale=1, width=device-width"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{height:100%;margin:0}
  .leaflet-container{background:#e6edf2}
  .attribution{
    position:absolute;right:8px;bottom:8px;
    background:rgba(255,255,255,.85);
    padding:4px 6px;border-radius:6px;
    font:12px/1.2 system-ui,-apple-system,Roboto,Arial
  }
</style>
</head>
<body>
<div id="map"></div>
<div class="attribution">© OpenStreetMap contributors</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const map = L.map('map',{zoomControl:true});
  const base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  map.setView([37.7749,-122.4194], 12);

  window.__clearMap = function(){
    try {
      map.eachLayer(l => {
        if (l !== base && (l instanceof L.Polyline)) map.removeLayer(l);
      });
    } catch(e) { console.error('clearMap error', e); }
  };

  window.__setCoords = function(payload){
    try {
      const coords = (payload && payload.coords) || [];
      if (!coords.length) {
        console.warn('[WebView] No coords received');
        return;
      }
      const line = L.polyline(coords, {weight:4}).addTo(map);
      try { map.fitBounds(line.getBounds(), {padding:[20,20]}); }
      catch(e) { console.error('Leaflet fitBounds error', e); }
    } catch(e) { console.error('setCoords error', e); }
  };
</script>
</body>
</html>`;

/** flattenToLatLng: Converts GeoJSON to array of [lat,lng] */
function flattenToLatLng(geo: FeatureCollection | Feature | Geometry): LatLng[] {
  if (!geo) return [];
  if (geo.type === 'FeatureCollection') return geo.features.flatMap(f => flattenToLatLng(f));
  if (geo.type === 'Feature')          return flattenToLatLng(geo.geometry);
  if (geo.type === 'LineString')       return geo.coordinates.map(([lng, lat]) => [lat, lng]);
  if (geo.type === 'MultiLineString')  return geo.coordinates.flatMap(seg => seg.map(([lng, lat]) => [lat, lng]));
  return [];
}

const MapScreen: React.FC = () => {
  const route = useRoute<any>();

  // Use raw routeIds from navigation (may be undefined)
  const routeIdsRaw: number[] | undefined = route.params?.routeIds;
  // Fall back to a STABLE constant (not a new [] each render)
  const routeIds: number[] = routeIdsRaw ?? EMPTY_IDS;
  // Stable dependency key for effects
  const routeIdsKey = routeIdsRaw ? routeIdsRaw.join(',') : '';

  const [coords, setCoords]   = useState<LatLng[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [ready, setReady]     = useState(false);
  const webref = useRef<WebViewType>(null);

  // --- Fetch GeoJSON when routeIds change (by value) ---
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (!routeIdsRaw || routeIdsRaw.length === 0) {
          if (alive) setCoords([]); // single reset point
          return;
        }

        const collected: LatLng[] = [];
        for (const id of routeIdsRaw) {
          console.log(`[MapScreen] Fetching GeoJSON for route ${id}`);
          const geo = await fetchRouteGeo(id);
          if (!geo) continue;
          collected.push(...flattenToLatLng(geo));
        }
        if (alive) setCoords(collected);
      } catch (e: any) {
        if (alive) setErr(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
    // ❗ depend on the stable key, not the array reference
  }, [routeIdsKey]);

  // --- Inject coords into WebView when ready or coords change length ---
  useEffect(() => {
    if (!ready) return;

    try {
      webref.current?.injectJavaScript(`window.__clearMap(); true;`);

      if (coords.length) {
        const js = `window.__setCoords(${JSON.stringify({ coords })}); true;`;
        webref.current?.injectJavaScript(js);
        console.log('[MapScreen] injected', coords.length, 'coords');
      } else {
        console.log('[MapScreen] no coords to inject');
      }
    } catch (e) {
      console.error('[MapScreen] JS injection failed:', e);
    }
  }, [ready, coords.length]); // use length so we don't chase identity changes

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webref}
        originWhitelist={['*']}
        source={{ html: HTML }}
        onLoadEnd={() => {
          if (!ready) setReady(true); // set once
        }}
        onMessage={() => {}}
        style={{ flex: 1 }}
      />

      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.msg}>Loading route tracks…</Text>
        </View>
      )}
      {!!err && (
        <View style={styles.overlay}>
          <Text style={[styles.msg, styles.err]}>Error: {err}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', inset: 0 as any,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  msg: { marginTop: 8 },
  err: { color: '#b00020', textAlign: 'center' },
});

export default MapScreen;
