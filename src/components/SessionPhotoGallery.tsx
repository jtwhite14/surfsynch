"use client";

import Image from "next/image";
import { useState } from "react";
import { Star } from "lucide-react";

interface SessionPhoto {
  photoUrl: string;
  spotName: string | null;
  rating: number;
  date: string;
}

export function SessionPhotoGallery({ photos }: { photos: SessionPhoto[] }) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  const visiblePhotos = photos.filter((p) => !failedUrls.has(p.photoUrl));

  if (visiblePhotos.length === 0) return null;

  return (
    <section className="py-24 md:py-32">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center">
          Recent sessions
        </h2>
        <p className="mt-3 text-center text-muted-foreground">
          Pulled from real logged sessions — no stock photos.
        </p>
        <div className="mt-12 columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {visiblePhotos.map((photo, i) => (
            <div
              key={photo.photoUrl}
              className="break-inside-avoid rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03]"
            >
              <div className="relative">
                <Image
                  src={photo.photoUrl}
                  alt={photo.spotName ? `Session at ${photo.spotName}` : "Surf session"}
                  width={600}
                  height={400}
                  className="w-full h-auto"
                  onError={() =>
                    setFailedUrls((prev) => new Set(prev).add(photo.photoUrl))
                  }
                />
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground truncate">
                  {photo.spotName ?? "Secret spot"}
                </span>
                <div className="flex items-center gap-0.5 shrink-0 ml-2">
                  {Array.from({ length: photo.rating }).map((_, j) => (
                    <Star
                      key={j}
                      className="h-3 w-3 fill-primary text-primary"
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
