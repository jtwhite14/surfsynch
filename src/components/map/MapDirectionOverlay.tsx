"use client";

import { Marker } from "react-map-gl/mapbox";
import type { CardinalDirection } from "@/types";

interface MapDirectionOverlayProps {
  longitude: number;
  latitude: number;
  selected: CardinalDirection[];
  onChange: (directions: CardinalDirection[]) => void;
  mode: "target" | "exclusion";
}

const DIRECTIONS: CardinalDirection[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const DIR_ANGLES: Record<CardinalDirection, number> = {
  N: -90, NE: -45, E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: -135,
};

const SIZE = 240;
const CENTER = SIZE / 2;
const INNER_R = 18;
const OUTER_R = (SIZE / 2) - 4;

/** Build an SVG arc path for a 45° wedge starting at `startAngle` degrees. */
function wedgePath(startAngle: number): string {
  const startRad = (startAngle - 22.5) * Math.PI / 180;
  const endRad = (startAngle + 22.5) * Math.PI / 180;

  const x1 = CENTER + INNER_R * Math.cos(startRad);
  const y1 = CENTER + INNER_R * Math.sin(startRad);
  const x2 = CENTER + OUTER_R * Math.cos(startRad);
  const y2 = CENTER + OUTER_R * Math.sin(startRad);
  const x3 = CENTER + OUTER_R * Math.cos(endRad);
  const y3 = CENTER + OUTER_R * Math.sin(endRad);
  const x4 = CENTER + INNER_R * Math.cos(endRad);
  const y4 = CENTER + INNER_R * Math.sin(endRad);

  return `M ${x1} ${y1} L ${x2} ${y2} A ${OUTER_R} ${OUTER_R} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${INNER_R} ${INNER_R} 0 0 0 ${x1} ${y1} Z`;
}

/** Position for the direction label on each wedge. */
function labelPos(angle: number): { x: number; y: number } {
  const r = (INNER_R + OUTER_R) / 2;
  const rad = angle * Math.PI / 180;
  return {
    x: CENTER + r * Math.cos(rad),
    y: CENTER + r * Math.sin(rad),
  };
}

export default function MapDirectionOverlay({
  longitude,
  latitude,
  selected,
  onChange,
  mode,
}: MapDirectionOverlayProps) {
  function toggle(dir: CardinalDirection) {
    if (selected.includes(dir)) {
      onChange(selected.filter(d => d !== dir));
    } else {
      onChange([...selected, dir]);
    }
  }

  const isExclusion = mode === "exclusion";

  return (
    <Marker longitude={longitude} latitude={latitude} anchor="center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="drop-shadow-lg"
        style={{ pointerEvents: "auto" }}
      >
        {/* Background circle for context */}
        <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="black" fillOpacity={0.15} />

        {DIRECTIONS.map(dir => {
          const angle = DIR_ANGLES[dir];
          const isSelected = selected.includes(dir);
          const pos = labelPos(angle);

          return (
            <g key={dir} onClick={(e) => { e.stopPropagation(); toggle(dir); }} style={{ cursor: "pointer" }}>
              <path
                d={wedgePath(angle)}
                fill={
                  isSelected
                    ? isExclusion ? "rgba(239, 68, 68, 0.45)" : "rgba(59, 130, 246, 0.45)"
                    : "rgba(255, 255, 255, 0.08)"
                }
                stroke={
                  isSelected
                    ? isExclusion ? "rgba(239, 68, 68, 0.8)" : "rgba(59, 130, 246, 0.8)"
                    : "rgba(255, 255, 255, 0.25)"
                }
                strokeWidth={1.5}
                className="transition-colors duration-150"
              />
              {/* Hover highlight */}
              <path
                d={wedgePath(angle)}
                fill="transparent"
                className={isSelected ? "" : "hover:fill-white/10"}
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={isSelected ? "white" : "rgba(255,255,255,0.7)"}
                fontSize={11}
                fontWeight={isSelected ? 700 : 500}
                className="pointer-events-none select-none"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
              >
                {dir}
              </text>
            </g>
          );
        })}

        {/* Center dot */}
        <circle cx={CENTER} cy={CENTER} r={INNER_R} fill="black" fillOpacity={0.15} />
        <circle cx={CENTER} cy={CENTER} r={3} fill="white" fillOpacity={0.7} />
      </svg>
    </Marker>
  );
}
