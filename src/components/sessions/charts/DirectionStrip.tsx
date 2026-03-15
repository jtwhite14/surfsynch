"use client";

import { getDirectionText } from "@/lib/api/open-meteo";

interface DirectionStripProps {
  directions: (number | null)[];
  sessionIndex: number;
  label?: string;
}

export function DirectionStrip({ directions, sessionIndex, label }: DirectionStripProps) {
  return (
    <div className="flex items-center gap-2 px-5 pt-1.5 pb-2">
      {label && (
        <span className="text-[10px] text-white/20 font-medium tracking-wide shrink-0 w-[70px]">
          {label}
        </span>
      )}
      <div className="flex items-center justify-between flex-1">
        {directions.map((deg, i) => {
          const isSession = i === sessionIndex;
          const compass = deg != null ? getDirectionText(deg) : null;
          // Arrows show where swell/wind comes FROM: rotate +180°
          const arrowDeg = deg != null ? (deg + 180) % 360 : null;

          return (
            <div
              key={i}
              className="flex flex-col items-center gap-0.5"
            >
              <div
                className={`flex items-center justify-center w-5 h-5 rounded-full
                  ${isSession ? "bg-primary/15" : ""}`}
              >
                {arrowDeg != null ? (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    className={isSession ? "text-primary" : "text-white/25"}
                    style={{ transform: `rotate(${arrowDeg}deg)` }}
                  >
                    <path d="M5 1L7.5 8H2.5L5 1Z" fill="currentColor" />
                  </svg>
                ) : (
                  <span className="text-white/10 text-[9px]">-</span>
                )}
              </div>
              {isSession && compass && (
                <span className="text-[9px] font-medium text-primary/70">
                  {compass}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
