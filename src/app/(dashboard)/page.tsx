"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/date";
import { ChevronDown, ChevronUp, Plus, Loader2 } from "lucide-react";
import type { SurfSpot } from "@/lib/db/schema";
import type { SurfSessionWithConditions } from "@/types";

const SpotMap = dynamic(() => import("@/components/map/SpotMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-muted">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default function DashboardPage() {
  const [spots, setSpots] = useState<SurfSpot[]>([]);
  const [sessions, setSessions] = useState<SurfSessionWithConditions[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);

  const [homeLocation, setHomeLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/spots").then((r) => (r.ok ? r.json() : { spots: [] })),
      fetch("/api/sessions?limit=5").then((r) => (r.ok ? r.json() : { sessions: [] })),
      fetch("/api/user/location").then((r) => (r.ok ? r.json() : { latitude: null, longitude: null })),
    ])
      .then(([spotsData, sessionsData, locationData]) => {
        setSpots(spotsData.spots || []);
        setSessions(sessionsData.sessions || []);
        if (locationData.latitude && locationData.longitude) {
          setHomeLocation({ latitude: locationData.latitude, longitude: locationData.longitude });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const initialViewState = useMemo(() => {
    // If user has spots, center on them
    if (spots.length === 1) {
      return {
        longitude: parseFloat(spots[0].longitude),
        latitude: parseFloat(spots[0].latitude),
        zoom: 12,
      };
    }
    if (spots.length > 1) {
      const lngs = spots.map((s) => parseFloat(s.longitude));
      const lats = spots.map((s) => parseFloat(s.latitude));
      return {
        longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
        latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
        zoom: 10,
      };
    }
    // Fall back to home location (~100mi radius ≈ zoom 7)
    if (homeLocation) {
      return {
        longitude: homeLocation.longitude,
        latitude: homeLocation.latitude,
        zoom: 7,
      };
    }
    return undefined;
  }, [spots, homeLocation]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <SpotMap spots={spots} interactive={false} {...(initialViewState && { initialViewState })} />

      {/* Log Session button */}
      <div className="absolute bottom-6 right-4 z-10">
        <Button asChild size="lg" className="shadow-lg">
          <Link href="/sessions/new">
            <Plus className="size-4 mr-2" />
            Log Session
          </Link>
        </Button>
      </div>

      {/* Recent Sessions panel */}
      <div className="absolute bottom-6 left-4 z-10 w-[calc(100%-2rem)] sm:w-80">
        <div className="rounded-lg border bg-background/90 backdrop-blur-sm shadow-lg">
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
          >
            Recent Sessions
            {panelOpen ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </button>

          {panelOpen && (
            <div className="border-t px-3 pb-3 pt-1">
              {sessions.length > 0 ? (
                <div className="space-y-1">
                  {sessions.map((session) => (
                    <Link
                      key={session.id}
                      href={`/sessions/${session.id}`}
                      className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{session.spot?.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(session.date)}</p>
                      </div>
                      <div className="flex items-center ml-2 shrink-0">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <svg
                            key={i}
                            className={`w-3 h-3 ${
                              i < session.rating ? "text-yellow-400" : "text-muted-foreground/30"
                            }`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">No sessions yet</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
