"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConditionsDisplay } from "@/components/sessions/ConditionsDisplay";
import { ConditionsTimeline } from "@/components/sessions/ConditionsTimeline";
import { SessionEditDialog } from "@/components/sessions/SessionEditDialog";
import { toast } from "sonner";
import { formatFullDate, formatTime } from "@/lib/utils/date";
import { MarineConditions, SurfSessionWithConditions } from "@/types";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SpotPaneSessionDetailProps {
  session: SurfSessionWithConditions;
  onBack: () => void;
  onSessionUpdated: (session: SurfSessionWithConditions) => void;
  onSessionDeleted: (sessionId: string) => void;
}

export function SpotPaneSessionDetail({
  session,
  onBack,
  onSessionUpdated,
  onSessionDeleted,
}: SpotPaneSessionDetailProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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

  const handleToggleIgnore = async () => {
    const newIgnored = !session.ignored;
    try {
      const response = await fetch(`/api/sessions?id=${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ignored: newIgnored }),
      });
      if (response.ok) {
        const data = await response.json();
        onSessionUpdated(data.session);
        toast.success(newIgnored ? "Session ignored" : "Session unignored");
      } else {
        toast.error("Failed to update session");
      }
    } catch {
      toast.error("Failed to update session");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this session?")) return;
    try {
      const response = await fetch(`/api/sessions?id=${session.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        toast.success("Session deleted");
        onSessionDeleted(session.id);
      } else {
        toast.error("Failed to delete session");
      }
    } catch {
      toast.error("Failed to delete session");
    }
  };

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

  const allPhotos = session.photos && session.photos.length > 0
    ? session.photos.sort((a, b) => a.sortOrder - b.sortOrder)
    : session.photoUrl
      ? [{ id: "legacy", photoUrl: session.photoUrl, sortOrder: 0 }]
      : [];

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-md p-2 hover:bg-accent transition-colors">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              Edit session
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleToggleIgnore}>
              {session.ignored ? "Unignore session" : "Ignore session"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              Delete session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 space-y-4">
        {/* Ignored banner */}
        {session.ignored && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
            </svg>
            <span>Ignored — won&apos;t affect alert predictions</span>
            <button
              className="ml-auto text-xs underline hover:no-underline"
              onClick={handleToggleIgnore}
            >
              Unignore
            </button>
          </div>
        )}

        {/* Photo gallery */}
        {allPhotos.length > 0 && (
          <div className="space-y-2">
            <div
              className="relative rounded-lg overflow-hidden cursor-pointer group"
              onClick={() => setLightboxOpen(true)}
            >
              <img
                src={allPhotos[activePhotoIndex]?.photoUrl}
                alt="Session photo"
                className="w-full h-[200px] sm:h-[260px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <h2 className="text-lg font-semibold text-white">
                  {session.spot?.name || "Session"}
                </h2>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                  <span className="text-xs text-white/70">{formatFullDate(session.date)}</span>
                  <span className="text-xs text-white/70">
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

              {/* Navigation arrows */}
              {allPhotos.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setActivePhotoIndex((prev) => (prev - 1 + allPhotos.length) % allPhotos.length); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center hover:bg-black/60 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setActivePhotoIndex((prev) => (prev + 1) % allPhotos.length); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center hover:bg-black/60 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <div className="absolute top-2 right-2 bg-black/50 rounded-full px-2 py-0.5 text-xs text-white">
                    {activePhotoIndex + 1} / {allPhotos.length}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnail strip */}
            {allPhotos.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto py-1">
                {allPhotos.map((photo, idx) => (
                  <button
                    key={photo.id}
                    onClick={() => setActivePhotoIndex(idx)}
                    className={`flex-shrink-0 w-10 h-10 rounded-md overflow-hidden transition-all ${
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

          </div>
        )}

        {/* No-photo header */}
        {allPhotos.length === 0 && (
          <div>
            <h2 className="text-lg font-semibold">{session.spot?.name || "Session"}</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <span>{formatFullDate(session.date)}</span>
              <span>
                {formatTime(session.startTime)}
                {session.endTime && ` - ${formatTime(session.endTime)}`}
              </span>
              <div className="flex items-center">
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
            </div>
          </div>
        )}

        {/* Equipment */}
        {(session.surfboard || session.wetsuit) && (
          <div className="rounded-lg border bg-background/60 p-3 space-y-2">
            <p className="text-sm font-semibold">Equipment</p>
            {session.surfboard && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Board:</span>
                <span className="text-xs font-medium">{session.surfboard.name}</span>
                {(session.surfboard.brand || session.surfboard.model) && (
                  <span className="text-xs text-muted-foreground">
                    {[session.surfboard.brand, session.surfboard.model].filter(Boolean).join(" ")}
                  </span>
                )}
              </div>
            )}
            {session.wetsuit && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Wetsuit:</span>
                <span className="text-xs font-medium">{session.wetsuit.name}</span>
                {session.wetsuit.thickness && (
                  <span className="text-xs text-muted-foreground">{session.wetsuit.thickness}mm</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {session.notes && (
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-sm font-semibold mb-1">Notes</p>
            <p className="text-sm whitespace-pre-wrap">{session.notes}</p>
          </div>
        )}

        {/* Conditions */}
        {conditions && (
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-sm font-semibold mb-1">Conditions</p>
            <p className="text-xs text-muted-foreground mb-2">Historical conditions at time of session</p>
            <ConditionsDisplay conditions={conditions} />
          </div>
        )}

        {/* Conditions Timeline */}
        <ConditionsTimeline sessionId={session.id} />
      </div>

      {/* Full-screen lightbox — rendered at top level to avoid overflow clipping */}
      {lightboxOpen && allPhotos.length > 0 && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
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
            className="h-full w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {allPhotos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setActivePhotoIndex((prev) => (prev - 1 + allPhotos.length) % allPhotos.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActivePhotoIndex((prev) => (prev + 1) % allPhotos.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
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

      {/* Edit Dialog (still a modal for editing session fields) */}
      <SessionEditDialog
        session={session}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(updated) => onSessionUpdated(updated)}
      />
    </>
  );
}
