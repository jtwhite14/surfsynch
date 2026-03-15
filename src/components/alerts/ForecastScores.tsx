"use client";

import { useState, useEffect } from "react";
import { MatchDetails, MarineConditions, TimeWindow } from "@/types";
import { formatWaveHeight, formatWavePeriod, getDirectionText, formatWindSpeed } from "@/lib/api/open-meteo";

interface WindowScore {
  window: TimeWindow;
  bestScore: number;
  matchScore: number;
  forecastConfidence: number;
  ratingBoost: number;
  matchedSessionRating: number | null;
  matchDetails: MatchDetails | null;
  forecastSnapshot: MarineConditions | null;
  blocked: "exposure" | "coverage" | null;
}

interface DayScore {
  date: string;
  label: string;
  windows: WindowScore[];
}

interface ForecastScoresData {
  days: DayScore[];
  sessionCount: number;
  seasonalSessionCount: number;
  ignoredCount: number;
  threshold: number;
  message?: string;
}

interface ForecastScoresProps {
  spotId: string;
}

export function ForecastScores({ spotId }: ForecastScoresProps) {
  const [data, setData] = useState<ForecastScoresData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/spots/${spotId}/forecast-scores`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(d => setData(d))
      .catch(err => { if (err.name !== "AbortError") console.error(err); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [spotId]);

  if (loading) return null;
  if (!data || data.days.length === 0) return null;

  const threshold = data.threshold;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Forecast Scores</h3>
        <span className="text-[10px] text-muted-foreground">
          {data.seasonalSessionCount} session{data.seasonalSessionCount !== 1 ? "s" : ""} matched
          {data.ignoredCount > 0 && `, ${data.ignoredCount} ignored`}
        </span>
      </div>

      <div className="rounded-lg border bg-background/60 overflow-hidden">
        {data.days.map((day) => {
          const bestWindow = day.windows.reduce((best, w) =>
            w.bestScore > best.bestScore ? w : best, day.windows[0]);
          const isExpanded = expanded === day.date;
          const bestScore = bestWindow.bestScore;

          return (
            <div key={day.date} className="border-b last:border-b-0">
              <button
                onClick={() => setExpanded(isExpanded ? null : day.date)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors text-left"
              >
                <span className="text-xs font-medium w-16 shrink-0">{day.label}</span>
                <div className="flex-1 flex items-center gap-1.5">
                  {day.windows.map((w) => (
                    <WindowPill key={w.window} window={w} threshold={threshold} />
                  ))}
                </div>
                <ScoreBadge score={bestScore} threshold={threshold} blocked={bestWindow.blocked} />
              </button>

              {isExpanded && (
                <div className="px-3 pb-2.5 space-y-2">
                  {day.windows.map((w) => (
                    <WindowDetail key={w.window} window={w} threshold={threshold} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground mt-1.5">
        Alerts fire at {threshold}+. Tap a day to see the breakdown.
      </p>
    </div>
  );
}

function WindowPill({ window: w, threshold }: { window: WindowScore; threshold: number }) {
  const label = w.window === "dawn" ? "AM" : w.window === "midday" ? "Mid" : "PM";

  if (w.blocked === "exposure") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground line-through">
        {label}
      </span>
    );
  }

  const score = Math.round(w.bestScore);
  const color = score >= threshold
    ? "bg-primary/15 text-primary"
    : score >= threshold * 0.85
      ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
      : "bg-muted/50 text-muted-foreground";

  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}>
      {label} {score}
    </span>
  );
}

function ScoreBadge({ score, threshold, blocked }: { score: number; threshold: number; blocked: string | null }) {
  if (blocked === "exposure") {
    return <span className="text-[10px] text-muted-foreground">blocked</span>;
  }

  const rounded = Math.round(score);
  const color = rounded >= threshold
    ? "text-primary"
    : rounded >= threshold * 0.85
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-muted-foreground";

  return (
    <span className={`text-xs font-semibold tabular-nums ${color}`}>
      {rounded}
    </span>
  );
}

function WindowDetail({ window: w, threshold }: { window: WindowScore; threshold: number }) {
  const windowLabel = w.window === "dawn" ? "Morning" : w.window === "midday" ? "Midday" : "Afternoon";
  const score = Math.round(w.bestScore);

  if (w.blocked === "exposure") {
    return (
      <div className="rounded bg-muted/30 px-2.5 py-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{windowLabel}</span> — swell direction blocked by exposure settings
        </p>
      </div>
    );
  }

  if (w.blocked === "coverage") {
    return (
      <div className="rounded bg-muted/30 px-2.5 py-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{windowLabel}</span> — not enough condition data to compare (&lt;50% coverage)
        </p>
      </div>
    );
  }

  const details = w.matchDetails;
  const snapshot = w.forecastSnapshot;
  const gap = threshold - score;
  const aboveThreshold = score >= threshold;

  return (
    <div className="rounded bg-muted/30 px-2.5 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium">{windowLabel}</span>
        <div className="flex items-center gap-2">
          {w.matchedSessionRating && (
            <span className="text-[10px] text-muted-foreground">
              vs {"\u2605"}{w.matchedSessionRating} session
            </span>
          )}
          <span className={`text-xs font-semibold tabular-nums ${aboveThreshold ? "text-primary" : "text-muted-foreground"}`}>
            {score}/{threshold}
          </span>
        </div>
      </div>

      {/* Forecast conditions summary */}
      {snapshot && (
        <p className="text-[10px] text-muted-foreground mb-1.5">
          {buildConditionsText(snapshot)}
        </p>
      )}

      {/* Score breakdown */}
      {details && (
        <div className="space-y-0.5">
          <ScoreBar label="Swell ht" value={details.swellHeight} weight="high" />
          <ScoreBar label="Swell per" value={details.swellPeriod} weight="high" />
          <ScoreBar label="Swell dir" value={details.swellDirection} weight="high" />
          <ScoreBar label="Wind spd" value={details.windSpeed} weight="med" />
          <ScoreBar label="Wind dir" value={details.windDirection} weight="med" />
          <ScoreBar label="Tide" value={details.tideHeight} weight="low" />
          <ScoreBar label="Energy" value={details.waveEnergy} weight="high" />

          {/* Multipliers */}
          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-border/50">
            <span className="text-[10px] text-muted-foreground">
              Confidence: {(details.forecastConfidence * 100).toFixed(0)}%
            </span>
            <span className="text-[10px] text-muted-foreground">
              Rating boost: {(details.ratingBoost * 100).toFixed(0)}%
            </span>
            {!aboveThreshold && gap > 0 && (
              <span className="text-[10px] text-yellow-600 dark:text-yellow-400 ml-auto">
                {Math.round(gap)} pts below threshold
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value, weight }: { label: string; value: number | null; weight: "high" | "med" | "low" }) {
  if (value == null) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground/50 w-16 shrink-0">{label}</span>
        <span className="text-[10px] text-muted-foreground/50">—</span>
      </div>
    );
  }

  const pct = Math.round(value * 100);
  const color = pct >= 80
    ? "bg-primary/60"
    : pct >= 50
      ? "bg-yellow-500/60"
      : "bg-destructive/40";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">{pct}%</span>
    </div>
  );
}

function buildConditionsText(snapshot: MarineConditions): string {
  const parts: string[] = [];
  if (snapshot.primarySwellHeight != null) {
    parts.push(formatWaveHeight(snapshot.primarySwellHeight));
  }
  if (snapshot.primarySwellPeriod != null) {
    parts.push(`@ ${formatWavePeriod(snapshot.primarySwellPeriod)}`);
  }
  if (snapshot.primarySwellDirection != null) {
    parts.push(`from ${getDirectionText(snapshot.primarySwellDirection)}`);
  }
  if (snapshot.windSpeed != null) {
    const mph = snapshot.windSpeed * 0.621371;
    parts.push(mph < 8 ? "light winds" : `${formatWindSpeed(snapshot.windSpeed)} wind`);
  }
  return parts.join(" ");
}
