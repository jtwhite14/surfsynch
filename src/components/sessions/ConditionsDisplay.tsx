"use client";

import { MarineConditions } from "@/types";
import {
  formatWaveHeight,
  formatWavePeriod,
  formatWindSpeed,
  formatTemperature,
  formatVisibility,
  formatPressure,
  formatPrecipitation,
  formatTideHeight,
  getDirectionText,
} from "@/lib/api/open-meteo";

interface ConditionsDisplayProps {
  conditions: MarineConditions;
  compact?: boolean;
}

function formatValue(val: number | null, suffix: string, decimals = 0): string {
  if (val === null) return "N/A";
  return `${val.toFixed(decimals)}${suffix}`;
}

function formatDirection(degrees: number | null): React.ReactNode {
  if (degrees === null) return "N/A";
  return (
    <span className="inline-flex items-center gap-1">
      <DirectionArrow degrees={degrees} />
      {getDirectionText(degrees)}
      <span className="text-muted-foreground font-normal text-xs">({degrees.toFixed(0)}°)</span>
    </span>
  );
}

function formatSwellLine(
  height: number | null,
  period: number | null,
  direction: number | null
): React.ReactNode {
  if (height === null) return "N/A";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{formatWaveHeight(height)}</span>
      <span className="text-muted-foreground font-normal">@</span>
      <span>{formatWavePeriod(period)}</span>
      {direction !== null && (
        <>
          <span className="text-muted-foreground font-normal">from</span>
          <DirectionArrow degrees={direction} />
          <span>{getDirectionText(direction)}</span>
        </>
      )}
    </span>
  );
}

export function ConditionsDisplay({ conditions, compact = false }: ConditionsDisplayProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-500/15 text-blue-400">
          {formatWaveHeight(conditions.waveHeight)}
        </span>
        <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-500/15 text-green-400">
          {formatWavePeriod(conditions.primarySwellPeriod)}
        </span>
        <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-500/15 text-gray-400">
          {formatWindSpeed(conditions.windSpeed)}
        </span>
      </div>
    );
  }

  const secondarySwell = conditions.secondarySwellHeight !== null && conditions.secondarySwellHeight > 0;

  return (
    <div className="space-y-4">
      {/* Surf — primary data surfers care about */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Surf</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          <ConditionItem label="Wave Height" value={formatWaveHeight(conditions.waveHeight)} />
          <ConditionItem label="Period" value={formatWavePeriod(conditions.wavePeriod)} />
          <ConditionItem label="Direction" value={formatDirection(conditions.waveDirection)} />
        </div>

        {/* Swell breakdown */}
        <div className="mt-2 space-y-1">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="text-muted-foreground w-20 shrink-0">Primary</span>
            <span className="font-medium">
              {formatSwellLine(conditions.primarySwellHeight, conditions.primarySwellPeriod, conditions.primarySwellDirection)}
            </span>
          </div>
          {secondarySwell && (
            <div className="flex items-baseline gap-2 text-sm">
              <span className="text-muted-foreground w-20 shrink-0">Secondary</span>
              <span className="font-medium">
                {formatSwellLine(conditions.secondarySwellHeight, conditions.secondarySwellPeriod, conditions.secondarySwellDirection)}
              </span>
            </div>
          )}
          <div className="flex items-baseline gap-2 text-sm">
            <span className="text-muted-foreground w-20 shrink-0">Wind chop</span>
            <span className="font-medium">
              {formatSwellLine(conditions.windWaveHeight, conditions.windWavePeriod, conditions.windWaveDirection)}
            </span>
          </div>
        </div>
      </section>

      {/* Wind & Tide — row of key values */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Wind & Tide</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          <ConditionItem
            label="Wind"
            value={
              <span className="inline-flex items-center gap-1.5">
                {formatWindSpeed(conditions.windSpeed)}
                {conditions.windDirection !== null && (
                  <>
                    <DirectionArrow degrees={conditions.windDirection} />
                    <span className="font-normal text-xs text-muted-foreground">{getDirectionText(conditions.windDirection)}</span>
                  </>
                )}
              </span>
            }
          />
          <ConditionItem label="Gusts" value={formatWindSpeed(conditions.windGust)} />
          {conditions.tideHeight !== null && (
            <ConditionItem label="Tide" value={formatTideHeight(conditions.tideHeight)} />
          )}
        </div>
      </section>

      {/* Atmosphere — compact grid */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Atmosphere</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          <ConditionItem label="Air" value={formatTemperature(conditions.airTemp)} />
          <ConditionItem label="Water" value={formatTemperature(conditions.seaSurfaceTemp)} />
          <ConditionItem label="Humidity" value={formatValue(conditions.humidity, "%")} />
          <ConditionItem label="Pressure" value={formatPressure(conditions.pressureMsl)} />
          <ConditionItem label="Cloud" value={formatValue(conditions.cloudCover, "%")} />
          <ConditionItem label="Precip" value={formatPrecipitation(conditions.precipitation)} />
          {conditions.visibility !== null && (
            <ConditionItem label="Visibility" value={formatVisibility(conditions.visibility)} />
          )}
        </div>
      </section>
    </div>
  );
}

function ConditionItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
      <div className="text-sm font-semibold leading-snug">{value}</div>
    </div>
  );
}

function DirectionArrow({ degrees }: { degrees: number | null }) {
  if (degrees === null) return null;

  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${degrees + 180}deg)` }}
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}
