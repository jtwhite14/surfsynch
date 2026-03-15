"use client";

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  ChartPanel,
  SharedXAxis,
  SharedYAxis,
  SessionMarker,
  CustomTooltip,
} from "./TimelineChart";
import { HourlyForecast } from "@/types";
import { metersToFeet } from "@/lib/api/open-meteo";

interface WaveChartProps {
  data: HourlyForecast[];
  sessionIndex: number;
}

const c1 = "oklch(0.82 0.17 90)";   // yellow — sig wave
const c2 = "oklch(0.696 0.17 162.48)"; // teal — wind wave

export function WaveChart({ data, sessionIndex }: WaveChartProps) {
  const chartData = data.map((h) => ({
    time: h.time,
    "Sig. Wave": metersToFeet(h.waveHeight) ?? undefined,
    "Wind Wave": metersToFeet(h.windWaveHeight) ?? undefined,
  }));

  const sessionSig = chartData[sessionIndex]?.["Sig. Wave"];
  const sessionWind = chartData[sessionIndex]?.["Wind Wave"];

  return (
    <ChartPanel
      title="WAVE HEIGHT"
      heroValue={sessionSig != null ? sessionSig.toFixed(1) : "—"}
      heroUnit="ft"
      heroSub={sessionWind != null ? `Wind chop ${sessionWind.toFixed(1)} ft` : undefined}
      legends={[
        { label: "Significant", color: c1 },
        { label: "Wind wave", color: c2 },
      ]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradSig" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c1} stopOpacity={0.25} />
              <stop offset="100%" stopColor={c1} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradWind" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c2} stopOpacity={0.15} />
              <stop offset="100%" stopColor={c2} stopOpacity={0} />
            </linearGradient>
          </defs>
          <SharedXAxis />
          <SharedYAxis
            tickFormatter={(v) => `${v.toFixed(1)}`}
            domain={[0, "auto"]}
          />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <SessionMarker data={chartData} sessionIndex={sessionIndex} />
          <Area
            type="natural"
            dataKey="Sig. Wave"
            stroke={c1}
            fill="url(#gradSig)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: c1, stroke: "none" }}
          />
          <Area
            type="natural"
            dataKey="Wind Wave"
            stroke={c2}
            fill="url(#gradWind)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: c2, stroke: "none" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
