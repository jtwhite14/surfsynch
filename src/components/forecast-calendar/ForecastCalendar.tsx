"use client";

import { useState, useEffect } from "react";
import { MatchDetails, MarineConditions, TimeWindow } from "@/types";
import {
  formatWaveHeight,
  formatWavePeriod,
  getDirectionText,
  formatWindSpeed,
} from "@/lib/api/open-meteo";

// ── API response types (match the route) ──

interface ApiCalendarWindow {
  window: TimeWindow;
  effectiveScore: number;
  matchScore: number;
  confidenceScore: number;
  matchedProfileName: string | null;
  matchedSessionRating: number | null;
  matchDetails: MatchDetails | null;
  forecastSnapshot: MarineConditions | null;
}

interface ApiCalendarSpot {
  spotId: string;
  spotName: string;
  windows: ApiCalendarWindow[];
  bestScore: number;
}

interface ApiCalendarDay {
  date: string;
  label: string;
  spots: ApiCalendarSpot[];
  bestScore: number;
}

interface ForecastCalendarData {
  days: ApiCalendarDay[];
  spotCount: number;
}

// ── Flattened window for display (best spot per window) ──

interface DisplayWindow {
  window: TimeWindow;
  bestScore: number;
  spotId: string;
  spotName: string;
  matchDetails: MatchDetails | null;
  forecastSnapshot: MarineConditions | null;
  matchedProfileName: string | null;
  matchedSessionRating: number | null;
}

interface DisplayDay {
  date: string;
  label: string;
  windows: Map<TimeWindow, DisplayWindow>;
}

interface ForecastCalendarProps {
  spots: { id: string; name: string }[];
  onSpotClick?: (spotId: string) => void;
}

const THRESHOLD = 70;

function flattenDays(apiDays: ApiCalendarDay[]): DisplayDay[] {
  return apiDays.map((day) => {
    const windowMap = new Map<TimeWindow, DisplayWindow>();

    for (const spot of day.spots) {
      for (const w of spot.windows) {
        const existing = windowMap.get(w.window);
        if (!existing || w.effectiveScore > existing.bestScore) {
          windowMap.set(w.window, {
            window: w.window,
            bestScore: w.effectiveScore,
            spotId: spot.spotId,
            spotName: spot.spotName,
            matchDetails: w.matchDetails,
            forecastSnapshot: w.forecastSnapshot,
            matchedProfileName: w.matchedProfileName,
            matchedSessionRating: w.matchedSessionRating,
          });
        }
      }
    }

    return { date: day.date, label: day.label, windows: windowMap };
  });
}

// ── Main Component ──

