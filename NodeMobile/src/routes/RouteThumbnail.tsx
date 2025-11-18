import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { fetchRouteGeojson } from "../../lib/api";

type Props = {
  routeId: number;
  width?: number;
  height?: number;
};

type Coord = [number, number];

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

  // scale into [0,w] x [0,h]
  return coords
    .map(([x, y]) => {
      const nx = (x - minX) / spanX;
      const ny = (y - minY) / spanY;
      const px = nx * w;
      const py = (1 - ny) * h; // flip Y so north is up
      return `${px},${py}`;
    })
    .join(" ");
}

const RouteThumbnail: React.FC<Props> = ({
  routeId,
  width = 60,
  height = 36,
}) => {
  const [points, setPoints] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const geojson = await fetchRouteGeojson(routeId);
        const lineCoords: Coord[] = [];

        if (geojson?.type === "FeatureCollection") {
          for (const feature of geojson.features ?? []) {
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
          setPoints(normalizeCoords(lineCoords, width, height));
        }
      } catch (e) {
        console.warn("[RouteThumbnail] failed to load route gpx", e);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [routeId, width, height]);

  // If we don’t have points yet, show a subtle placeholder box
  if (!points) {
    return (
      <View
        style={{
          width,
          height,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: "#555",
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
        stroke="white"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default RouteThumbnail;
