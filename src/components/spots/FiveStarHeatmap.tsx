"use client";

import { useEffect, useState, useCallback } from "react";

interface DayScore {
  date: string;
  score: number;
}

interface FiveStarHeatmapProps {
  spotId: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getScoreColor(score: number): string {
  if (score < 50) return "var(--heatmap-empty)";
  if (score < 65) return "var(--heatmap-med-low)";
  if (score < 78) return "var(--heatmap-med)";
  if (score < 88) return "var(--heatmap-med-high)";
  return "var(--heatmap-high)";
}

function getScoreLabel(score: number): string {
  if (score <= 0) return "No data";
  if (score < 50) return "Very different";
  if (score < 65) return "Somewhat similar";
  if (score < 78) return "Similar";
  if (score < 88) return "Very similar";
  return "Near identical";
}

export function FiveStarHeatmap({ spotId }: FiveStarHeatmapProps) {
  const [scores, setScores] = useState<DayScore[] | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionDates, setSessionDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    date: string;
    score: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/spots/${spotId}/five-star-frequency`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (!cancelled) {
          if (data.sessionCount === 0) {
            setScores(null);
          } else {
            setScores(data.scores);
          }
          setSessionCount(data.sessionCount);
          setSessionDates(new Set(data.sessionDates || []));
        }
      } catch {
        if (!cancelled) setError("Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [spotId]);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent, date: string, score: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const parentRect = e.currentTarget
        .closest(".heatmap-container")
        ?.getBoundingClientRect();
      if (parentRect) {
        const tooltipWidth = 180;
        const rawX = rect.left - parentRect.left + rect.width / 2;
        const x = Math.max(
          tooltipWidth / 2,
          Math.min(rawX, parentRect.width - tooltipWidth / 2)
        );
        setTooltip({
          x,
          y: rect.top - parentRect.top - 4,
          date,
          score,
        });
      }
    },
    []
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (loading) {
    return (
      <div className="rounded-lg border bg-background/60 p-3">
        <p className="text-sm font-semibold mb-2">5-Star Conditions</p>
        <div className="h-[120px] flex items-center justify-center">
          <div className="animate-pulse text-xs text-muted-foreground">
            Loading 12 months of data...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border bg-background/60 p-3">
        <p className="text-sm font-semibold mb-2">5-Star Conditions</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  // No 5-star sessions — don't render at all
  if (!scores || sessionCount === 0) {
    return null;
  }

  // Build a map of date -> score
  const scoreMap = new Map<string, number>();
  for (const s of scores) {
    scoreMap.set(s.date, s.score);
  }

  // Build the 52-week grid (ending today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endSunday = new Date(today);
  endSunday.setDate(endSunday.getDate() - endSunday.getDay());

  const startSunday = new Date(endSunday);
  startSunday.setDate(startSunday.getDate() - 52 * 7);

  const weeks: { date: Date; dateStr: string; score: number }[][] = [];
  const current = new Date(startSunday);

  while (current <= today) {
    const weekStart = new Date(current);
    const week: { date: Date; dateStr: string; score: number }[] = [];

    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + d);
      const dateStr = day.toISOString().split("T")[0];
      week.push({
        date: new Date(day),
        dateStr,
        score: day <= today ? (scoreMap.get(dateStr) ?? -1) : -1,
      });
      current.setDate(current.getDate() + 1);
    }

    weeks.push(week);
  }

  // Month labels and positions
  const monthPositions: { label: string; col: number }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const firstDay = weeks[w][0];
    const month = firstDay.date.getMonth();
    if (month !== lastMonth) {
      monthPositions.push({ label: MONTH_LABELS[month], col: w });
      lastMonth = month;
    }
  }

  const cellSize = 11;
  const cellGap = 2;
  const step = cellSize + cellGap;
  const labelWidth = 28;
  const headerHeight = 16;
  const svgWidth = labelWidth + weeks.length * step;
  const svgHeight = headerHeight + 7 * step;

  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="text-sm font-semibold mb-1">5-Star Conditions</p>
      <p className="text-xs text-muted-foreground mb-3">
        When conditions matched your {sessionCount} five-star session{sessionCount !== 1 ? "s" : ""} in the last 12 months
      </p>
      <div className="heatmap-container relative overflow-x-auto overflow-y-visible">
        <style>{`
          :root {
            --heatmap-empty: oklch(0.25 0 0);
            --heatmap-low: oklch(0.35 0.08 145);
            --heatmap-med-low: oklch(0.42 0.12 145);
            --heatmap-med: oklch(0.52 0.16 145);
            --heatmap-med-high: oklch(0.62 0.19 145);
            --heatmap-high: oklch(0.72 0.22 145);
          }
          @media (prefers-color-scheme: light) {
            :root {
              --heatmap-empty: oklch(0.92 0 0);
              --heatmap-low: oklch(0.85 0.06 145);
              --heatmap-med-low: oklch(0.75 0.1 145);
              --heatmap-med: oklch(0.65 0.14 145);
              --heatmap-med-high: oklch(0.55 0.17 145);
              --heatmap-high: oklch(0.45 0.2 145);
            }
          }
        `}</style>
        <svg width={svgWidth} height={svgHeight} className="block">
          {/* Month labels */}
          {monthPositions.map(({ label, col }, i) => (
            <text
              key={i}
              x={labelWidth + col * step}
              y={10}
              className="fill-muted-foreground"
              fontSize={9}
              fontFamily="system-ui"
            >
              {label}
            </text>
          ))}

          {/* Day labels (Mon, Wed, Fri) */}
          {[1, 3, 5].map((d) => (
            <text
              key={d}
              x={0}
              y={headerHeight + d * step + cellSize - 2}
              className="fill-muted-foreground"
              fontSize={9}
              fontFamily="system-ui"
            >
              {DAY_LABELS[d]}
            </text>
          ))}

          {/* Cells */}
          {weeks.map((week, w) =>
            week.map((day, d) => {
              if (day.score === -1 && day.date > today) return null;
              const x = labelWidth + w * step;
              const y = headerHeight + d * step;
              const isFiveStarDay = sessionDates.has(day.dateStr);
              return (
                <g key={`${w}-${d}`}>
                  <rect
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    rx={2}
                    fill={
                      day.score >= 0
                        ? getScoreColor(day.score)
                        : "var(--heatmap-empty)"
                    }
                    stroke={
                      isFiveStarDay ? "oklch(0.848 0.173 86.06)" : "none"
                    }
                    strokeWidth={isFiveStarDay ? 2 : 0}
                    className="cursor-pointer transition-opacity hover:opacity-80"
                    onMouseEnter={(e) =>
                      handleMouseEnter(e, day.dateStr, day.score)
                    }
                    onMouseLeave={handleMouseLeave}
                  />
                </g>
              );
            })
          )}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 backdrop-blur-xl bg-black/70 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-2xl whitespace-nowrap"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: "translate(-50%, -100%)",
            }}
          >
            <p className="text-[10px] text-white/50 font-medium">
              {new Date(tooltip.date + "T12:00:00").toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" }
              )}
            </p>
            <p className="text-xs text-white font-medium">
              {tooltip.score >= 0
                ? `${tooltip.score}% match`
                : "No data"}{" "}
              <span className="text-white/50">
                — {getScoreLabel(tooltip.score)}
              </span>
            </p>
            {sessionDates.has(tooltip.date) && (
              <p className="text-[10px] text-yellow-400 font-medium mt-0.5">
                ★ 5-star session
              </p>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[
          "var(--heatmap-empty)",
          "var(--heatmap-low)",
          "var(--heatmap-med-low)",
          "var(--heatmap-med)",
          "var(--heatmap-med-high)",
          "var(--heatmap-high)",
        ].map((color, i) => (
          <span
            key={i}
            className="inline-block w-[10px] h-[10px] rounded-[2px]"
            style={{ backgroundColor: color }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
