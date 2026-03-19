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

  // Compute optimal Y domain: start from a floor near the min so bars show
  // meaningful height differences instead of all looking the same height.
  const waveValues = chartData.map((d) => d.wave).filter((v) => v > 0);
  const minWave = waveValues.length > 0 ? Math.min(...waveValues) : 0;
  const maxWave = waveValues.length > 0 ? Math.max(...waveValues) : 1;
  // Floor at 60% of min (rounded down) so even small differences are visible
  const yFloor = Math.max(0, Math.floor(minWave * 0.6));
  // Ceil with a little headroom for labels
  const yCeil = Math.ceil(maxWave) + 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (value == null || value === 0) return null;
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
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-4 sm:gap-8 p-4 sm:p-5 pb-3">
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
            <XAxis dataKey="time" hide />
            <YAxis hide domain={[yFloor, yCeil]} />
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

      {/* Time + period + direction — unified grid */}
      <div className="flex px-4 pb-3 pt-1 overflow-x-auto">
        {chartData.map((d, i) => {
          const isSession = i === sessionIndex;
          const deg = directions[i];
          const compass = deg != null ? getDirectionText(deg) : null;
          const arrowDeg = deg != null ? (deg + 180) % 360 : null;

          return (
            <div key={d.time} className="flex-1 flex flex-col items-center gap-1">
              {/* Period */}
              <span
                className={`text-[10px] tabular-nums font-medium ${
                  isSession ? "text-white/60" : "text-white/20"
                }`}
              >
                {d.period != null ? `${Math.round(d.period)}s` : ""}
              </span>

              {/* Direction arrow */}
              <div
                className={`flex items-center justify-center w-5 h-5 rounded-full
                  ${isSession ? "bg-primary/15" : ""}`}
              >
                {arrowDeg != null ? (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    className={isSession ? "text-primary" : "text-white/25"}
                    style={{ transform: `rotate(${arrowDeg}deg)` }}
                  >
                    <path d="M5 1L7.5 8H2.5L5 1Z" fill="currentColor" />
                  </svg>
                ) : (
                  <span className="text-white/10 text-[9px]">-</span>
                )}
              </div>

              {/* Direction label */}
              {compass && (
                <span className={`text-[9px] font-medium ${isSession ? "text-primary/70" : "text-white/20"}`}>
                  {compass}
                </span>
              )}

              {/* Time */}
              <span
                className={`text-[10px] font-medium tabular-nums ${
                  isSession ? "text-white/50" : "text-white/20"
                }`}
              >
                {formatHour(d.time)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
