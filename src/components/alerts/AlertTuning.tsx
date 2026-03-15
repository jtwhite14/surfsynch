"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ConditionWeights, DEFAULT_CONDITION_WEIGHTS, WEIGHT_PRESETS } from "@/types";

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
        setWeights(data.weights);
        setActivePreset(detectPreset(data.weights));
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

  function handleWeightChange(key: keyof ConditionWeights, level: number) {
    const value = level === 0 ? 0.3 : level === 1 ? 0.6 : 1.0;
    const newWeights = { ...weights, [key]: value };
    setWeights(newWeights);
    setActivePreset(null);
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveWeights(newWeights), 700);
  }

  function weightToLevel(value: number): number {
    if (value <= 0.45) return 0;
    if (value <= 0.8) return 1;
    return 2;
  }

  if (loading) {
    return <div className="py-2 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-3">
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
      <div className="space-y-3">
        <label className="text-sm font-medium block">Customize</label>
        <WeightRow
          label="How important is wave size?"
          value={weightToLevel(weights.swellHeight)}
          onChange={level => handleWeightChange("swellHeight", level)}
        />
        <WeightRow
          label="How important is swell period?"
          value={weightToLevel(weights.swellPeriod)}
          onChange={level => handleWeightChange("swellPeriod", level)}
        />
        <WeightRow
          label="How important is swell direction?"
          value={weightToLevel(weights.swellDirection)}
          onChange={level => handleWeightChange("swellDirection", level)}
        />
        <WeightRow
          label="How important is wind?"
          value={weightToLevel(weights.windSpeed)}
          onChange={level => handleWeightChange("windSpeed", level)}
        />
        <WeightRow
          label="How important is wind direction?"
          value={weightToLevel(weights.windDirection)}
          onChange={level => handleWeightChange("windDirection", level)}
        />
        <WeightRow
          label="How important is tide?"
          value={weightToLevel(weights.tideHeight)}
          onChange={level => handleWeightChange("tideHeight", level)}
        />
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
    <div>
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
