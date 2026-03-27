"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SessionForm } from "@/components/sessions/SessionForm";
import { SurfSpot, Surfboard, Wetsuit } from "@/lib/db/schema";

function NewSessionContent() {
  const searchParams = useSearchParams();
  const defaultSpotId = searchParams.get("spotId") || undefined;
  const [spots, setSpots] = useState<SurfSpot[]>([]);
  const [surfboards, setSurfboards] = useState<Surfboard[]>([]);
  const [wetsuits, setWetsuits] = useState<Wetsuit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [spotsRes, boardsRes, suitsRes] = await Promise.all([
          fetch("/api/spots?includeShared=true"),
          fetch("/api/surfboards"),
          fetch("/api/wetsuits"),
        ]);
        if (spotsRes.ok) {
          const data = await spotsRes.json();
          // Merge own spots and shared spots (shared spots get a label suffix)
          const ownSpots: SurfSpot[] = data.spots || [];
          const shared: (SurfSpot & { sharedByName?: string | null })[] = data.sharedSpots || [];
          const labeledShared = shared.map((s) => ({
            ...s,
            name: s.sharedByName ? `${s.name} (${s.sharedByName}'s)` : s.name,
          }));
          setSpots([...ownSpots, ...labeledShared]);
        }
        if (boardsRes.ok) {
          const data = await boardsRes.json();
          setSurfboards(data.surfboards || []);
        }
        if (suitsRes.ok) {
          const data = await suitsRes.json();
          setWetsuits(data.wetsuits || []);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="h-8 bg-muted rounded w-1/4 animate-pulse"></div>
        <div className="h-64 bg-muted rounded animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/dashboard">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 mr-1"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
        </Button>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold">Log Session</h1>

      <SessionForm spots={spots} defaultSpotId={defaultSpotId} surfboards={surfboards} wetsuits={wetsuits} />
    </div>
  );
}

export default function NewSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="h-8 bg-muted rounded w-1/4 animate-pulse"></div>
          <div className="h-64 bg-muted rounded animate-pulse"></div>
        </div>
      }
    >
      <NewSessionContent />
    </Suspense>
  );
}
