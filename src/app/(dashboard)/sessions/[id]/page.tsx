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
import { SessionEditDialog } from "@/components/sessions/SessionEditDialog";

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [session, setSession] = useState<SurfSessionWithConditions | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
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

  const photoCount = session?.photos?.length || (session?.photoUrl ? 1 : 0);
  useEffect(() => {
    if (!lightboxOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowLeft") setActivePhotoIndex((prev) => (prev - 1 + photoCount) % photoCount);
      if (e.key === "ArrowRight") setActivePhotoIndex((prev) => (prev + 1) % photoCount);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, photoCount]);

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
        tideHeight: c.tideHeight ? parseFloat(c.tideHeight) : null,
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
                className="w-full px-3 py-2 text-sm text-left hover:bg-muted rounded-t-md"
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
              >
                Edit session
              </button>
              <button
                className="w-full px-3 py-2 text-sm text-left text-destructive hover:bg-muted rounded-b-md"
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

      {/* Photo gallery */}
      {(() => {
        const allPhotos = session.photos && session.photos.length > 0
          ? session.photos.sort((a, b) => a.sortOrder - b.sortOrder)
          : session.photoUrl
            ? [{ id: "legacy", photoUrl: session.photoUrl, sortOrder: 0 }]
            : [];

        if (allPhotos.length > 0) {
          return (
            <div className="space-y-2">
              {/* Main photo */}
              <div
                className="relative -mx-4 sm:mx-0 sm:rounded-2xl overflow-hidden cursor-pointer group"
                onClick={() => setLightboxOpen(true)}
              >
                <img
                  src={allPhotos[activePhotoIndex]?.photoUrl}
                  alt="Session photo"
                  className="w-full h-[320px] sm:h-[400px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-5">
                  <h1 className="text-lg sm:text-2xl font-semibold text-white">
                    {session.spot?.name || "Session"}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                    <span className="text-xs sm:text-sm text-white/70">{formatFullDate(session.date)}</span>
                    <span className="text-white/30 hidden sm:inline">|</span>
                    <span className="text-xs sm:text-sm text-white/70">
                      {formatTime(session.startTime)}
                      {session.endTime && ` - ${formatTime(session.endTime)}`}
                    </span>
                    <div className="flex items-center ml-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <svg
                          key={i}
                          className={`w-3 h-3 ${
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

                {/* Expand hint */}
                <div className="absolute top-3 left-3 bg-black/50 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                  </svg>
                </div>

                {/* Navigation arrows for multi-photo */}
                {allPhotos.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setActivePhotoIndex((prev) => (prev - 1 + allPhotos.length) % allPhotos.length); }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 rounded-full flex items-center justify-center hover:bg-black/60 transition-colors"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setActivePhotoIndex((prev) => (prev + 1) % allPhotos.length); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 rounded-full flex items-center justify-center hover:bg-black/60 transition-colors"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <div className="absolute top-3 right-3 bg-black/50 rounded-full px-2 py-0.5 text-xs text-white">
                      {activePhotoIndex + 1} / {allPhotos.length}
                    </div>
                  </>
                )}
              </div>

              {/* Thumbnail strip for multi-photo */}
              {allPhotos.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto py-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                  {allPhotos.map((photo, idx) => (
                    <button
                      key={photo.id}
                      onClick={() => setActivePhotoIndex(idx)}
                      className={`flex-shrink-0 w-11 h-11 rounded-md overflow-hidden transition-all ${
                        idx === activePhotoIndex
                          ? "ring-2 ring-primary opacity-100"
                          : "opacity-50 hover:opacity-80"
                      }`}
                    >
                      <img
                        src={photo.photoUrl}
                        alt={`Photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Lightbox */}
              {lightboxOpen && (
                <div
                  className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
                  onClick={() => setLightboxOpen(false)}
                >
                  <button
                    className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors z-10"
                    onClick={() => setLightboxOpen(false)}
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  <img
                    src={allPhotos[activePhotoIndex]?.photoUrl}
                    alt="Session photo"
                    className="max-h-[90vh] max-w-[95vw] object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />

                  {allPhotos.length > 1 && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setActivePhotoIndex((prev) => (prev - 1 + allPhotos.length) % allPhotos.length); }}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                      >
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setActivePhotoIndex((prev) => (prev + 1) % allPhotos.length); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                      >
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 rounded-full px-3 py-1 text-sm text-white">
                        {activePhotoIndex + 1} / {allPhotos.length}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        }

        // Header without photo
        return (
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              {session.spot?.name || "Session"}
            </h1>
            <p className="text-muted-foreground">
              {formatFullDate(session.date)}
            </p>
          </div>
        );
      })()}

      {/* Equipment */}
      {(session.surfboard || session.wetsuit) && (
        <Card>
          <CardHeader>
            <CardTitle>Equipment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {session.surfboard && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Board:</span>
                  <span className="text-sm font-medium">{session.surfboard.name}</span>
                  {(session.surfboard.brand || session.surfboard.model) && (
                    <span className="text-sm text-muted-foreground">
                      {[session.surfboard.brand, session.surfboard.model].filter(Boolean).join(" ")}
                    </span>
                  )}
                </div>
              )}
              {session.wetsuit && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Wetsuit:</span>
                  <span className="text-sm font-medium">{session.wetsuit.name}</span>
                  {session.wetsuit.thickness && (
                    <span className="text-sm text-muted-foreground">{session.wetsuit.thickness}mm</span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
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

      {/* Edit Dialog */}
      <SessionEditDialog
        session={session}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(updated) => setSession(updated)}
      />
    </div>
  );
}
