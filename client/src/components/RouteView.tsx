// src/components/RouteView.tsx
import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import L, { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

const API = import.meta.env.VITE_API_BASE || "http://localhost:5100";

export default function RouteView() {
  const { id } = useParams<{ id: string }>();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  // init map once
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // guard against StrictMode double-mount

    const map = L.map(containerRef.current).setView([44.12, -121.46], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    mapRef.current = map;

    // ✅ proper cleanup (returns void)
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // load the route whenever id changes
  useEffect(() => {
    if (!id || !mapRef.current) return;

    // add layer then fit bounds
    fetch(`${API}/api/routes/${id}.geojson`)
      .then((r) => r.json())
      .then((geo) => {
        const layer = L.geoJSON(geo, { style: { weight: 4, color: "blue" } }).addTo(mapRef.current!);
        const b = layer.getBounds();
        if (b.isValid()) mapRef.current!.fitBounds(b);
      })
      .catch(console.error);
  }, [id]);

  return <div ref={containerRef} style={{ height: "100vh" }} />;
}
