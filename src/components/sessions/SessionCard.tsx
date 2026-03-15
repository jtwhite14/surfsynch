"use client";

import Link from "next/link";
import { formatDate, formatTime } from "@/lib/utils/date";
import { formatWaveHeight, formatWindSpeed } from "@/lib/api/open-meteo";
import { SurfSessionWithConditions } from "@/types";

interface SessionCardProps {
  session: SurfSessionWithConditions;
}

export function SessionCard({ session }: SessionCardProps) {
  const photos =
    session.photos && session.photos.length > 0
      ? session.photos
      : session.photoUrl
        ? [{ id: "legacy", photoUrl: session.photoUrl, sortOrder: 0 }]
        : [];

  const hasPhoto = photos.length > 0;

  return (
    <Link href={`/sessions/${session.id}`} className="block group">
      <article className="bg-card rounded-xl overflow-hidden border border-border/50 hover:border-border transition-colors">
        {/* Header: spot name + date */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">
                {session.spot?.name?.charAt(0)?.toUpperCase() ?? "S"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{session.spot?.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(session.date)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <svg
                key={i}
                className={`w-3.5 h-3.5 ${
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

        {/* Hero photo */}
        {hasPhoto ? (
          <div className="relative aspect-[4/3] bg-muted overflow-hidden">
            <img
              src={photos[0].photoUrl}
              alt={`Session at ${session.spot?.name}`}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
            {photos.length > 1 && (
              <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-medium px-2 py-1 rounded-full backdrop-blur-sm">
                1/{photos.length}
              </div>
            )}
          </div>
        ) : (
          <div className="relative aspect-[4/3] bg-gradient-to-br from-blue-600/20 via-cyan-500/15 to-teal-400/20 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-muted-foreground/30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
              />
            </svg>
          </div>
        )}

        {/* Footer: conditions + notes */}
        <div className="px-4 py-3 space-y-2">
          {/* Conditions pills */}
          {session.conditions && (
            <div className="flex flex-wrap gap-2 text-xs">
              {session.conditions.waveHeight && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 font-medium">
                  {formatWaveHeight(parseFloat(session.conditions.waveHeight))}
                </span>
              )}
              {session.conditions.primarySwellPeriod && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 font-medium">
                  {parseFloat(session.conditions.primarySwellPeriod).toFixed(0)}s period
                </span>
              )}
              {session.conditions.windSpeed && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-500/15 text-gray-400 font-medium">
                  {formatWindSpeed(parseFloat(session.conditions.windSpeed))}
                </span>
              )}
            </div>
          )}

          {/* Time */}
          <p className="text-xs text-muted-foreground">
            {formatTime(session.startTime)}
            {session.endTime && ` - ${formatTime(session.endTime)}`}
          </p>

          {/* Notes */}
          {session.notes && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {session.notes}
            </p>
          )}
        </div>
      </article>
    </Link>
  );
}
