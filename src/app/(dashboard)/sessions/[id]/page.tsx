"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConditionsDisplay } from "@/components/sessions/ConditionsDisplay";
import { ConditionsTimeline } from "@/components/sessions/ConditionsTimeline";
import { toast } from "sonner";
import { formatFullDate, formatTime } from "@/lib/utils/date";
import { MarineConditions, SurfSessionWithConditions } from "@/types";

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [session, setSession] = useState<SurfSessionWithConditions | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (params.id) {
      fetchSession(params.id as string);
    }
  }, [params.id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  async function fetchSession(id: string) {
    try {
      const response = await fetch(`/api/sessions?id=${id}`);
      if (response.ok) {
        const data = await response.json();
        setSession(data.session);
      } else {
        toast.error("Session not found");
        router.push("/sessions");
      }
    } catch (error) {
      console.error("Error fetching session:", error);
      toast.error("Failed to load session");
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async () => {
    if (!session || !confirm("Are you sure you want to delete this session?")) return;

    try {
      const response = await fetch(`/api/sessions?id=${session.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Session deleted");
        router.push("/sessions");
      } else {
        toast.error("Failed to delete session");
      }
    } catch (error) {
      console.error("Error deleting session:", error);
      toast.error("Failed to delete session");
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="h-8 bg-muted rounded w-1/4 animate-pulse"></div>
        <div className="h-64 bg-muted rounded animate-pulse"></div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = session.conditions;
  const conditions: MarineConditions | null = c
    ? ({
        waveHeight: c.waveHeight ? parseFloat(c.waveHeight) : null,
        wavePeriod: c.wavePeriod ? parseFloat(c.wavePeriod) : null,
        waveDirection: c.waveDirection ? parseFloat(c.waveDirection) : null,
        primarySwellHeight: c.primarySwellHeight ? parseFloat(c.primarySwellHeight) : null,
        primarySwellPeriod: c.primarySwellPeriod ? parseFloat(c.primarySwellPeriod) : null,
        primarySwellDirection: c.primarySwellDirection ? parseFloat(c.primarySwellDirection) : null,
        secondarySwellHeight: c.secondarySwellHeight ? parseFloat(c.secondarySwellHeight) : null,
        secondarySwellPeriod: c.secondarySwellPeriod ? parseFloat(c.secondarySwellPeriod) : null,
        secondarySwellDirection: c.secondarySwellDirection ? parseFloat(c.secondarySwellDirection) : null,
        windWaveHeight: c.windWaveHeight ? parseFloat(c.windWaveHeight) : null,
        windWavePeriod: c.windWavePeriod ? parseFloat(c.windWavePeriod) : null,
        windWaveDirection: c.windWaveDirection ? parseFloat(c.windWaveDirection) : null,
        windSpeed: c.windSpeed ? parseFloat(c.windSpeed) : null,
        windDirection: c.windDirection ? parseFloat(c.windDirection) : null,
        windGust: c.windGust ? parseFloat(c.windGust) : null,
        airTemp: c.airTemp ? parseFloat(c.airTemp) : null,
        seaSurfaceTemp: c.seaSurfaceTemp ? parseFloat(c.seaSurfaceTemp) : null,
        humidity: c.humidity ? parseFloat(c.humidity) : null,
        precipitation: c.precipitation ? parseFloat(c.precipitation) : null,
        pressureMsl: c.pressureMsl ? parseFloat(c.pressureMsl) : null,
        cloudCover: c.cloudCover ? parseFloat(c.cloudCover) : null,
        visibility: c.visibility ? parseFloat(c.visibility) : null,
        timestamp: new Date(c.timestamp),
      } as MarineConditions)
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top navbar */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/sessions">
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
        <div className="relative" ref={menuRef}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
            >
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </Button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-40 rounded-md border border-border bg-popover shadow-lg z-50">
              <button
                className="w-full px-3 py-2 text-sm text-left text-destructive hover:bg-muted rounded-md"
                onClick={() => {
                  setMenuOpen(false);
                  handleDelete();
                }}
              >
                Delete session
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hero photo */}
      {session.photoUrl && (
        <div className="relative -mx-4 sm:mx-0 sm:rounded-2xl overflow-hidden">
          <img
            src={session.photoUrl}
            alt="Session photo"
            className="w-full h-[320px] sm:h-[400px] object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-white">
              {session.spot?.name || "Session"}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-white/70">{formatFullDate(session.date)}</span>
              <span className="text-white/30">|</span>
              <span className="text-white/70">
                {formatTime(session.startTime)}
                {session.endTime && ` - ${formatTime(session.endTime)}`}
              </span>
              <div className="flex items-center ml-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    className={`w-4 h-4 ${
                      i < session.rating ? "text-yellow-400" : "text-white/20"
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header without photo */}
      {!session.photoUrl && (
        <div>
          <h1 className="text-3xl font-bold">
            {session.spot?.name || "Session"}
          </h1>
          <p className="text-muted-foreground">
            {formatFullDate(session.date)}
          </p>
        </div>
      )}

      {/* Notes */}
      {session.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{session.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Conditions */}
      {conditions && (
        <Card>
          <CardHeader>
            <CardTitle>Conditions</CardTitle>
            <CardDescription>
              Historical conditions at time of session
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConditionsDisplay conditions={conditions} />
          </CardContent>
        </Card>
      )}

      {/* Conditions Timeline Charts */}
      <ConditionsTimeline sessionId={session.id} />
    </div>
  );
}
