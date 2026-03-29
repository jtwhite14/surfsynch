"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatDate } from "@/lib/utils/date";
import { SpotConditions } from "@/components/spots/SpotConditions";
import { SpotAlertCard } from "@/components/alerts/SpotAlertCard";
import { WeeklyForecast } from "@/components/forecast/WeeklyForecast";
import { FiveStarHeatmap } from "@/components/spots/FiveStarHeatmap";
import type { SharedSpotView, SurfSessionWithConditions } from "@/types";

interface SharedSpotPaneProps {
  sharedSpot: SharedSpotView;
  onClose: () => void;
}

export function SharedSpotPane({ sharedSpot, onClose }: SharedSpotPaneProps) {
  const [sessions, setSessions] = useState<SurfSessionWithConditions[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/shares/spots/${sharedSpot.shareId}/sessions`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [sharedSpot.shareId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const spotId = sharedSpot.spot.id;

  return (
    <div className="absolute inset-0 sm:inset-auto sm:top-4 sm:left-4 sm:bottom-4 z-20 w-full sm:w-[50vw] sm:max-w-[800px] flex flex-col sm:rounded-lg border bg-background/95 sm:bg-background/90 backdrop-blur-sm shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold truncate">{sharedSpot.spot.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Shared by {sharedSpot.sharedBy.name || "Unknown"}
          </p>
          {sharedSpot.spot.description && (
            <p className="text-sm text-muted-foreground mt-1">{sharedSpot.spot.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {parseFloat(sharedSpot.spot.latitude).toFixed(5)}, {parseFloat(sharedSpot.spot.longitude).toFixed(5)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-2 hover:bg-accent transition-colors shrink-0"
        >
          <X className="size-5 sm:size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-3">
        {/* Alerts */}
        <div className="rounded-lg border bg-background/60 overflow-hidden p-3">
          <SpotAlertCard spotId={spotId} sessionCount={sessions.length} embedded />
        </div>

        {/* Forecast */}
        <div className="rounded-lg border bg-background/60 overflow-hidden">
          <WeeklyForecast spotId={spotId} embedded />
        </div>

        {/* Recent Sessions */}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold mb-2">
              Recent Sessions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {sessions.slice(0, 4).map((session) => {
                const photo = session.photos?.[0]?.photoUrl || session.photoUrl;
                return (
                  <div
                    key={session.id}
                    className="rounded-lg border bg-background/60 overflow-hidden"
                  >
                    {photo && (
                      <div className="aspect-video w-full overflow-hidden">
                        <img
                          src={photo}
                          alt={`Session on ${formatDate(session.date)}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm truncate">{formatDate(session.date)}</p>
                        <div className="flex items-center shrink-0">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <svg
                              key={i}
                              className={`w-2.5 h-2.5 ${
                                i < session.rating ? "text-yellow-400" : "text-muted-foreground/30"
                              }`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                      </div>
                      {session.notes && (
                        <p className="text-xs text-muted-foreground truncate mt-1">{session.notes}</p>
                      )}
                      {session.conditions && (
                        <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
                          {session.conditions.primarySwellHeight && (
                            <span>{(parseFloat(session.conditions.primarySwellHeight) * 3.28084).toFixed(0)}ft</span>
                          )}
                          {session.conditions.primarySwellPeriod && (
                            <span>@ {parseFloat(session.conditions.primarySwellPeriod).toFixed(0)}s</span>
                          )}
                          {session.conditions.windSpeed && (
                            <span>{parseFloat(session.conditions.windSpeed).toFixed(0)}kts wind</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">No high-rated sessions to show</p>
          </div>
        )}

        {/* 5-Star Condition Frequency */}
        <FiveStarHeatmap spotId={spotId} />

        {/* Conditions Timeline */}
        <SpotConditions spotId={spotId} />
      </div>
    </div>
  );
}
