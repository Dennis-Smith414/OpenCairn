// The gliding location dot: halo, core, and heading arrow.
//
// Separate from MapLibreMap purely for performance — useSmoothedLocation
// publishes every animation frame, so whichever component owns it re-renders at
// that rate. Here that's three layers instead of the whole map.
//
// DISPLAY ONLY.
import React, { useEffect, useMemo } from "react";
import { ShapeSource, CircleLayer, SymbolLayer } from "@maplibre/maplibre-react-native";
import { useSmoothedLocation, SnapToRoute, OnAnchor } from "../../hooks/useSmoothedLocation";
import type { LocationEstimator } from "../../utils/kalmanLocation";

// Hoisted so they're the same reference every render: the library memoizes on
// prop identity, and a fresh object literal defeats that.
const HALO_STYLE = { circleRadius: 16, circleOpacity: 0.18 } as const;
const CORE_STYLE = {
  circleRadius: 7,
  circleStrokeColor: "#FFFFFF",
  circleStrokeWidth: 2.5,
} as const;

// The arrow paints ABOVE the core — the core is an opaque 19px disc and buries
// it otherwise.
//
// user-heading.png's ink occupies y 3..28 of a 64px canvas, so its centre sits at
// y 15.5 and the icon carries a BUILT-IN 16.5px upward offset that iconOffset
// stacks on top of. Reason about HEADING_GEOMETRY, never iconOffset alone.
const ICON_CANVAS = 64;
const ICON_INK_HEIGHT = 26;
const ICON_INK_WIDTH = 32;
// How far the ink's centre already sits above the canvas centre, pre-scale.
const ICON_BUILT_IN_OFFSET = ICON_CANVAS / 2 - (3 + 28) / 2; // 16.5

const HEADING_ICON_SIZE = 0.4; // ink renders ~12.8pt wide against a 19pt dot
const HEADING_ICON_OFFSET_Y = -16;

// iconOffset is multiplied by iconSize and rotates with iconRotate. Total here:
// (16.5 + 16) * 0.4 = 13pt out, near edge at 7.8pt — just inside the core's
// 9.5pt edge, so the arrow touches the dot rather than floating off it.
const HEADING_STYLE = {
  iconImage: "user-heading",
  iconRotationAlignment: "map",
  iconPitchAlignment: "map",
  iconAllowOverlap: true,
  iconIgnorePlacement: true,
  iconSize: HEADING_ICON_SIZE,
  iconOffset: [0, HEADING_ICON_OFFSET_Y] as number[],
} as const;

/** Exported so tests can assert the arrow stays attached but not buried. */
export const HEADING_GEOMETRY = {
  /** Distance in pt from the dot's centre to the arrow ink's centre. */
  inkCentreOffsetPt:
    (ICON_BUILT_IN_OFFSET + Math.abs(HEADING_ICON_OFFSET_Y)) * HEADING_ICON_SIZE,
  inkHalfHeightPt: (ICON_INK_HEIGHT / 2) * HEADING_ICON_SIZE,
  inkWidthPt: ICON_INK_WIDTH * HEADING_ICON_SIZE,
  /** Outer edge of the core circle: circleRadius 7 + circleStrokeWidth 2.5. */
  coreOuterRadiusPt: 9.5,
} as const;

export interface SmoothedUserDotProps {
  enabled: boolean;
  /** Raw fix as [lat, lng], straight from the platform. */
  userLocation: [number, number] | null;
  userAccuracy: number | null;
  userHeading: number | null;
  /** When the platform COMPUTED the fix (epoch ms), not when JS received it. */
  userTs: number | null;
  /** Platform ground speed (m/s); lets the dot glide from the very first fix. */
  userSpeed: number | null;
  estimator: LocationEstimator | null;
  snapToRoute: SnapToRoute | null;
  /** Blended on-route -> off-route colour. Changes about once per fix. */
  dotColor: string;
  /** Fires once per FIX with the corrected, route-bound position. */
  onAnchor?: OnAnchor | null;
  /** Compass bearing, or null when untrusted. See useCompassHeading. */
  compassHeadingDeg?: number | null;
  /** Layer id others pin themselves below, so the dot always paints on top. */
  belowLayerAnchorId?: string;
}

const SmoothedUserDot: React.FC<SmoothedUserDotProps> = ({
  enabled,
  userLocation,
  userAccuracy,
  userHeading,
  userTs,
  userSpeed,
  estimator,
  snapToRoute,
  dotColor,
  onAnchor = null,
  compassHeadingDeg = null,
}) => {
  const { smoothed, pushFix } = useSmoothedLocation(
    enabled,
    estimator,
    snapToRoute,
    onAnchor,
    compassHeadingDeg,
  );

  useEffect(() => {
    if (!enabled || !userLocation) return;
    // Null heading = no course right now; the smoother carries the last forward.
    pushFix(userLocation[0], userLocation[1], userHeading, userAccuracy, userTs, userSpeed);
  }, [enabled, userLocation, userHeading, userAccuracy, userTs, userSpeed, pushFix]);

  // Keyed on coordinates so an unrelated re-render can't re-send identical geometry.
  const shape = useMemo(
    () =>
      smoothed
        ? {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "Point" as const,
              coordinates: [smoothed.lng, smoothed.lat],
            },
          }
        : null,
    [smoothed?.lat, smoothed?.lng],
  );

  const haloStyle = useMemo(() => ({ ...HALO_STYLE, circleColor: dotColor }), [dotColor]);
  const coreStyle = useMemo(() => ({ ...CORE_STYLE, circleColor: dotColor }), [dotColor]);
  const headingStyle = useMemo(
    () => ({
      ...HEADING_STYLE,
      // Hidden until a direction is known — `heading` defaults to 0.
      iconOpacity: smoothed?.headingKnown ? 1 : 0,
      iconRotate: smoothed?.heading ?? 0,
    }),
    [smoothed?.headingKnown, smoothed?.heading],
  );

  if (!enabled || !smoothed || !shape) return null;

  return (
    <ShapeSource id="smooth-user-dot" shape={shape}>
      <CircleLayer id="smooth-user-dot-halo" style={haloStyle} />
      <CircleLayer id="smooth-user-dot-core" style={coreStyle} />
      {/* Arrow LAST so it paints above the core — see HEADING_STYLE. */}
      <SymbolLayer id="smooth-user-dot-heading" style={headingStyle} />
    </ShapeSource>
  );
};

export default React.memo(SmoothedUserDot);
