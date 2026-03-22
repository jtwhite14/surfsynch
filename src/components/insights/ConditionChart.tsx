"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Bucket {
  label: string;
  avgRating: number;
  count: number;
}

interface ConditionChartProps {
  variable: string;
  buckets: Bucket[];
}

function formatVariableName(variable: string): string {
  return variable
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function getBarColor(avgRating: number): string {
  if (avgRating >= 4) return "hsl(var(--primary))";
  if (avgRating >= 3) return "hsl(45 93% 47%)";
  return "hsl(var(--muted-foreground) / 0.4)";
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Bucket }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload;
  return (
    <div className="rounded border bg-popover px-2 py-1 text-xs shadow-sm">
      {bucket.label}: {"\u2605"}{bucket.avgRating.toFixed(1)} ({bucket.count} session{bucket.count !== 1 ? "s" : ""})
    </div>
  );
}

export function ConditionChart({ variable, buckets }: ConditionChartProps) {
  if (!buckets || buckets.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-1">
        {formatVariableName(variable)}
      </h4>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 5]}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            ticks={[0, 1, 2, 3, 4, 5]}
          />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <Bar dataKey="avgRating" radius={[3, 3, 0, 0]} maxBarSize={32}>
            {buckets.map((bucket, idx) => (
              <Cell key={idx} fill={getBarColor(bucket.avgRating)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
