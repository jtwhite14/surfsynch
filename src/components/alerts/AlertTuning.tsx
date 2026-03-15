"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ConditionWeights,
  DEFAULT_CONDITION_WEIGHTS,
  WEIGHT_PRESETS,
  CardinalDirection,
  PreferredWaveSize,
  PreferredSwellPeriod,
  PreferredWind,
} from "@/types";
import { SwellExposurePicker } from "@/components/spots/SwellExposurePicker";

interface AlertTuningSectionProps {
  spotId: string;
  onSave?: (weights: ConditionWeights) => void;
}

export function AlertTuningSection({ spotId, onSave }: AlertTuningSectionProps) {
  const [weights, setWeights] = useState<ConditionWeights>(DEFAULT_CONDITION_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>("allAround");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/spots/${spotId}/weights`)
      .then(r => r.ok ? r.json() : { weights: DEFAULT_CONDITION_WEIGHTS })
      .then(data => {
        // Migrate legacy single-value preferences to arrays
        const w = { ...data.weights };
        if (w.preferredWaveSize && !Array.isArray(w.preferredWaveSize)) {
          w.preferredWaveSize = [w.preferredWaveSize];
        }
        if (w.preferredSwellPeriod && !Array.isArray(w.preferredSwellPeriod)) {
          w.preferredSwellPeriod = [w.preferredSwellPeriod];
        }
        if (w.preferredWind && !Array.isArray(w.preferredWind)) {
          w.preferredWind = [w.preferredWind];
        }
        setWeights(w);
        setActivePreset(detectPreset(w));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [spotId]);

  function detectPreset(w: ConditionWeights): string | null {
    for (const [key, preset] of Object.entries(WEIGHT_PRESETS)) {
      const pw = preset.weights;
      if (
        pw.swellHeight === w.swellHeight &&
        pw.swellPeriod === w.swellPeriod &&
        pw.swellDirection === w.swellDirection &&
        pw.tideHeight === w.tideHeight &&
        pw.windSpeed === w.windSpeed &&
        pw.windDirection === w.windDirection
      ) {
        return key;
      }
    }
    return null;
  }

  async function applyPreset(presetKey: string) {
    const preset = WEIGHT_PRESETS[presetKey];
    if (!preset) return;
    const newWeights: ConditionWeights = {
      ...DEFAULT_CONDITION_WEIGHTS,
      ...preset.weights,
    };
    setWeights(newWeights);
    setActivePreset(presetKey);
    await saveWeights(newWeights);
  }

  async function saveWeights(w: ConditionWeights = weights) {
    try {
      const res = await fetch(`/api/spots/${spotId}/weights`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(w),
      });
      if (!res.ok) throw new Error();
      onSave?.(w);
    } catch {
      toast.error("Failed to save alert preferences");
    }
  }

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function debouncedSave(newWeights: ConditionWeights) {
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveWeights(newWeights), 700);
  }

  function handleWeightChange(key: keyof ConditionWeights, level: number) {
    const value = level === 0 ? 0.3 : level === 1 ? 0.6 : 1.0;
    const newWeights = { ...weights, [key]: value };

    // Clear follow-up preference when weight drops to "Not very"
    if (level === 0) {
      if (key === "swellHeight") newWeights.preferredWaveSize = undefined;
      if (key === "swellPeriod") newWeights.preferredSwellPeriod = undefined;
      if (key === "windSpeed") newWeights.preferredWind = undefined;
      if (key === "windDirection") newWeights.preferredWindDirections = undefined;
      if (key === "tideHeight") newWeights.preferredTide = "any";
    }

    setWeights(newWeights);
    setActivePreset(null);
    debouncedSave(newWeights);
  }

  function handleMultiPreferenceChange<K extends keyof ConditionWeights>(
    key: K,
    value: string,
  ) {
    const current = (weights[key] as string[] | undefined) ?? [];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    const newWeights = { ...weights, [key]: updated.length > 0 ? updated : undefined };
    setWeights(newWeights);
    setActivePreset(null);
    debouncedSave(newWeights);
  }

  function handlePreferenceChange<K extends keyof ConditionWeights>(
    key: K,
    value: ConditionWeights[K] | undefined,
  ) {
    const newWeights = { ...weights, [key]: value };
    setWeights(newWeights);
    setActivePreset(null);
    debouncedSave(newWeights);
  }

  function handleExposureChange(directions: CardinalDirection[]) {
    const newWeights = { ...weights, swellExposure: directions.length > 0 ? directions : undefined };
    setWeights(newWeights);
    debouncedSave(newWeights);
  }

  function handleWindDirectionChange(directions: CardinalDirection[]) {
    const newWeights = { ...weights, preferredWindDirections: directions.length > 0 ? directions : undefined };
    setWeights(newWeights);
    debouncedSave(newWeights);
  }

  function weightToLevel(value: number): number {
    if (value <= 0.45) return 0;
    if (value <= 0.8) return 1;
    return 2;
  }

  if (loading) {
    return <div className="py-2 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  const swellHeightLevel = weightToLevel(weights.swellHeight);
  const swellPeriodLevel = weightToLevel(weights.swellPeriod);
  const swellDirLevel = weightToLevel(weights.swellDirection);
  const windSpeedLevel = weightToLevel(weights.windSpeed);
  const windDirLevel = weightToLevel(weights.windDirection);
  const tideLevel = weightToLevel(weights.tideHeight);

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Spot type</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(WEIGHT_PRESETS).map(([key, preset]) => (
            <Button
              key={key}
              variant={activePreset === key ? "default" : "outline"}
              size="sm"
              onClick={() => applyPreset(key)}
              className="text-xs"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Customize weights */}
      <div className="space-y-0.5">
        <label className="text-sm font-medium block mb-1">Customize</label>

        {/* Swell section */}
        <div className="space-y-0.5">
          <WeightRow
            label="How important is wave size?"
            value={swellHeightLevel}
            onChange={level => handleWeightChange("swellHeight", level)}
          />
          <FollowUpRow
            visible={swellHeightLevel >= 1}
            label="What size waves?"
            options={[
              { value: "small", label: "Small (<3ft)" },
              { value: "medium", label: "Medium (3–6ft)" },
              { value: "large", label: "Large (6–10ft)" },
              { value: "xl", label: "XL (10ft+)" },
            ]}
            selected={weights.preferredWaveSize ?? []}
            onChange={(v) => handleMultiPreferenceChange("preferredWaveSize", v)}
          />

          <WeightRow
            label="How important is swell period?"
            value={swellPeriodLevel}
            onChange={level => handleWeightChange("swellPeriod", level)}
          />
          <FollowUpRow
            visible={swellPeriodLevel >= 1}
            label="What swell period?"
            options={[
              { value: "short", label: "Short (<8s)" },
              { value: "medium", label: "Medium (8–12s)" },
              { value: "long", label: "Long (12s+)" },
            ]}
            selected={weights.preferredSwellPeriod ?? []}
            onChange={(v) => handleMultiPreferenceChange("preferredSwellPeriod", v)}
          />

          <WeightRow
            label="How important is swell direction?"
            value={swellDirLevel}
            onChange={level => handleWeightChange("swellDirection", level)}
          />
          {swellDirLevel >= 1 && (
            <div className="pl-1 pb-1">
              <SwellExposurePicker
                value={weights.swellExposure ?? []}
                onChange={handleExposureChange}
              />
            </div>
          )}
        </div>

        <div className="border-t my-2" />

        {/* Wind section */}
        <div className="space-y-0.5">
          <WeightRow
            label="How important is wind?"
            value={windSpeedLevel}
            onChange={level => handleWeightChange("windSpeed", level)}
          />
          <FollowUpRow
            visible={windSpeedLevel >= 1}
            label="What wind conditions?"
            options={[
              { value: "glassy", label: "Light/Glassy" },
              { value: "offshore", label: "Offshore" },
              { value: "cross-offshore", label: "Cross-offshore" },
              { value: "onshore", label: "Onshore" },
            ]}
            selected={weights.preferredWind ?? []}
            onChange={(v) => handleMultiPreferenceChange("preferredWind", v)}
          />

          <WeightRow
            label="How important is wind direction?"
            value={windDirLevel}
            onChange={level => handleWeightChange("windDirection", level)}
          />
          {windDirLevel >= 1 && (
            <div className="pl-1 pb-1">
              <WindDirectionPicker
                value={weights.preferredWindDirections ?? []}
                onChange={handleWindDirectionChange}
              />
            </div>
          )}
        </div>

        <div className="border-t my-2" />

        {/* Tide section */}
        <div className="space-y-0.5">
          <WeightRow
            label="How important is tide?"
            value={tideLevel}
            onChange={level => handleWeightChange("tideHeight", level)}
          />
          <FollowUpRow
            visible={tideLevel >= 1}
            label="Best tide?"
            options={[
              { value: "any", label: "Any" },
              { value: "low", label: "Low" },
              { value: "mid", label: "Mid" },
              { value: "high", label: "High" },
              { value: "incoming", label: "Incoming" },
              { value: "outgoing", label: "Outgoing" },
            ]}
            selected={weights.preferredTide ? [weights.preferredTide] : []}
            onChange={(v) => handlePreferenceChange("preferredTide", (v || "any") as ConditionWeights["preferredTide"])}
          />
        </div>
      </div>
    </div>
  );
}

function WeightRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (level: number) => void;
}) {
  const levels = ["Not very", "Somewhat", "Very"];
  return (
    <div className="pt-2">
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <div className="flex gap-1">
        {levels.map((text, i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              value === i
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function FollowUpRow({
  visible,
  label,
  options,
  selected,
  onChange,
}: {
  visible: boolean;
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={`overflow-hidden transition-all duration-200 ${
        visible ? "max-h-24 opacity-100" : "max-h-0 opacity-0"
      }`}
    >
      <div className="pl-1 pt-1 pb-1">
        <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
        <div className="flex flex-wrap gap-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                selected.includes(opt.value)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const WIND_DIRECTIONS: { dir: CardinalDirection; row: number; col: number }[] = [
  { dir: "NW", row: 0, col: 0 },
  { dir: "N",  row: 0, col: 1 },
  { dir: "NE", row: 0, col: 2 },
  { dir: "W",  row: 1, col: 0 },
  { dir: "E",  row: 1, col: 2 },
  { dir: "SW", row: 2, col: 0 },
  { dir: "S",  row: 2, col: 1 },
  { dir: "SE", row: 2, col: 2 },
];

function WindDirectionPicker({
  value,
  onChange,
}: {
  value: CardinalDirection[];
  onChange: (directions: CardinalDirection[]) => void;
}) {
  function toggle(dir: CardinalDirection) {
    if (value.includes(dir)) {
      onChange(value.filter(d => d !== dir));
    } else {
      onChange([...value, dir]);
    }
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        Select preferred wind directions.
      </p>
      <div className="grid grid-cols-3 gap-1.5 w-fit">
        {[0, 1, 2].map(row =>
          [0, 1, 2].map(col => {
            const entry = WIND_DIRECTIONS.find(d => d.row === row && d.col === col);
            if (!entry) {
              return (
                <div
                  key={`${row}-${col}`}
                  className="w-10 h-10 flex items-center justify-center"
                >
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                </div>
              );
            }
            const selected = value.includes(entry.dir);
            return (
              <button
                key={entry.dir}
                type="button"
                onClick={() => toggle(entry.dir)}
                className={`w-10 h-10 rounded text-xs font-medium transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {entry.dir}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
