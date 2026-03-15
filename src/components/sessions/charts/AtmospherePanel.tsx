"use client";

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { HourlyForecast } from "@/types";
import { hpaToInHg, metersToMiles, mmToInches } from "@/lib/api/open-meteo";

interface AtmospherePanelProps {
  data: HourlyForecast[];
  sessionIndex: number;
}

const sessionColor = "oklch(0.82 0.17 90)";

function Sparkline({
  data,
  dataKey,
  label,
  value,
  unit,
  sessionIndex,
  color,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  label: string;
  value: string;
  unit: string;
  sessionIndex: number;
  color: string;
}) {
  const sessionTime = data[sessionIndex]?.time as string | undefined;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-white/30 font-medium tracking-wide">{label}</span>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-semibold text-white tabular-nums">{value}</span>
          <span className="text-[10px] text-white/30">{unit}</span>
        </div>
      </div>
      <div className="h-[40px] -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {sessionTime && (
              <ReferenceLine
                x={sessionTime}
                stroke={sessionColor}
                strokeWidth={1}
                strokeOpacity={0.4}
              />
            )}
            <Area
              type="natural"
              dataKey={dataKey}
              stroke={color}
              fill={`url(#grad-${dataKey})`}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function AtmospherePanel({ data, sessionIndex }: AtmospherePanelProps) {
  const chartData = data.map((h) => ({
    time: h.time,
    Humidity: h.humidity ?? undefined,
    Precipitation: mmToInches(h.precipitation) ?? undefined,
    Pressure: hpaToInHg(h.pressureMsl) ?? undefined,
    Cloud: h.cloudCover ?? undefined,
    Visibility: metersToMiles(h.visibility) ?? undefined,
  }));

  const s = chartData[sessionIndex];

  const fmt = (v: unknown, decimals: number) =>
    v != null && typeof v === "number" ? v.toFixed(decimals) : "—";

  return (
    <div>
      <h3 className="text-[13px] font-medium text-white/40 tracking-wide mb-3">
        ATMOSPHERE
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Sparkline
          data={chartData} dataKey="Humidity" label="Humidity"
          value={fmt(s?.Humidity, 0)} unit="%"
          sessionIndex={sessionIndex} color="oklch(0.696 0.17 162.48)"
        />
        <Sparkline
          data={chartData} dataKey="Precipitation" label="Precip"
          value={fmt(s?.Precipitation, 2)} unit="in"
          sessionIndex={sessionIndex} color="oklch(0.627 0.265 303.9)"
        />
        <Sparkline
          data={chartData} dataKey="Pressure" label="Pressure"
          value={fmt(s?.Pressure, 2)} unit="inHg"
          sessionIndex={sessionIndex} color="oklch(0.645 0.246 16.439)"
        />
        <Sparkline
          data={chartData} dataKey="Cloud" label="Cloud cover"
          value={fmt(s?.Cloud, 0)} unit="%"
          sessionIndex={sessionIndex} color="oklch(0.769 0.188 70.08)"
        />
        <Sparkline
          data={chartData} dataKey="Visibility" label="Visibility"
          value={fmt(s?.Visibility, 1)} unit="mi"
          sessionIndex={sessionIndex} color="oklch(0.82 0.17 90)"
        />
      </div>
    </div>
  );
}
