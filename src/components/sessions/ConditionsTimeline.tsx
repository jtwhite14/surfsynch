"use client";

import { useEffect, useState } from "react";
import { HourlyForecast } from "@/types";
import { SurfChart } from "./charts/SurfChart";
import { WindChart } from "./charts/WindChart";
import { TideChart } from "./charts/TideChart";
import { WeatherStrip } from "./charts/WeatherStrip";
import { AtmospherePanel } from "./charts/AtmospherePanel";

interface ConditionsTimelineProps {
  sessionId?: string;
  spotId?: string;
}

export function ConditionsTimeline({ sessionId, spotId }: ConditionsTimelineProps) {
  const [timeline, setTimeline] = useState<HourlyForecast[]>([]);
  const [sessionHourIndex, setSessionHourIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKey = sessionId || spotId;

  useEffect(() => {
    if (!fetchKey) return;
    async function fetchTimeline() {
      try {
        const url = spotId
          ? `/api/spots/${spotId}/conditions`
          : `/api/sessions/${sessionId}/timeline`;
        const res = await fetch(url);
        if (!res.ok) {
          setError("Failed to load timeline");
          return;
        }
        const data = await res.json();
        setTimeline(data.timeline);
        setSessionHourIndex(data.currentHourIndex ?? data.sessionHourIndex);
      } catch {
        setError("Failed to load timeline");
      } finally {
        setLoading(false);
      }
    }
    setLoading(true);
    setError(null);
    fetchTimeline();
  }, [fetchKey, sessionId, spotId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-baseline gap-2">
          <div className="h-5 w-40 bg-white/[0.04] rounded animate-pulse" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-[260px] rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error || timeline.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Conditions Timeline</h2>
        <p className="text-[13px] text-white/30 mt-0.5">
          {spotId ? "Current conditions and forecast" : "24-hour window around your session"}
        </p>
      </div>
      <div className="space-y-3">
        <SurfChart data={timeline} sessionIndex={sessionHourIndex} />
        <TideChart data={timeline} sessionIndex={sessionHourIndex} />
        <WindChart data={timeline} sessionIndex={sessionHourIndex} />
        <WeatherStrip data={timeline} sessionIndex={sessionHourIndex} />
        <AtmospherePanel data={timeline} sessionIndex={sessionHourIndex} />
      </div>
    </div>
  );
}
