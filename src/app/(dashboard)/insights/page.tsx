"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Dna, Waves } from "lucide-react";
import { InsightCards } from "@/components/insights/InsightCards";
import { ConditionChart } from "@/components/insights/ConditionChart";

interface InsightData {
  totalSessions: number;
  insights: { text: string; type: string; confidence: number }[];
  conditionCorrelations: { variable: string; buckets: { label: string; avgRating: number; count: number }[] }[];
  timeOfDayStats: { window: string; avgRating: number; count: number }[];
  equipmentStats: { id: string; name: string; avgRating: number; sessionCount: number }[];
}

interface EmptyState {
  minSessionsRequired: number;
  totalSessions: number;
}

type ApiResponse = InsightData | EmptyState;

function isEmptyState(data: ApiResponse): data is EmptyState {
  return "minSessionsRequired" in data;
}

export default function InsightsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/insights", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-4 w-64 bg-muted rounded animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-40 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  if (isEmptyState(data)) {
    const remaining = data.minSessionsRequired - data.totalSessions;
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Waves className="size-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold mb-1">Not enough data yet</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Log {remaining} more session{remaining !== 1 ? "s" : ""} to unlock your Surf DNA
        </p>
        <Link
          href="/sessions/new"
          className="text-sm font-medium text-primary hover:underline"
        >
          Log a session
        </Link>
      </div>
    );
  }

  const { totalSessions, insights, conditionCorrelations, timeOfDayStats, equipmentStats } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Dna className="size-6 sm:size-7" />
          Your Surf DNA
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Patterns from your {totalSessions} session{totalSessions !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Insight Cards */}
      {insights && insights.length > 0 && (
        <section>
          <InsightCards insights={insights} />
        </section>
      )}

      {/* Condition Sweet Spots */}
      {conditionCorrelations && conditionCorrelations.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3">Condition Sweet Spots</h2>
          <div className="space-y-4 rounded-lg border bg-background/60 p-3">
            {conditionCorrelations.map((corr) => (
              <ConditionChart
                key={corr.variable}
                variable={corr.variable}
                buckets={corr.buckets}
              />
            ))}
          </div>
        </section>
      )}

      {/* Time of Day */}
      {timeOfDayStats && timeOfDayStats.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3">Time of Day</h2>
          <div className="rounded-lg border bg-background/60 p-3 space-y-1.5">
            {timeOfDayStats.map((tw) => {
              const pct = (tw.avgRating / 5) * 100;
              const color =
                tw.avgRating >= 4
                  ? "bg-primary/60"
                  : tw.avgRating >= 3
                    ? "bg-yellow-500/60"
                    : "bg-muted-foreground/30";
              return (
                <div key={tw.window} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0 capitalize">
                    {tw.window}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-16 text-right">
                    {"\u2605"}{tw.avgRating.toFixed(1)} ({tw.count})
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Equipment */}
      {equipmentStats && equipmentStats.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3">Equipment</h2>
          <div className="rounded-lg border bg-background/60 divide-y">
            {equipmentStats.map((eq) => (
              <div key={eq.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm">{eq.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {"\u2605"}{eq.avgRating.toFixed(1)} ({eq.sessionCount} session{eq.sessionCount !== 1 ? "s" : ""})
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
