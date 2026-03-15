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
import { celsiusToFahrenheit } from "@/lib/api/open-meteo";

interface TemperatureChartProps {
  data: HourlyForecast[];
  sessionIndex: number;
}

const cAir = "oklch(0.769 0.188 70.08)";  // warm orange
const cWater = "oklch(0.696 0.17 162.48)"; // cool teal

export function TemperatureChart({ data, sessionIndex }: TemperatureChartProps) {
  const chartData = data.map((h) => ({
    time: h.time,
    Air: celsiusToFahrenheit(h.airTemp) ?? undefined,
    Water: celsiusToFahrenheit(h.seaSurfaceTemp) ?? undefined,
  }));

  const sessionAir = chartData[sessionIndex]?.Air;
  const sessionWater = chartData[sessionIndex]?.Water;

  return (
    <ChartPanel
      title="TEMPERATURE"
      heroValue={sessionWater != null ? `${sessionWater.toFixed(0)}\u00B0` : "—"}
      heroUnit="water"
      heroSub={sessionAir != null ? `${sessionAir.toFixed(0)}\u00B0F air` : undefined}
      legends={[
        { label: "Water", color: cWater },
        { label: "Air", color: cAir },
      ]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradWater" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cWater} stopOpacity={0.2} />
              <stop offset="100%" stopColor={cWater} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradAir" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cAir} stopOpacity={0.1} />
              <stop offset="100%" stopColor={cAir} stopOpacity={0} />
            </linearGradient>
          </defs>
          <SharedXAxis />
          <SharedYAxis
            tickFormatter={(v) => `${v.toFixed(0)}\u00B0`}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <SessionMarker data={chartData} sessionIndex={sessionIndex} />
          <Area
            type="natural"
            dataKey="Water"
            stroke={cWater}
            fill="url(#gradWater)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: cWater, stroke: "none" }}
          />
          <Area
            type="natural"
            dataKey="Air"
            stroke={cAir}
            fill="url(#gradAir)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: cAir, stroke: "none" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
