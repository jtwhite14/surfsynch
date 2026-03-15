"use client";

import { SurfSpot } from "@/lib/db/schema";

interface SpotMarkerProps {
  spot: SurfSpot;
  isSelected?: boolean;
  hasAlert?: boolean;
}

export default function SpotMarker({ spot, isSelected, hasAlert }: SpotMarkerProps) {
  return (
    <div className="relative group cursor-pointer">
      {/* Alert indicator dot */}
      {hasAlert && !isSelected && (
        <div className="absolute -top-0.5 -right-0.5 z-10">
          <div className="relative">
            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-primary motion-safe:animate-ping opacity-75" style={{ animationIterationCount: 3 }} />
            <div className="w-2.5 h-2.5 rounded-full bg-primary border border-background" />
          </div>
        </div>
      )}

      {/* Marker */}
      <svg
        className={`w-8 h-8 text-primary drop-shadow-lg transition-all duration-200 ease-in-out ${
          isSelected ? "scale-125" : "hover:scale-110"
        }`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
      </svg>

      {/* Tooltip */}
      <div
        className={`
          absolute bottom-full left-1/2 -translate-x-1/2 mb-2
          px-2 py-1 bg-background border rounded-md shadow-lg
          whitespace-nowrap text-sm font-medium
          opacity-0 group-hover:opacity-100 transition-opacity
          pointer-events-none
        `}
      >
        {spot.name}
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 -mt-1
                     border-4 border-transparent border-t-background"
        />
      </div>

      {/* Selection ring */}
      {isSelected && (
        <div className="absolute -inset-1 bg-primary/20 rounded-full animate-pulse" />
      )}
    </div>
  );
}