export function ForecastCalendar({ spots, onSpotClick }: ForecastCalendarProps) {
  const [data, setData] = useState<ForecastCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSpotId, setSelectedSpotId] = useState<string>("");
  const [expandedCell, setExpandedCell] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (selectedSpotId) params.set("spotId", selectedSpotId);
    const url = `/api/forecast-calendar${params.toString() ? `?${params}` : ""}`;

    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [selectedSpotId]);

  const days = data ? flattenDays(data.days) : [];

  return (
    <div className="rounded-lg border bg-background/90 backdrop-blur-sm shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-semibold">Forecast</h3>
        {spots.length > 1 && (
          <select
            value={selectedSpotId}
            onChange={(e) => {
              setSelectedSpotId(e.target.value);
              setExpandedCell(null);
            }}
            className="text-xs bg-transparent border-0 text-muted-foreground focus:outline-none cursor-pointer pr-4"
          >
            <option value="">All spots</option>
            {spots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="px-3 py-3 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-3 w-14 rounded bg-muted/60 animate-pulse" />
              <div className="h-3 w-8 rounded bg-muted/40 animate-pulse" />
              <div className="h-3 w-8 rounded bg-muted/40 animate-pulse" />
              <div className="h-3 w-8 rounded bg-muted/40 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && days.length === 0 && (
        <div className="px-3 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            No matching conditions in the next 7 days
          </p>
        </div>
      )}

      {/* Calendar grid */}
      {!loading && days.length > 0 && (
        <div>
          {/* Column headers */}
          <div className="flex items-center px-3 py-1.5 border-b bg-muted/20">
            <span className="text-[10px] font-medium text-muted-foreground w-16 shrink-0">
              Day
            </span>
            <div className="flex-1 flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground w-10 text-center">
                AM
              </span>
              <span className="text-[10px] font-medium text-muted-foreground w-10 text-center">
                Mid
              </span>
              <span className="text-[10px] font-medium text-muted-foreground w-10 text-center">
                PM
              </span>
            </div>
          </div>

          {/* Day rows */}
          {days.map((day) => {
            const dawn = day.windows.get("dawn") ?? null;
            const midday = day.windows.get("midday") ?? null;
            const afternoon = day.windows.get("afternoon") ?? null;

            return (
              <div key={day.date} className="border-b last:border-b-0">
                <div className="flex items-center px-3 py-1.5">
                  <span className="text-xs font-medium w-16 shrink-0">
                    {day.label}
                  </span>
                  <div className="flex-1 flex items-center gap-1.5">
                    <CalendarCell
                      window={dawn}
                      cellKey={`${day.date}-dawn`}
                      expandedCell={expandedCell}
                      onToggle={setExpandedCell}
                    />
                    <CalendarCell
                      window={midday}
                      cellKey={`${day.date}-midday`}
                      expandedCell={expandedCell}
                      onToggle={setExpandedCell}
                    />
                    <CalendarCell
                      window={afternoon}
                      cellKey={`${day.date}-afternoon`}
                      expandedCell={expandedCell}
                      onToggle={setExpandedCell}
                    />
                  </div>
                </div>

                {expandedCell === `${day.date}-dawn` && dawn && (
                  <CellDetail window={dawn} onSpotClick={onSpotClick} />
                )}
                {expandedCell === `${day.date}-midday` && midday && (
                  <CellDetail window={midday} onSpotClick={onSpotClick} />
                )}
                {expandedCell === `${day.date}-afternoon` && afternoon && (
                  <CellDetail window={afternoon} onSpotClick={onSpotClick} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Calendar Cell ──

function CalendarCell({
  window: w,
  cellKey,
  expandedCell,
  onToggle,
}: {
  window: DisplayWindow | null;
  cellKey: string;
  expandedCell: string | null;
  onToggle: (key: string | null) => void;
}) {
  if (!w || w.bestScore <= 0) {
    return (
      <span className="text-[10px] w-10 text-center rounded py-0.5 bg-muted/50 text-muted-foreground">
        —
      </span>
    );
  }

  const score = Math.round(w.bestScore);
  const isExpanded = expandedCell === cellKey;
  const color =
    score >= THRESHOLD
      ? "bg-primary/15 text-primary"
      : score >= THRESHOLD * 0.85
        ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
        : "bg-muted/50 text-muted-foreground";

  return (
    <button
      onClick={() => onToggle(isExpanded ? null : cellKey)}
      className={`text-[10px] font-medium w-10 text-center rounded py-0.5 transition-colors hover:opacity-80 ${color} ${isExpanded ? "ring-1 ring-primary/30" : ""}`}
    >
      {score}
    </button>
  );
}

// ── Cell Detail (expanded section) ──

function CellDetail({
  window: w,
  onSpotClick,
}: {
  window: DisplayWindow;
  onSpotClick?: (spotId: string) => void;
}) {
  const score = Math.round(w.bestScore);
  const aboveThreshold = score >= THRESHOLD;
  const windowLabel =
    w.window === "dawn" ? "Morning" : w.window === "midday" ? "Midday" : "Afternoon";
  const details = w.matchDetails;
  const snapshot = w.forecastSnapshot;

  return (
    <div className="px-3 pb-2.5">
      <div className="rounded bg-muted/30 px-2.5 py-2">
        {/* Header row */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">{windowLabel}</span>
            {onSpotClick ? (
              <button
                onClick={() => onSpotClick(w.spotId)}
                className="text-[10px] text-primary hover:underline"
              >
                {w.spotName}
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground">{w.spotName}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {w.matchedProfileName && (
              <span className="text-[10px] text-muted-foreground">
                {w.matchedProfileName}
              </span>
            )}
            {w.matchedSessionRating && (
              <span className="text-[10px] text-muted-foreground">
                {"\u2605"}{w.matchedSessionRating}
              </span>
            )}
            <span
              className={`text-xs font-semibold tabular-nums ${aboveThreshold ? "text-primary" : "text-muted-foreground"}`}
            >
              {score}/{THRESHOLD}
            </span>
          </div>
        </div>

        {/* Conditions summary */}
        {snapshot && (
          <p className="text-[10px] text-muted-foreground mb-1.5">
            {buildConditionsText(snapshot)}
          </p>
        )}

        {/* Score breakdown bars */}
        {details && (
          <div className="space-y-0.5">
            <ScoreBar label="Swell ht" value={details.swellHeight} />
            <ScoreBar label="Swell per" value={details.swellPeriod} />
            <ScoreBar label="Swell dir" value={details.swellDirection} />
            <ScoreBar label="Wind spd" value={details.windSpeed} />
            <ScoreBar label="Wind dir" value={details.windDirection} />
            <ScoreBar label="Tide" value={details.tideHeight} />
            <ScoreBar label="Energy" value={details.waveEnergy} />

            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-border/50">
              <span className="text-[10px] text-muted-foreground">
                Confidence: {(details.forecastConfidence * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] text-muted-foreground">
                Rating boost: {(details.ratingBoost * 100).toFixed(0)}%
              </span>
              {!aboveThreshold && THRESHOLD - score > 0 && (
                <span className="text-[10px] text-yellow-600 dark:text-yellow-400 ml-auto">
                  {Math.round(THRESHOLD - score)} pts below threshold
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Score Bar ──

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  if (value == null) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground/50 w-16 shrink-0">{label}</span>
        <span className="text-[10px] text-muted-foreground/50">—</span>
      </div>
    );
  }

  const pct = Math.round(value * 100);
  const color =
    pct >= 80
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
      <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">
        {pct}%
      </span>
    </div>
  );
}

// ── Conditions text builder ──

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
