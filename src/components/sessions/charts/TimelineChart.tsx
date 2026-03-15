"use client";

import { ReactNode } from "react";
import {
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { getDirectionText } from "@/lib/api/open-meteo";

const axisColor = "oklch(0.45 0 0)";
const sessionColor = "oklch(0.82 0.17 90)";

function formatHour(time: string) {
  const d = new Date(time);
  const h = d.getHours();
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h > 12 ? `${h - 12}p` : `${h}a`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="backdrop-blur-xl bg-black/70 border border-white/10 rounded-xl px-3.5 py-2.5 shadow-2xl">
      <p className="text-[11px] text-white/50 mb-1.5 font-medium tracking-wide uppercase">
        {formatHour(label)}
      </p>
      {payload.map((entry: { name: string; value: number; color: string; unit?: string }, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-white/60 text-xs">{entry.name}</span>
          <span className="text-white text-xs font-medium ml-auto tabular-nums">
            {typeof entry.value === "number" ? entry.value.toFixed(1) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
}

export function ChartPanel({
  title,
  heroValue,
  heroUnit,
  heroSub,
  legends,
  children,
}: {
  title: string;
  heroValue?: string;
  heroUnit?: string;
  heroSub?: string;
  legends?: LegendItem[];
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-[13px] font-medium text-white/40 tracking-wide">
              {title}
            </h3>
            {legends && legends.length > 0 && (
              <div className="flex items-center gap-3">
                {legends.map((l, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-[2px] rounded-full"
                      style={{
                        backgroundColor: l.color,
                        ...(l.dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${l.color} 0, ${l.color} 3px, transparent 3px, transparent 6px)`, backgroundColor: 'transparent' } : {}),
                      }}
                    />
                    <span className="text-[11px] text-white/30">{l.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {heroValue && (
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-semibold tracking-tight text-white">
                {heroValue}
              </span>
              {heroUnit && (
                <span className="text-sm text-white/40 font-medium">{heroUnit}</span>
              )}
            </div>
          )}
          {heroSub && (
            <p className="text-[11px] text-white/30 mt-0.5">{heroSub}</p>
          )}
        </div>
      </div>
      <div className="h-[180px] w-full -ml-2">
        {children}
      </div>
    </div>
  );
}

export { axisColor, sessionColor, formatHour, CustomTooltip, getDirectionText };

export function SessionMarker({
  data,
  sessionIndex,
}: {
  data: Record<string, unknown>[];
  sessionIndex: number;
}) {
  const sessionTime = data[sessionIndex]?.time as string | undefined;
  if (!sessionTime) return null;

  return (
    <ReferenceLine
      x={sessionTime}
      stroke={sessionColor}
      strokeWidth={1.5}
      strokeOpacity={0.6}
    />
  );
}

export function SharedXAxis() {
  return (
    <XAxis
      dataKey="time"
      tickFormatter={formatHour}
      tick={{ fill: axisColor, fontSize: 10, fontWeight: 500 }}
      axisLine={false}
      tickLine={false}
      dy={4}
    />
  );
}

export function SharedYAxis({
  tickFormatter,
  domain,
  yAxisId,
  orientation,
  hide,
}: {
  tickFormatter?: (v: number) => string;
  domain?: [number | string, number | string];
  yAxisId?: string;
  orientation?: "left" | "right";
  hide?: boolean;
}) {
  return (
    <YAxis
      yAxisId={yAxisId}
      orientation={orientation}
      tick={hide ? false : { fill: axisColor, fontSize: 10, fontWeight: 500 }}
      axisLine={false}
      tickLine={false}
      tickFormatter={tickFormatter}
      domain={domain}
      width={hide ? 0 : 38}
    />
  );
}
