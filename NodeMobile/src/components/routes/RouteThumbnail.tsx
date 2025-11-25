// src/components/routes/RouteThumbnail.tsx
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { API_BASE } from "../../config/env";
import { useThemeStyles } from "../../styles/theme";

type Props = {
  routeId: number;
  width?: number;
  height?: number;
};

type Coord = [number, number]; // [lng, lat]

// Convert coords into "x,y x,y ..." inside a tiny box
function normalizeCoords(coords: Coord[], w: number, h: number): string {
  if (!coords.length) return "";

  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  return coords
    .map(([x, y]) => {
      const nx = (x - minX) / spanX;
      const ny = (y - minY) / spanY;
      const px = nx * w;
      const py = (1 - ny) * h;
      return `${px},${py}`;
    })
    .join(" ");
}

const RouteThumbnail: React.FC<Props> = ({
  routeId,
  width = 60,
  height = 36,
}) => {
  const { colors } = useThemeStyles();
  const [points, setPoints] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        console.log("[RouteThumbnail] fetching gpx for route", routeId);

        const resp = await fetch(`${API_BASE}/api/routes/${routeId}/gpx`);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = await resp.json();
        const featureCollection =
          data.geojson ??
          data.gpx ??
          data; 

        const lineCoords: Coord[] = [];

        if (featureCollection?.type === "FeatureCollection") {
          for (const feature of featureCollection.features ?? []) {
            const geom = feature.geometry;
            if (!geom) continue;

            if (geom.type === "LineString") {
              lineCoords.push(...(geom.coordinates as Coord[]));
            } else if (geom.type === "MultiLineString") {
              for (const seg of geom.coordinates as Coord[][]) {
                lineCoords.push(...seg);
              }
            }
          }
        }

        if (!cancelled && lineCoords.length > 0) {
          const pts = normalizeCoords(lineCoords, width, height);
          setPoints(pts);
        }
      } catch (e) {
        console.warn("[RouteThumbnail] failed to load route gpx", routeId, e);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [routeId, width, height]);


  if (!points) {
    return (
      <View
        style={{
          width,
          height,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: colors.textSecondary,
          opacity: 0.4,
        }}
      />
    );
  }

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        borderRadius: 6,
        backgroundColor: "transparent",
      }}
    >
      <Polyline
        points={points}
        fill="none"
        stroke={colors.textPrimary} 
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default RouteThumbnail;
