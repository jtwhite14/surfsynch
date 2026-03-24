"use client";

import { Marker } from "react-map-gl/mapbox";
import type { CardinalDirection, WindSpeedTier } from "@/types";
import type { WindRoseValue } from "@/components/profiles/WindRose";

interface MapWindRoseOverlayProps {
  longitude: number;
  latitude: number;
  value: WindRoseValue;
  onChange: (value: WindRoseValue) => void;
  mode?: "target" | "exclusion";
}

const DIRECTIONS: { dir: CardinalDirection; angle: number }[] = [
  { dir: "N", angle: -90 },
  { dir: "NE", angle: -45 },
  { dir: "E", angle: 0 },
  { dir: "SE", angle: 45 },
  { dir: "S", angle: 90 },
  { dir: "SW", angle: 135 },
  { dir: "W", angle: 180 },
  { dir: "NW", angle: -135 },
];

const TIERS: (WindSpeedTier | undefined)[] = [undefined, "light", "moderate", "strong"];

const TIER_FILL_TARGET: Record<WindSpeedTier, string> = {
  light: "rgba(59, 130, 246, 0.25)",
  moderate: "rgba(59, 130, 246, 0.45)",
  strong: "rgba(59, 130, 246, 0.7)",
};

const TIER_STROKE_TARGET: Record<WindSpeedTier, string> = {
  light: "rgba(59, 130, 246, 0.5)",
  moderate: "rgba(59, 130, 246, 0.7)",
  strong: "rgba(59, 130, 246, 0.9)",
};

const TIER_FILL_EXCLUSION: Record<WindSpeedTier, string> = {
  light: "rgba(239, 68, 68, 0.25)",
  moderate: "rgba(239, 68, 68, 0.45)",
  strong: "rgba(239, 68, 68, 0.7)",
};

const TIER_STROKE_EXCLUSION: Record<WindSpeedTier, string> = {
  light: "rgba(239, 68, 68, 0.5)",
  moderate: "rgba(239, 68, 68, 0.7)",
  strong: "rgba(239, 68, 68, 0.9)",
};

// Radius fraction per tier (of the full wedge range)
const TIER_RADIUS_FRAC: Record<WindSpeedTier, number> = {
  light: 0.4,
  moderate: 0.7,
  strong: 1.0,
};

const SIZE = 240;
const CENTER = SIZE / 2;
const INNER_R = 18;
const OUTER_R = (SIZE / 2) - 4;

/** Build an SVG arc path for a wedge with variable outer radius. */
function wedgePath(startAngle: number, outerR: number): string {
  const startRad = (startAngle - 22.5) * Math.PI / 180;
  const endRad = (startAngle + 22.5) * Math.PI / 180;

  const x1 = CENTER + INNER_R * Math.cos(startRad);
  const y1 = CENTER + INNER_R * Math.sin(startRad);
  const x2 = CENTER + outerR * Math.cos(startRad);
  const y2 = CENTER + outerR * Math.sin(startRad);
  const x3 = CENTER + outerR * Math.cos(endRad);
  const y3 = CENTER + outerR * Math.sin(endRad);
  const x4 = CENTER + INNER_R * Math.cos(endRad);
  const y4 = CENTER + INNER_R * Math.sin(endRad);

  return `M ${x1} ${y1} L ${x2} ${y2} A ${outerR} ${outerR} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${INNER_R} ${INNER_R} 0 0 0 ${x1} ${y1} Z`;
}

/** Position for the direction label. */
function labelPos(angle: number): { x: number; y: number } {
  const r = (INNER_R + OUTER_R) / 2;
  const rad = angle * Math.PI / 180;
  return {
    x: CENTER + r * Math.cos(rad),
    y: CENTER + r * Math.sin(rad),
  };
}

export default function MapWindRoseOverlay({
  longitude,
  latitude,
  value,
  onChange,
  mode = "target",
}: MapWindRoseOverlayProps) {
  const tierFill = mode === "exclusion" ? TIER_FILL_EXCLUSION : TIER_FILL_TARGET;
  const tierStroke = mode === "exclusion" ? TIER_STROKE_EXCLUSION : TIER_STROKE_TARGET;
  function cycleTier(dir: CardinalDirection) {
    const current = value[dir];
    const currentIdx = TIERS.indexOf(current);
    const nextIdx = (currentIdx + 1) % TIERS.length;
    const next = TIERS[nextIdx];
    const updated = { ...value };
    if (next) {
      updated[dir] = next;
    } else {
      delete updated[dir];
    }
    onChange(updated);
  }

  return (
    <Marker longitude={longitude} latitude={latitude} anchor="center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="drop-shadow-lg"
        style={{ pointerEvents: "auto" }}
      >
        {/* Background circle */}
        <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="black" fillOpacity={0.15} />

        {/* Guide rings */}
        <circle cx={CENTER} cy={CENTER} r={INNER_R + (OUTER_R - INNER_R) * 0.4} fill="none" stroke="white" strokeOpacity={0.08} strokeWidth={0.5} strokeDasharray="3 4" />
        <circle cx={CENTER} cy={CENTER} r={INNER_R + (OUTER_R - INNER_R) * 0.7} fill="none" stroke="white" strokeOpacity={0.08} strokeWidth={0.5} strokeDasharray="3 4" />

        {DIRECTIONS.map(({ dir, angle }) => {
          const tier = value[dir];
          const pos = labelPos(angle);

          // Full-size outline wedge (hit area)
          const outlinePath = wedgePath(angle, OUTER_R);

          // Filled wedge scaled by tier
          const filledR = tier
            ? INNER_R + (OUTER_R - INNER_R) * TIER_RADIUS_FRAC[tier]
            : 0;
          const fillPath = tier ? wedgePath(angle, filledR) : null;

          return (
            <g key={dir} onClick={(e) => { e.stopPropagation(); cycleTier(dir); }} style={{ cursor: "pointer" }}>
              {/* Hit area / outline */}
              <path
                d={outlinePath}
                fill="rgba(255, 255, 255, 0.08)"
                stroke="rgba(255, 255, 255, 0.25)"
                strokeWidth={1.5}
                className="transition-colors duration-150"
              />
              {/* Hover highlight */}
              <path
                d={outlinePath}
                fill="transparent"
                className={tier ? "" : "hover:fill-white/10"}
              />
              {/* Filled portion */}
              {fillPath && (
                <path
                  d={fillPath}
                  fill={tierFill[tier!]}
                  stroke={tierStroke[tier!]}
                  strokeWidth={1.5}
                  className="pointer-events-none transition-all duration-200"
                />
              )}
              {/* Label */}
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={tier ? "white" : "rgba(255,255,255,0.7)"}
                fontSize={11}
                fontWeight={tier ? 700 : 500}
                className="pointer-events-none select-none"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
              >
                {dir}
              </text>
            </g>
          );
        })}

        {/* White center fill + dot — matches compass overlay */}
        <circle cx={CENTER} cy={CENTER} r={INNER_R} fill="white" fillOpacity={0.12} />
        <circle cx={CENTER} cy={CENTER} r={4} fill="white" fillOpacity={0.6} />
      </svg>
    </Marker>
  );
}
