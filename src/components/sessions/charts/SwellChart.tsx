"use client";

import {
  ComposedChart,
  Area,
  Line,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import {
  ChartPanel,
  SharedXAxis,
  SharedYAxis,
  SessionMarker,
  CustomTooltip,
  axisColor,
  getDirectionText,
} from "./TimelineChart";
import { DirectionStrip } from "./DirectionStrip";
import { HourlyForecast } from "@/types";
import { metersToFeet } from "@/lib/api/open-meteo";

interface SwellChartProps {
  data: HourlyForecast[];
  sessionIndex: number;
}

const c1 = "oklch(0.82 0.17 90)";     // yellow — height
const c2 = "oklch(0.769 0.188 70.08)"; // orange — period

export function SwellChart({ data, sessionIndex }: SwellChartProps) {
  const chartData = data.map((h) => ({
    time: h.time,
    Height: metersToFeet(h.primarySwellHeight) ?? undefined,
    Period: h.primarySwellPeriod ?? undefined,
  }));

  const directions = data.map((h) => h.primarySwellDirection);

  const sessionHeight = chartData[sessionIndex]?.Height;
  const sessionPeriod = chartData[sessionIndex]?.Period;
  const sessionDir = directions[sessionIndex];
  const dirText = sessionDir != null ? getDirectionText(sessionDir) : null;

  // Build a surfer-friendly hero subtitle
  const heroSub = [
    sessionPeriod != null ? `${sessionPeriod.toFixed(0)}s period` : null,
    dirText ? `from ${dirText}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <ChartPanel
        title="PRIMARY SWELL"
        heroValue={sessionHeight != null ? sessionHeight.toFixed(1) : "—"}
        heroUnit="ft"
        heroSub={heroSub || undefined}
        legends={[
          { label: "Height", color: c1 },
          { label: "Period", color: c2 },
        ]}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradSwell" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c1} stopOpacity={0.2} />
                <stop offset="100%" stopColor={c1} stopOpacity={0} />
              </linearGradient>
            </defs>
            <SharedXAxis />
            <SharedYAxis
              yAxisId="left"
              tickFormatter={(v) => `${v.toFixed(1)}`}
              domain={[0, "auto"]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: axisColor, fontSize: 10, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}s`}
              domain={[0, "auto"]}
              width={32}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <SessionMarker data={chartData} sessionIndex={sessionIndex} />
            <Area
              type="natural"
              dataKey="Height"
              yAxisId="left"
              stroke={c1}
              fill="url(#gradSwell)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: c1, stroke: "none" }}
            />
            <Line
              type="natural"
              dataKey="Period"
              yAxisId="right"
              stroke={c2}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: c2, stroke: "none" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartPanel>
      <DirectionStrip directions={directions} sessionIndex={sessionIndex} label="Swell direction" />
    </div>
  );
}
