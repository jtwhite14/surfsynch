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

  return (
    <div className="space-y-6">
      {/* Waves Section */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Waves</h4>
        <div className="grid grid-cols-2 gap-4">
          <ConditionItem label="Sig. Wave Height" value={formatWaveHeight(conditions.waveHeight)} />
          <ConditionItem label="Wave Period" value={formatWavePeriod(conditions.wavePeriod)} />
          <ConditionItem
            label="Wave Direction"
            value={
              conditions.waveDirection !== null ? (
                <span className="flex items-center gap-2">
                  <DirectionArrow degrees={conditions.waveDirection} />
                  {getDirectionText(conditions.waveDirection)}
                  <span className="text-sm text-muted-foreground">({conditions.waveDirection.toFixed(0)}°)</span>
                </span>
              ) : "N/A"
            }
          />
        </div>
      </div>

      {/* Swell Section */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Swell</h4>
        <div className="grid grid-cols-2 gap-4">
          <ConditionItem label="Swell Height" value={formatWaveHeight(conditions.primarySwellHeight)} />
          <ConditionItem label="Swell Period" value={formatWavePeriod(conditions.primarySwellPeriod)} />
          <ConditionItem
            label="Swell Direction"
            value={
              conditions.primarySwellDirection !== null ? (
                <span className="flex items-center gap-2">
                  <DirectionArrow degrees={conditions.primarySwellDirection} />
                  {getDirectionText(conditions.primarySwellDirection)}
                  <span className="text-sm text-muted-foreground">({conditions.primarySwellDirection.toFixed(0)}°)</span>
                </span>
              ) : "N/A"
            }
          />
          <ConditionItem
            label="Secondary Swell"
            value={
              conditions.secondarySwellHeight !== null && conditions.secondarySwellHeight > 0
                ? `${formatWaveHeight(conditions.secondarySwellHeight)} @ ${formatWavePeriod(conditions.secondarySwellPeriod)} from ${getDirectionText(conditions.secondarySwellDirection)}`
                : "N/A"
            }
          />
        </div>
      </div>

      {/* Wind Waves Section */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Wind Waves</h4>
        <div className="grid grid-cols-2 gap-4">
          <ConditionItem label="Wind Wave Height" value={formatWaveHeight(conditions.windWaveHeight)} />
          <ConditionItem label="Wind Wave Period" value={formatWavePeriod(conditions.windWavePeriod)} />
          <ConditionItem
            label="Wind Wave Direction"
            value={
              conditions.windWaveDirection !== null ? (
                <span className="flex items-center gap-2">
                  <DirectionArrow degrees={conditions.windWaveDirection} />
                  {getDirectionText(conditions.windWaveDirection)}
                </span>
              ) : "N/A"
            }
          />
        </div>
      </div>

      {/* Wind Section */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Wind</h4>
        <div className="grid grid-cols-2 gap-4">
          <ConditionItem
            label="Wind Speed"
            value={
              <span className="flex items-center gap-2">
                {formatWindSpeed(conditions.windSpeed)}
                {conditions.windDirection !== null && (
                  <>
                    <DirectionArrow degrees={conditions.windDirection} />
                    <span className="text-sm text-muted-foreground">
                      {getDirectionText(conditions.windDirection)}
                    </span>
                  </>
                )}
              </span>
            }
          />
          <ConditionItem
            label="Wind Direction"
            value={
              conditions.windDirection !== null ? (
                <span className="flex items-center gap-2">
                  <DirectionArrow degrees={conditions.windDirection} />
                  {getDirectionText(conditions.windDirection)}
                  <span className="text-sm text-muted-foreground">({conditions.windDirection.toFixed(0)}°)</span>
                </span>
              ) : "N/A"
            }
          />
          <ConditionItem label="Wind Gust" value={formatWindSpeed(conditions.windGust)} />
        </div>
      </div>

      {/* Temperature Section */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Temperature</h4>
        <div className="grid grid-cols-2 gap-4">
          <ConditionItem label="Air Temp" value={formatTemperature(conditions.airTemp)} />
          <ConditionItem label="Water Temp" value={formatTemperature(conditions.seaSurfaceTemp)} />
        </div>
      </div>

      {/* Weather Section */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Weather</h4>
        <div className="grid grid-cols-2 gap-4">
          <ConditionItem label="Humidity" value={formatValue(conditions.humidity, "%")} />
          <ConditionItem label="Precipitation" value={formatPrecipitation(conditions.precipitation)} />
          <ConditionItem label="Pressure" value={formatPressure(conditions.pressureMsl)} />
          <ConditionItem label="Cloud Cover" value={formatValue(conditions.cloudCover, "%")} />
          <ConditionItem label="Visibility" value={formatVisibility(conditions.visibility)} />
        </div>
      </div>
    </div>
  );
}

function ConditionItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
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
