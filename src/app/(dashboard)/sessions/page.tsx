"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SessionCard } from "@/components/sessions/SessionCard";
import { SurfSessionWithConditions } from "@/types";
import { SurfSpot } from "@/lib/db/schema";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SurfSessionWithConditions[]>([]);
  const [spots, setSpots] = useState<SurfSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [spotFilter, setSpotFilter] = useState<string>("all");
  const [ratingFilter, setRatingFilter] = useState<string>("all");

  useEffect(() => {
    async function fetchData() {
      try {
        const [sessionsRes, spotsRes] = await Promise.all([
          fetch("/api/sessions"),
          fetch("/api/spots"),
        ]);

        if (sessionsRes.ok) {
          const data = await sessionsRes.json();
          setSessions(data.sessions || []);
        }

        if (spotsRes.ok) {
          const data = await spotsRes.json();
          setSpots(data.spots || []);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const filteredSessions = sessions.filter((session) => {
    if (spotFilter !== "all" && session.spotId !== spotFilter) return false;
    if (ratingFilter !== "all" && session.rating !== parseInt(ratingFilter))
      return false;
    return true;
  });

  if (loading) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="h-8 bg-muted rounded w-1/4 animate-pulse"></div>
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl overflow-hidden">
              <div className="h-10 bg-muted animate-pulse" />
              <div className="aspect-[4/3] bg-muted animate-pulse" />
              <div className="h-16 bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Sessions</h1>
        <Button asChild>
          <Link href="/sessions/new">Log Session</Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={spotFilter} onValueChange={setSpotFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All spots" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All spots</SelectItem>
            {spots.map((spot) => (
              <SelectItem key={spot.id} value={spot.id}>
                {spot.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All ratings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            {[5, 4, 3, 2, 1].map((rating) => (
              <SelectItem key={rating} value={rating.toString()}>
                {rating} star{rating !== 1 ? "s" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(spotFilter !== "all" || ratingFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSpotFilter("all");
              setRatingFilter("all");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Sessions feed */}
      {filteredSessions.length > 0 ? (
        <div className="space-y-6">
          {filteredSessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : sessions.length > 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            No sessions match your filters
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSpotFilter("all");
              setRatingFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No sessions logged yet</p>
          <Button asChild>
            <Link href="/sessions/new">Log your first session</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
