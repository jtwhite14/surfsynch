"use client";

import {
  ComposedChart,
  Area,
  Line,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  ChartPanel,
  SharedXAxis,
  SessionMarker,
} from "./TimelineChart";
import { HourlyForecast } from "@/types";
import { hpaToInHg, metersToMiles, mmToInches } from "@/lib/api/open-meteo";

interface AtmospherePanelProps {
  data: HourlyForecast[];
  sessionIndex: number;
}

const cHumidity = "oklch(0.696 0.17 162.48)";
const cPrecip = "oklch(0.627 0.265 303.9)";
const cPressure = "oklch(0.645 0.246 16.439)";
const cCloud = "oklch(0.769 0.188 70.08)";
const cVisibility = "oklch(0.82 0.17 90)";

const metrics = [
  { key: "Humidity", unit: "%", decimals: 0, color: cHumidity },
  { key: "Precip", unit: "in", decimals: 2, color: cPrecip },
  { key: "Pressure", unit: "inHg", decimals: 2, color: cPressure },
  { key: "Cloud", unit: "%", decimals: 0, color: cCloud },
  { key: "Visibility", unit: "mi", decimals: 1, color: cVisibility },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AtmosphereTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const formatHour = (time: string) => {
    const d = new Date(time);
    const h = d.getHours();
    if (h === 0) return "12a";
    if (h === 12) return "12p";
    return h > 12 ? `${h - 12}p` : `${h}a`;
  };

  // The payload items contain the normalized row as payload[0].payload
  const row = payload[0]?.payload as Record<string, unknown> | undefined;

  return (
    <div className="backdrop-blur-xl bg-black/70 border border-white/10 rounded-xl px-3.5 py-2.5 shadow-2xl">
      <p className="text-[11px] text-white/50 mb-1.5 font-medium tracking-wide uppercase">
        {formatHour(label)}
      </p>
      {metrics.map((m) => {
        const val = row?.[`${m.key}_raw`];
        return (
          <div key={m.key} className="flex items-center gap-2 py-0.5">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: m.color }}
            />
            <span className="text-white/60 text-xs">{m.key}</span>
            <span className="text-white text-xs font-medium ml-auto tabular-nums">
              {typeof val === "number" ? val.toFixed(m.decimals) : "—"}
              <span className="text-white/40 ml-0.5">{m.unit}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AtmospherePanel({ data, sessionIndex }: AtmospherePanelProps) {
  const chartData = data.map((h) => ({
    time: h.time,
    Humidity: h.humidity ?? undefined,
    Precip: mmToInches(h.precipitation) ?? undefined,
    Pressure: hpaToInHg(h.pressureMsl) ?? undefined,
    Cloud: h.cloudCover ?? undefined,
    Visibility: metersToMiles(h.visibility) ?? undefined,
  }));

  // Normalize all values to 0–1 for overlay display
  const normalized = chartData.map((d) => {
    const out: Record<string, unknown> = { time: d.time };
    for (const m of metrics) {
      const raw = d[m.key as keyof typeof d];
      out[`${m.key}_raw`] = raw;
    }
    return out;
  });

  // Compute min/max per metric for normalization
  const ranges: Record<string, { min: number; max: number }> = {};
  for (const m of metrics) {
    const vals = chartData
      .map((d) => d[m.key as keyof typeof d])
      .filter((v): v is number => typeof v === "number");
    if (vals.length === 0) {
      ranges[m.key] = { min: 0, max: 1 };
    } else {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      // Add padding so flat lines don't sit at edges
      ranges[m.key] = { min, max: max === min ? max + 1 : max };
    }
  }

  // Normalize values to 0–1
  for (const row of normalized) {
    for (const m of metrics) {
      const raw = row[`${m.key}_raw`];
      if (typeof raw === "number") {
        const { min, max } = ranges[m.key];
        row[m.key] = (raw - min) / (max - min);
      }
    }
  }

  const s = chartData[sessionIndex];
  const fmt = (v: unknown, decimals: number) =>
    v != null && typeof v === "number" ? v.toFixed(decimals) : "—";

  // Build hero summary from session values
  const heroparts = [
    `${fmt(s?.Humidity, 0)}% hum`,
    `${fmt(s?.Cloud, 0)}% cloud`,
    `${fmt(s?.Pressure, 2)} inHg`,
  ];

  return (
    <ChartPanel
      title="ATMOSPHERE"
      heroValue={heroparts[0].split(" ")[0]}
      heroUnit="% humidity"
      heroSub={`${heroparts[1]} · ${heroparts[2]}`}
      legends={metrics.map((m) => ({ label: m.key, color: m.color }))}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={normalized}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <defs>
            {metrics.map((m) => (
              <linearGradient key={m.key} id={`grad-atm-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={m.color} stopOpacity={0.12} />
                <stop offset="100%" stopColor={m.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <SharedXAxis />
          <Tooltip content={<AtmosphereTooltip />} cursor={false} />
          <SessionMarker data={normalized} sessionIndex={sessionIndex} />
          {/* Humidity and Cloud as filled areas (percentage-based) */}
          <Area
            type="natural"
            dataKey="Humidity"
            stroke={cHumidity}
            fill={`url(#grad-atm-Humidity)`}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: cHumidity, stroke: "none" }}
            isAnimationActive={false}
          />
          <Area
            type="natural"
            dataKey="Cloud"
            stroke={cCloud}
            fill={`url(#grad-atm-Cloud)`}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: cCloud, stroke: "none" }}
            isAnimationActive={false}
          />
          {/* Pressure, Precip, Visibility as lines */}
          <Line
            type="natural"
            dataKey="Pressure"
            stroke={cPressure}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: cPressure, stroke: "none" }}
            isAnimationActive={false}
          />
          <Line
            type="natural"
            dataKey="Precip"
            stroke={cPrecip}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: cPrecip, stroke: "none" }}
            isAnimationActive={false}
          />
          <Line
            type="natural"
            dataKey="Visibility"
            stroke={cVisibility}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: cVisibility, stroke: "none" }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
