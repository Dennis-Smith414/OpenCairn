// src/components/routes/RoutePreview.tsx
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { apiGet } from "../../lib/api";

type Props = {
  routeId: number;
};

type Coordinate = [number, number]; // [lng, lat]

export const RoutePreview: React.FC<Props> = ({ routeId }) => {
  const [coords, setCoords] = useState<Coordinate[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
       
        const res = await apiGet(`/routes/${routeId}/gpx`);

        const features = res?.geojson?.features ?? res?.gpx?.features ?? [];
        const all: Coordinate[] = [];

        for (const f of features) {
          if (!f.geometry) continue;

          if (f.geometry.type === "LineString") {
            all.push(...(f.geometry.coordinates as Coordinate[]));
          } else if (f.geometry.type === "MultiLineString") {
            for (const seg of f.geometry.coordinates as Coordinate[][]) {
              all.push(...seg);
            }
          }
        }

        if (cancelled || all.length === 0) return;

 
        const maxPoints = 60;
        const step = Math.max(1, Math.floor(all.length / maxPoints));
        const sampled = all.filter((_, i) => i % step === 0);

        if (!cancelled) {
          setCoords(sampled);
        }
      } catch (e) {
        console.warn("[RoutePreview] failed to load gpx for route", routeId, e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeId]);

  const width = 60;
  const height = 60;

  if (coords.length === 0) {
    return <View style={{ width, height }} />;
  }

  const lats = coords.map((c) => c[1]);
  const lngs = coords.map((c) => c[0]);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latSpan = maxLat - minLat || 1;
  const lngSpan = maxLng - minLng || 1;

  const points = coords
    .map(([lng, lat]) => {
      const x = ((lng - minLng) / lngSpan) * width;
      const y = height - ((lat - minLat) / latSpan) * height; /
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Svg width={width} height={height}>
      <Polyline points={points} stroke="#FFFFFF" strokeWidth={2} fill="none" />
    </Svg>
  );
};

export default RoutePreview;
