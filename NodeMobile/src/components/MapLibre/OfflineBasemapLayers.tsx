// src/components/MapLibre/OfflineBasemapLayers.tsx
import React from "react";
import {
  VectorSource,
  FillLayer,
  LineLayer,
  SymbolLayer,
} from "@maplibre/maplibre-react-native";

type OfflineBasemapLayersProps = {
  tileUrlTemplates: string[];
  minZoom?: number;
  maxZoom?: number;
};

/**
 * OfflineBasemapLayers
 *
 * Renders the hiking-optimized vector basemap from a PMTiles-backed
 * vector source. Expects the Planetiler schema:
 * - water, waterway
 * - landcover, landuse
 * - road
 * - park
 * - boundary
 * - place
 * - mountain_peak
 */
export const OfflineBasemapLayers: React.FC<OfflineBasemapLayersProps> = ({
  tileUrlTemplates,
  minZoom = 0,
  maxZoom = 14,
}) => {
  return (
    <VectorSource
      id="offline-basemap"
      tileUrlTemplates={tileUrlTemplates}
      minZoomLevel={minZoom}
      maxZoomLevel={maxZoom}
    >
      {/* Landcover / landuse */}
      <FillLayer
        id="offline-landcover"
        sourceLayerID="landcover"
        style={{
          fillColor: "#e8f3e6",
          fillOpacity: 1,
        }}
      />
      <FillLayer
        id="offline-landuse"
        sourceLayerID="landuse"
        style={{
          fillColor: "#f3f1e6",
          fillOpacity: 0.4,
        }}
      />

      {/* Water */}
      <FillLayer
        id="offline-water"
        sourceLayerID="water"
        style={{
          fillColor: "#a0c8f0",
          fillOpacity: 1,
        }}
      />
      <LineLayer
        id="offline-waterway"
        sourceLayerID="waterway"
        style={{
          lineColor: "#7fb5e8",
          lineWidth: 1.0,
        }}
      />

      {/* Roads (split by type) */}
      <LineLayer
        id="offline-road-major"
        sourceLayerID="road"
        filter={[
          "match",
          ["get", "highway"],
          ["motorway", "trunk", "primary", "secondary", "tertiary"],
          true,
          false,
        ]}
        style={{
          lineColor: "#c0a26b",
          lineWidth: 1.6,
        }}
      />
      <LineLayer
        id="offline-road-minor"
        sourceLayerID="road"
        filter={[
          "match",
          ["get", "highway"],
          ["unclassified", "residential", "service", "living_street"],
          true,
          false,
        ]}
        style={{
          lineColor: "#d6c29a",
          lineWidth: 0.9,
        }}
      />
      <LineLayer
        id="offline-road-trail"
        sourceLayerID="road"
        filter={[
          "match",
          ["get", "highway"],
          ["path", "footway", "track", "bridleway", "cycleway"],
          true,
          false,
        ]}
        style={{
          lineColor: "#8b5a2b",
          lineWidth: 1.1,
          lineDasharray: [1.5, 1.5],
        }}
      />

      {/* Parks + boundaries */}
      <FillLayer
        id="offline-park"
        sourceLayerID="park"
        style={{
          fillColor: "#c8e6c9",
          fillOpacity: 0.5,
        }}
      />
      <LineLayer
        id="offline-boundary"
        sourceLayerID="boundary"
        style={{
          lineColor: "#888888",
          lineWidth: 1.0,
        }}
      />

      {/* Labels: places + peaks */}
      <SymbolLayer
        id="offline-places"
        sourceLayerID="place"
        style={{
          textField: ["get", "name"],
          textSize: 12,
          textHaloColor: "#ffffff",
          textHaloWidth: 1,
        }}
      />
      <SymbolLayer
        id="offline-peaks"
        sourceLayerID="mountain_peak"
        style={{
          textField: ["coalesce", ["get", "name"], ""],
          textSize: 11,
          textHaloColor: "#ffffff",
          textHaloWidth: 1,
          textOffset: [0, 0.8],
        }}
      />
    </VectorSource>
  );
};
