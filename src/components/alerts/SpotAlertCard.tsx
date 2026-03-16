"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { X, ChevronRight, TrendingUp } from "lucide-react";
import { SpotAlertResponse, MarineConditions } from "@/types";
import { formatWaveHeight, formatWavePeriod, getDirectionText, formatWindSpeed } from "@/lib/api/open-meteo";
import { formatDate } from "@/lib/utils/date";

interface SpotAlertCardProps {
  spotId: string;
  sessionCount: number;
  /** Pre-fetched alerts. If provided, skips the fetch. */
  alerts?: SpotAlertResponse[];
}

interface DismissedEntry { score: number; at: number }

export function SpotAlertCard({ spotId, sessionCount, alerts: prefetchedAlerts }: SpotAlertCardProps) {
  const [alerts, setAlerts] = useState<SpotAlertResponse[]>(prefetchedAlerts ?? []);
  const [loading, setLoading] = useState(!prefetchedAlerts);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedMap, setDismissedMap] = useState<Record<string, DismissedEntry>>({});

  // Load dismissed alerts from localStorage once
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`wavebook:dismissed-alerts:${spotId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, DismissedEntry>;
        const now = Date.now();
        const valid: Record<string, DismissedEntry> = {};
        for (const [key, val] of Object.entries(parsed)) {
          if (now - val.at < 7 * 24 * 60 * 60 * 1000) {
            valid[key] = val;
          }
        }
        setDismissedMap(valid);
      }
    } catch { /* localStorage unavailable */ }
  }, [spotId]);

  // Fetch alerts if not pre-fetched
  useEffect(() => {
    if (prefetchedAlerts) {
      setAlerts(prefetchedAlerts);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/spots/${spotId}/alerts`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : { alerts: [] })
      .then(data => setAlerts(data.alerts || []))
      .catch(err => { if (err.name !== 'AbortError') console.error("Error fetching alerts:", err); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [spotId, prefetchedAlerts]);

  const handleDismiss = useCallback((alert: SpotAlertResponse) => {
    const key = `${alert.forecastHour}:${alert.timeWindow}`;

    setDismissedMap(prev => {
      const next = { ...prev, [key]: { score: alert.effectiveScore, at: Date.now() } };
      try {
        localStorage.setItem(`wavebook:dismissed-alerts:${spotId}`, JSON.stringify(next));
      } catch { /* quota exceeded */ }
      return next;
    });

    // Adjust active index if needed
    setActiveIndex(prev => Math.max(0, prev - 1));

    // Tell server (fire-and-forget)
    fetch(`/api/spots/${spotId}/alerts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId: alert.id, status: "dismissed" }),
    }).catch(() => {});
  }, [spotId]);

  // Filter dismissed alerts from state (no localStorage reads during render)
  const visibleAlerts = alerts.filter(alert => {
    const key = `${alert.forecastHour}:${alert.timeWindow}`;
    const entry = dismissedMap[key];
    if (!entry) return true;
    // Re-show if score rose significantly
    return alert.effectiveScore - entry.score >= 7;
  });

  if (loading || visibleAlerts.length === 0) {
    if (!loading && sessionCount > 0 && sessionCount < 3) {
      return (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            Log {3 - sessionCount} more session{3 - sessionCount !== 1 ? 's' : ''} here and alerts will get smarter.
            Currently matching against {sessionCount} session{sessionCount !== 1 ? 's' : ''}.
          </p>
        </div>
      );
    }
    return null;
  }

  const safeIndex = Math.min(activeIndex, visibleAlerts.length - 1);
  const activeAlert = visibleAlerts[safeIndex];
  if (!activeAlert) return null;

  const forecastDate = new Date(activeAlert.forecastHour);
  const isGolden = activeAlert.effectiveScore >= 80;
  const dayLabel = getDayLabel(forecastDate);
  const timeLabel = getTimeLabel(activeAlert.timeWindow);

  const snapshot = activeAlert.forecastSnapshot as MarineConditions;
  const conditionsText = buildConditionsText(snapshot);

  const hasSession = !!activeAlert.matchedSession;
  const hasProfile = !!activeAlert.matchedProfile;
  const sessionDate = hasSession ? new Date(activeAlert.matchedSession!.date) : null;
  const monthsAgo = sessionDate ? Math.floor((Date.now() - sessionDate.getTime()) / (1000 * 60 * 60 * 24 * 30)) : Infinity;
  const isRecent = monthsAgo <= 6;
  const isHighRated = hasSession && activeAlert.matchedSession!.rating >= 4;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg border px-3 py-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 ${
        isGolden
          ? 'border-primary/40 bg-primary/5'
          : 'border-primary/25 bg-primary/[0.03]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TrendingUp className="size-3.5 text-primary shrink-0" />
          <span className="text-xs font-medium text-primary">
            {isGolden ? "Everything is aligning" : "Looks promising"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ConfidenceRing score={activeAlert.effectiveScore} size={24} />
          <button
            onClick={() => handleDismiss(activeAlert)}
            className="rounded-md p-1 hover:bg-accent transition-colors"
            aria-label={`Dismiss alert for ${dayLabel}`}
          >
            <X className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <p className="text-sm mt-1.5 leading-snug">
        <span className="font-medium">{dayLabel} {timeLabel}</span>
        {hasProfile ? (
          <span>
            {" "}matches your <span className="text-primary font-medium">{activeAlert.matchedProfile!.name}</span> profile
          </span>
        ) : isHighRated && isRecent && hasSession ? (
          <span>
            {" "}looks like your{" "}
            <Link
              href={`/sessions/${activeAlert.matchedSession!.id}`}
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              {ratingStars(activeAlert.matchedSession!.rating)} session on {formatDate(sessionDate!)}
              <ChevronRight className="size-3" />
            </Link>
          </span>
        ) : isHighRated && hasSession ? (
          <span>
            {" "}is shaping up well — similar to conditions you rated{" "}
            <span className="text-primary">{ratingStars(activeAlert.matchedSession!.rating)}</span>
          </span>
        ) : (
          <span> looks surfable</span>
        )}
      </p>

      {conditionsText && (
        <p className="text-xs text-muted-foreground mt-1">{conditionsText}</p>
      )}

      {visibleAlerts.length > 1 && (
        <div className="flex items-center gap-1.5 mt-2">
          {visibleAlerts.map((alert, i) => {
            const date = new Date(alert.forecastHour);
            const label = getDayLabel(date);
            const isActive = i === safeIndex;
            return (
              <button
                key={alert.id}
                onClick={() => setActiveIndex(i)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {label} {Math.round(alert.effectiveScore)}%
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfidenceRing({ score, size }: { score: number; size: number }) {
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={`${Math.round(score)} percent match confidence`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-muted/50"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-[stroke-dashoffset] duration-600 ease-in-out"
        />
      </svg>
      <span className="absolute text-[7px] font-bold text-primary" aria-hidden="true">
        {Math.round(score)}
      </span>
    </div>
  );
}

function ratingStars(rating: number): string {
  return "\u2605".repeat(rating);
}

function getDayLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function getTimeLabel(window: string): string {
  switch (window) {
    case 'dawn': return 'morning';
    case 'midday': return 'midday';
    case 'afternoon': return 'afternoon';
    default: return '';
  }
}

function buildConditionsText(snapshot: MarineConditions | null): string {
  if (!snapshot) return '';
  const parts: string[] = [];

  if (snapshot.primarySwellHeight != null) {
    parts.push(formatWaveHeight(snapshot.primarySwellHeight));
  }
  if (snapshot.primarySwellPeriod != null) {
    parts.push(`@ ${formatWavePeriod(snapshot.primarySwellPeriod)}`);
  }
  if (snapshot.primarySwellDirection != null) {
    parts.push(`from the ${getDirectionText(snapshot.primarySwellDirection)}`);
  }
  if (snapshot.windSpeed != null) {
    const speed = snapshot.windSpeed * 0.621371;
    if (speed < 8) {
      parts.push("with light winds");
    } else {
      parts.push(`with ${formatWindSpeed(snapshot.windSpeed)} winds`);
    }
  }

  return parts.join(' ');
}
