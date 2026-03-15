"use client";

import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  ReferenceLine,
  LabelList,
} from "recharts";
import { formatHour, sessionColor, axisColor } from "./TimelineChart";
import { DirectionStrip } from "./DirectionStrip";
import { HourlyForecast } from "@/types";
import { metersToFeet, getDirectionText } from "@/lib/api/open-meteo";

interface SurfChartProps {
  data: HourlyForecast[];
  sessionIndex: number;
}

const barColor = "oklch(0.65 0.06 230)";       // muted slate-blue
const barSessionColor = "oklch(0.55 0.10 230)"; // darker blue for session bar

function getBodyPart(ft: number): string {
  if (ft < 0.5) return "Flat";
  if (ft < 1) return "Ankle";
  if (ft < 2) return "Ankle to knee";
  if (ft < 3) return "Knee to waist";
  if (ft < 4) return "Waist to chest";
  if (ft < 5) return "Chest to shoulder";
  if (ft < 6) return "Shoulder to head";
  if (ft < 8) return "Overhead";
  if (ft < 10) return "Double overhead";
  return "Double overhead+";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SurfTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="backdrop-blur-xl bg-black/70 border border-white/10 rounded-xl px-3.5 py-2.5 shadow-2xl">
      <p className="text-[11px] text-white/50 mb-1.5 font-medium tracking-wide uppercase">
        {formatHour(d.time)}
      </p>
      <div className="flex items-center gap-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: barColor }} />
        <span className="text-white/60 text-xs">Wave</span>
        <span className="text-white text-xs font-medium ml-auto tabular-nums">
          {d.wave != null ? `${d.wave.toFixed(1)} ft` : "—"}
        </span>
      </div>
      {d.swellHt != null && (
        <div className="flex items-center gap-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-white/30" />
          <span className="text-white/60 text-xs">Swell</span>
          <span className="text-white text-xs font-medium ml-auto tabular-nums">
            {d.swellHt.toFixed(1)} ft
            {d.period != null ? ` @ ${d.period.toFixed(0)}s` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

export function SurfChart({ data, sessionIndex }: SurfChartProps) {
  const chartData = data.map((h) => ({
    time: h.time,
    wave: metersToFeet(h.waveHeight) ?? 0,
    swellHt: metersToFeet(h.primarySwellHeight) ?? undefined,
    period: h.primarySwellPeriod ?? undefined,
  }));

  const directions = data.map((h) => h.primarySwellDirection);

  const sessionWave = chartData[sessionIndex]?.wave ?? 0;
  const sessionSwell = chartData[sessionIndex]?.swellHt;
  const sessionPeriod = chartData[sessionIndex]?.period;
  const sessionDir = directions[sessionIndex];
  const dirText = sessionDir != null ? getDirectionText(sessionDir) : null;

  // Build swell subtitle: "6.6ft  6s  ▸ SE 141°"
  const swellParts = [
    sessionSwell != null ? `${sessionSwell.toFixed(1)}ft` : null,
    sessionPeriod != null ? `${sessionPeriod.toFixed(0)}s` : null,
  ].filter(Boolean);

  const sessionTime = data[sessionIndex]?.time;

  // Determine which bars get a label — show on the session bar,
  // first, last, and wherever value changes significantly
  const labelIndices = new Set<number>();
  labelIndices.add(sessionIndex);
  labelIndices.add(0);
  labelIndices.add(chartData.length - 1);
  // Show label when rounded value changes
  let lastRounded = -1;
  chartData.forEach((d, i) => {
    const rounded = Math.round(d.wave);
    if (rounded !== lastRounded) {
      labelIndices.add(i);
      lastRounded = rounded;
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLabel = (props: any) => {
    const { x, y, width, index, value } = props;
    if (!labelIndices.has(index) || value == null || value === 0) return null;
    return (
      <text
        x={x + width / 2}
        y={y - 6}
        textAnchor="middle"
        fill="oklch(0.7 0.06 230)"
        fontSize={11}
        fontWeight={600}
      >
        {Math.round(value)}
      </text>
    );
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      {/* Header */}
      <div className="flex items-start gap-8 p-5 pb-3">
        {/* Surf Height section */}
        <div>
          <span className="text-[13px] font-medium text-white/40 tracking-wide">
            SURF HEIGHT
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-semibold tracking-tight text-white">
              {sessionWave > 0
                ? `${Math.floor(sessionWave)}-${Math.ceil(sessionWave)}`
                : "—"}
            </span>
            <span className="text-sm text-white/40 font-medium">ft</span>
          </div>
          <p className="text-[11px] text-white/30 mt-0.5">
            {sessionWave > 0 ? getBodyPart(sessionWave) : ""}
          </p>
        </div>

        {/* Swell section */}
        <div>
          <span className="text-[13px] font-medium text-white/40 tracking-wide">
            SWELL
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-semibold text-white tabular-nums">
              {swellParts.length > 0 ? swellParts.join("  ") : "—"}
            </span>
          </div>
          {dirText && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <svg
                width="8"
                height="8"
                viewBox="0 0 10 10"
                className="text-white/40"
                style={{ transform: `rotate(${sessionDir}deg)` }}
              >
                <path d="M5 1L7.5 8H2.5L5 1Z" fill="currentColor" />
              </svg>
              <span className="text-[11px] text-white/30">
                {dirText} {sessionDir != null ? `${Math.round(sessionDir)}°` : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bar chart */}
      <div className="h-[180px] w-full px-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap="15%">
            <XAxis
              dataKey="time"
              tickFormatter={formatHour}
              tick={{ fill: axisColor, fontSize: 10, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              dy={4}
            />
            <YAxis hide domain={[0, "auto"]} />
            <Tooltip content={<SurfTooltip />} cursor={false} />
            {sessionTime && (
              <ReferenceLine
                x={sessionTime}
                stroke={sessionColor}
                strokeWidth={1.5}
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
            )}
            <Bar dataKey="wave" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="wave" content={renderLabel} />
              {chartData.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === sessionIndex ? barSessionColor : barColor}
                  fillOpacity={i === sessionIndex ? 1 : 0.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Swell direction strip */}
      <DirectionStrip directions={directions} sessionIndex={sessionIndex} label="Swell dir" />
    </div>
  );
}
