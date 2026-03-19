"use client";

import { useCallback, useRef, useState } from "react";

const NUM_SEGMENTS = 12;
const SVG_WIDTH = 360;
const SVG_HEIGHT = 100;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 24;
const CURVE_HEIGHT = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const CENTER_Y = PADDING_TOP + CURVE_HEIGHT / 2;
const AMPLITUDE = CURVE_HEIGHT / 2 - 2;

// Sine wave: trough at 0%, peak at 50%, trough at 100%
function curveY(x: number): number {
  const phase = (x / SVG_WIDTH) * 2 * Math.PI;
  return CENTER_Y - AMPLITUDE * Math.cos(phase + Math.PI);
}

// Build an SVG path for one segment: area between baseline and curve
function segmentPath(segIndex: number): string {
  const x0 = (segIndex / NUM_SEGMENTS) * SVG_WIDTH;
  const x1 = ((segIndex + 1) / NUM_SEGMENTS) * SVG_WIDTH;
  const steps = 16;
  const dx = (x1 - x0) / steps;

  let d = `M ${x0} ${CENTER_Y}`;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + i * dx;
    d += ` L ${x} ${curveY(x)}`;
  }
  d += ` L ${x1} ${CENTER_Y} Z`;
  return d;
}

// Full sine wave path for the outline
function fullCurvePath(): string {
  const steps = 100;
  const dx = SVG_WIDTH / steps;
  let d = `M 0 ${curveY(0)}`;
  for (let i = 1; i <= steps; i++) {
    const x = i * dx;
    d += ` L ${x} ${curveY(x)}`;
  }
  return d;
}

const SEGMENT_PATHS = Array.from({ length: NUM_SEGMENTS }, (_, i) => segmentPath(i));
const CURVE_PATH = fullCurvePath();

const LABELS: { x: number; label: string }[] = [
  { x: 0, label: "Low" },
  { x: SVG_WIDTH * 0.25, label: "↑ Rising" },
  { x: SVG_WIDTH * 0.5, label: "High" },
  { x: SVG_WIDTH * 0.75, label: "↓ Falling" },
  { x: SVG_WIDTH, label: "Low" },
];

interface TideCurveSelectorProps {
  segments: boolean[];
  onChange: (segments: boolean[]) => void;
  mode: "target" | "exclusion";
}

export function TideCurveSelector({ segments, onChange, mode }: TideCurveSelectorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [painting, setPainting] = useState<boolean | null>(null);

  const getSegmentFromEvent = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const relX = x / rect.width;
    const seg = Math.floor(relX * NUM_SEGMENTS);
    return seg >= 0 && seg < NUM_SEGMENTS ? seg : null;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const seg = getSegmentFromEvent(e);
    if (seg == null) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const paintOn = !segments[seg];
    setPainting(paintOn);
    const next = [...segments];
    next[seg] = paintOn;
    onChange(next);
  }, [segments, onChange, getSegmentFromEvent]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (painting == null) return;
    const seg = getSegmentFromEvent(e);
    if (seg == null) return;
    if (segments[seg] !== painting) {
      const next = [...segments];
      next[seg] = painting;
      onChange(next);
    }
  }, [painting, segments, onChange, getSegmentFromEvent]);

  const handlePointerUp = useCallback(() => {
    setPainting(null);
  }, []);

  const anySelected = segments.some(Boolean);

  // Use CSS classes for segment fills to work with oklch CSS variables
  // Each segment is rendered with a class-based approach
  return (
    <div className="space-y-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full select-none touch-none cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Baseline */}
        <line
          x1={0} y1={CENTER_Y} x2={SVG_WIDTH} y2={CENTER_Y}
          className="stroke-border"
          strokeWidth={1}
          strokeDasharray="4 2"
        />

        {/* Segment fills */}
        {SEGMENT_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            className={
              segments[i]
                ? mode === "target"
                  ? "fill-primary/50 transition-[fill] duration-100"
                  : "fill-destructive/50 transition-[fill] duration-100"
                : "fill-muted-foreground/15 transition-[fill] duration-100"
            }
          />
        ))}

        {/* Curve outline */}
        <path
          d={CURVE_PATH}
          fill="none"
          className={
            anySelected
              ? mode === "target"
                ? "stroke-primary"
                : "stroke-destructive"
              : "stroke-muted-foreground/50"
          }
          strokeWidth={2}
        />

        {/* Labels below */}
        {LABELS.map(({ x, label }) => (
          <text
            key={label + x}
            x={Math.min(Math.max(x, 20), SVG_WIDTH - 20)}
            y={SVG_HEIGHT - 4}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px]"
          >
            {label}
          </text>
        ))}
      </svg>
      {!anySelected && (
        <p className="text-xs text-muted-foreground text-center">
          Tap or drag on the curve to select
        </p>
      )}
    </div>
  );
}
