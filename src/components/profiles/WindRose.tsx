"use client";

import { CardinalDirection, WindSpeedTier } from "@/types";

export type WindRoseValue = Partial<Record<CardinalDirection, WindSpeedTier>>;

interface WindRoseProps {
  value: WindRoseValue;
  onChange: (value: WindRoseValue) => void;
  size?: number;
}

const DIRECTIONS: { dir: CardinalDirection; deg: number }[] = [
  { dir: "N", deg: 0 },
  { dir: "NE", deg: 45 },
  { dir: "E", deg: 90 },
  { dir: "SE", deg: 135 },
  { dir: "S", deg: 180 },
  { dir: "SW", deg: 225 },
  { dir: "W", deg: 270 },
  { dir: "NW", deg: 315 },
];

const TIERS: (WindSpeedTier | undefined)[] = [undefined, "light", "moderate", "strong"];

const TIER_LABELS: Record<WindSpeedTier, string> = {
  light: "≤10km/h",
  moderate: "≤20km/h",
  strong: "≤30km/h",
};

// Outer radius per tier as fraction of max radius
const TIER_RADIUS: Record<WindSpeedTier, number> = {
  light: 0.4,
  moderate: 0.7,
  strong: 1.0,
};

// Opacity per tier
const TIER_OPACITY: Record<WindSpeedTier, number> = {
  light: 0.35,
  moderate: 0.6,
  strong: 0.9,
};

const GAP_DEG = 3; // degrees of gap between wedges
const INNER_R_FRAC = 0.18; // inner radius as fraction of max

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  // SVG: 0deg = up (north), clockwise
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number
): string {
  const p1 = polarToXY(cx, cy, innerR, startDeg);
  const p2 = polarToXY(cx, cy, outerR, startDeg);
  const p3 = polarToXY(cx, cy, outerR, endDeg);
  const p4 = polarToXY(cx, cy, innerR, endDeg);

  const sweep = endDeg - startDeg;
  const largeArc = sweep > 180 ? 1 : 0;

  return [
    `M ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p3.x} ${p3.y}`,
    `L ${p4.x} ${p4.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p1.x} ${p1.y}`,
    "Z",
  ].join(" ");
}

export function WindRose({ value, onChange, size = 180 }: WindRoseProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 16; // leave room for labels
  const innerR = maxR * INNER_R_FRAC;

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
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="select-none"
      >
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={maxR}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.5}
          className="text-muted-foreground/20"
        />
        <circle
          cx={cx}
          cy={cy}
          r={maxR * 0.7}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.5}
          strokeDasharray="2 3"
          className="text-muted-foreground/10"
        />
        <circle
          cx={cx}
          cy={cy}
          r={maxR * 0.4}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.5}
          strokeDasharray="2 3"
          className="text-muted-foreground/10"
        />

        {/* Wedges */}
        {DIRECTIONS.map(({ dir, deg }) => {
          const tier = value[dir];
          const halfWedge = 22.5 - GAP_DEG / 2;
          const startDeg = deg - halfWedge;
          const endDeg = deg + halfWedge;

          // Inactive outline wedge
          const outlinePath = wedgePath(cx, cy, innerR, maxR, startDeg, endDeg);

          // Active filled wedge
          const outerR = tier ? innerR + (maxR - innerR) * TIER_RADIUS[tier] : 0;
          const fillPath = tier
            ? wedgePath(cx, cy, innerR, outerR, startDeg, endDeg)
            : null;

          return (
            <g
              key={dir}
              onClick={() => cycleTier(dir)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${dir} wind: ${tier ?? "off"}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  cycleTier(dir);
                }
              }}
            >
              {/* Hit area / outline */}
              <path
                d={outlinePath}
                fill="currentColor"
                className="text-muted/60 hover:text-muted transition-colors"
              />
              {/* Filled portion */}
              {fillPath && (
                <path
                  d={fillPath}
                  fill="var(--primary)"
                  opacity={TIER_OPACITY[tier!]}
                  className="pointer-events-none transition-all duration-200"
                />
              )}
            </g>
          );
        })}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={2.5} fill="currentColor" className="text-muted-foreground/30" />

        {/* Direction labels */}
        {DIRECTIONS.map(({ dir, deg }) => {
          const labelR = maxR + 11;
          const pos = polarToXY(cx, cy, labelR, deg);
          const tier = value[dir];
          return (
            <text
              key={`label-${dir}`}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              className={`text-[10px] font-medium select-none pointer-events-none ${
                tier ? "fill-primary" : "fill-muted-foreground"
              }`}
            >
              {dir}
            </text>
          );
        })}
      </svg>
      <p className="text-[10px] text-muted-foreground">
        Tap direction to cycle: off → light → moderate → strong
      </p>
    </div>
  );
}
