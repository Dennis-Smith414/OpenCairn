import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import type { WebView as WebViewType } from "react-native-webview";
import { fetchRouteGeo } from "../lib/api";

type GeoFeature = {
  type: "Feature";
  properties: any;
  geometry: { type: "LineString" | "MultiLineString"; coordinates: number[][] | number[][][] };
};

const toLatLng = (xy: number[]) => [xy[1], xy[0]] as [number, number];
function flattenToLatLng(geom: GeoFeature["geometry"]): [number, number][] {
  if (geom.type === "LineString") return (geom.coordinates as number[][]).map(toLatLng);
  return (geom.coordinates as number[][][]).flatMap(seg => seg.map(toLatLng));
}

const HTML = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="initial-scale=1, maximum-scale=1, width=device-width"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0}.leaflet-container{background:#e6edf2}.attribution{position:absolute;right:8px;bottom:8px;background:rgba(255,255,255,.85);padding:4px 6px;border-radius:6px;font:12px/1.2 system-ui,-apple-system,Roboto,Arial}</style>
</head><body><div id="map"></div><div class="attribution">© OpenStreetMap contributors</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const map=L.map('map',{zoomControl:true});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:''}).addTo(map);
  window.__setCoords=function(payload){
    try{
      const coords=(payload&&payload.coords)||[];
      if(!coords.length){map.setView([37.7749,-122.4194],12);return;}
      const line=L.polyline(coords,{weight:4}).addTo(map);
      map.fitBounds(line.getBounds(),{padding:[20,20]});
    }catch(e){console.error('setCoords error',e);}
  };
</script></body></html>`;

export default function TrailMapScreen({ route }: any) {
  const { id } = route.params as { id: number; name?: string };
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const webref = useRef<WebViewType>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true); setErr(null);
        const feature = await fetchRouteGeo(id);
        const latlng = flattenToLatLng((feature as GeoFeature).geometry);
        if (alive) setCoords(latlng);
      } catch (e: any) {
        if (alive) setErr(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const pushCoords = useCallback(() => {
    if (!ready || !coords.length) return;
    const js = `window.__setCoords(${JSON.stringify({ coords })}); true;`;
    webref.current?.injectJavaScript(js);
  }, [ready, coords]);

  useEffect(() => { pushCoords(); }, [pushCoords]);

  if (loading) return <View style={S.center}><ActivityIndicator/><Text>Loading trail…</Text></View>;
  if (err)     return <View style={S.center}><Text style={S.err}>Error: {err}</Text></View>;
  if (!coords.length) return <View style={S.center}><Text>No geometry for this trail.</Text></View>;

  return (
    <WebView
      ref={webref}
      originWhitelist={["*"]}
      source={{ html: HTML }}
      onLoadEnd={() => setReady(true)}
      onMessage={() => {}}
      style={{ flex: 1 }}
    />
  );
}
const S = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  err: { color: "#b00020", textAlign: "center" },
});
