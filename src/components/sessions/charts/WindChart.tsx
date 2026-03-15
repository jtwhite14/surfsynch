"use client";

import {
  AreaChart,
  Area,
  Line,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  ChartPanel,
  SharedXAxis,
  SharedYAxis,
  SessionMarker,
  CustomTooltip,
  getDirectionText,
} from "./TimelineChart";
import { DirectionStrip } from "./DirectionStrip";
import { HourlyForecast } from "@/types";
import { kmhToMph } from "@/lib/api/open-meteo";

interface WindChartProps {
  data: HourlyForecast[];
  sessionIndex: number;
}

const c1 = "oklch(0.696 0.17 162.48)"; // teal — speed
const c2 = "oklch(0.769 0.188 70.08)"; // orange — gust

export function WindChart({ data, sessionIndex }: WindChartProps) {
  const chartData = data.map((h) => ({
    time: h.time,
    Speed: kmhToMph(h.windSpeed) ?? undefined,
    Gust: kmhToMph(h.windGust) ?? undefined,
  }));

  const directions = data.map((h) => h.windDirection);

  const sessionSpeed = chartData[sessionIndex]?.Speed;
  const sessionGust = chartData[sessionIndex]?.Gust;
  const sessionDir = directions[sessionIndex];
  const dirText = sessionDir != null ? getDirectionText(sessionDir) : null;

  const heroSub = [
    sessionGust != null ? `Gusting ${sessionGust.toFixed(0)} mph` : null,
    dirText ? `from ${dirText}` : null,
  ]
    .filter(Boolean)
    .join(" \u00B7 ");

  return (
    <div>
      <ChartPanel
        title="WIND"
        heroValue={sessionSpeed != null ? sessionSpeed.toFixed(0) : "—"}
        heroUnit="mph"
        heroSub={heroSub || undefined}
        legends={[
          { label: "Speed", color: c1 },
          { label: "Gust", color: c2, dashed: true },
        ]}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradWS" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c1} stopOpacity={0.2} />
                <stop offset="100%" stopColor={c1} stopOpacity={0} />
              </linearGradient>
            </defs>
            <SharedXAxis />
            <SharedYAxis
              tickFormatter={(v) => `${v.toFixed(0)}`}
              domain={[0, "auto"]}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <SessionMarker data={chartData} sessionIndex={sessionIndex} />
            <Area
              type="natural"
              dataKey="Speed"
              stroke={c1}
              fill="url(#gradWS)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: c1, stroke: "none" }}
            />
            <Line
              type="natural"
              dataKey="Gust"
              stroke={c2}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 3, fill: c2, stroke: "none" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartPanel>
      <DirectionStrip directions={directions} sessionIndex={sessionIndex} label="Wind direction" />
    </div>
  );
}
