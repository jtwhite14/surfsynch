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
} from "recharts";
import { formatHour, sessionColor, axisColor } from "./TimelineChart";
import { HourlyForecast } from "@/types";
import { kmhToMph, getDirectionText } from "@/lib/api/open-meteo";

interface WindChartProps {
  data: HourlyForecast[];
  sessionIndex: number;
}

const barColor = "oklch(0.65 0.06 230)";
const barSessionColor = "oklch(0.55 0.10 230)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WindTooltip({ active, payload }: any) {
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
        <span className="text-white/60 text-xs">Speed</span>
        <span className="text-white text-xs font-medium ml-auto tabular-nums">
          {d.speed != null ? `${d.speed.toFixed(0)} mph` : "—"}
        </span>
      </div>
      {d.gust != null && (
        <div className="flex items-center gap-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-white/30" />
          <span className="text-white/60 text-xs">Gust</span>
          <span className="text-white text-xs font-medium ml-auto tabular-nums">
            {d.gust.toFixed(0)} mph
          </span>
        </div>
      )}
    </div>
  );
}

export function WindChart({ data, sessionIndex }: WindChartProps) {
  const chartData = data.map((h) => ({
    time: h.time,
    speed: kmhToMph(h.windSpeed) ?? 0,
    gust: kmhToMph(h.windGust) ?? undefined,
    direction: h.windDirection,
  }));

  const sessionSpeed = chartData[sessionIndex]?.speed ?? 0;
  const sessionGust = chartData[sessionIndex]?.gust;
  const sessionDir = chartData[sessionIndex]?.direction;
  const dirText = sessionDir != null ? getDirectionText(sessionDir) : null;

  const sessionTime = data[sessionIndex]?.time;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      {/* Header */}
      <div className="p-5 pb-3">
        <span className="text-[13px] font-medium text-white/40 tracking-wide">
          WIND
        </span>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-2xl font-semibold tracking-tight text-white">
            {sessionSpeed > 0 ? Math.round(sessionSpeed) : "—"}
          </span>
          <span className="text-sm text-white/40 font-medium">mph</span>
          {dirText && (
            <span className="text-lg font-semibold text-white ml-1">
              {dirText}
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/30 mt-0.5">
          {sessionGust != null ? `${Math.round(sessionGust)} mph gust` : ""}
        </p>
      </div>

      {/* Bar chart */}
      <div className="h-[140px] w-full px-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="15%">
            <XAxis dataKey="time" hide />
            <YAxis hide domain={[0, "auto"]} />
            <Tooltip content={<WindTooltip />} cursor={false} />
            {sessionTime && (
              <ReferenceLine
                x={sessionTime}
                stroke={sessionColor}
                strokeWidth={1.5}
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
            )}
            <Bar dataKey="speed" radius={[3, 3, 0, 0]} isAnimationActive={false}>
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

      {/* Direction arrows + speed/gust labels + time axis */}
      <div className="flex px-4 pb-4 pt-1">
        {chartData.map((d, i) => {
          const isSession = i === sessionIndex;
          return (
            <div key={d.time} className="flex-1 flex flex-col items-center gap-1">
              {/* Direction arrow */}
              <div
                className={`flex items-center justify-center w-5 h-5 rounded-full
                  ${isSession ? "bg-white/[0.08]" : ""}`}
              >
                {d.direction != null ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 10 10"
                    className={isSession ? "text-white/70" : "text-white/30"}
                    style={{ transform: `rotate(${d.direction}deg)` }}
                  >
                    <path d="M5 1L7.5 8H2.5L5 1Z" fill="currentColor" />
                  </svg>
                ) : (
                  <span className="text-white/10 text-[9px]">-</span>
                )}
              </div>

              {/* Speed */}
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  isSession ? "text-white" : "text-white/50"
                }`}
              >
                {d.speed > 0 ? Math.round(d.speed) : "—"}
              </span>

              {/* Gust */}
              <span className="text-[10px] tabular-nums text-white/25">
                {d.gust != null && d.gust > 0 ? Math.round(d.gust) : ""}
              </span>

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
