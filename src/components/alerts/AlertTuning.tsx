"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { ConditionWeights, DEFAULT_CONDITION_WEIGHTS, WEIGHT_PRESETS } from "@/types";
import type { SurfSpot } from "@/lib/db/schema";

export function AlertTuning() {
  const [spots, setSpots] = useState<SurfSpot[]>([]);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [weights, setWeights] = useState<ConditionWeights>(DEFAULT_CONDITION_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>("allAround");

  useEffect(() => {
    fetch("/api/spots")
      .then(r => r.ok ? r.json() : { spots: [] })
      .then(data => {
        setSpots(data.spots || []);
        if (data.spots?.length > 0) {
          setSelectedSpotId(data.spots[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSpotId) return;
    fetch(`/api/spots/${selectedSpotId}/weights`)
      .then(r => r.ok ? r.json() : { weights: DEFAULT_CONDITION_WEIGHTS })
      .then(data => {
        setWeights(data.weights);
        // Detect preset
        const preset = detectPreset(data.weights);
        setActivePreset(preset);
      })
      .catch(console.error);
  }, [selectedSpotId]);

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
    if (selectedSpotId) {
      await saveWeights(newWeights);
    }
  }

  async function saveWeights(w: ConditionWeights = weights) {
    if (!selectedSpotId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/spots/${selectedSpotId}/weights`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(w),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to save alert preferences");
    } finally {
      setSaving(false);
    }
  }

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  function handleWeightChange(key: keyof ConditionWeights, level: number) {
    const value = level === 0 ? 0.3 : level === 1 ? 0.6 : 1.0;
    const newWeights = { ...weights, [key]: value };
    setWeights(newWeights);
    setActivePreset(null);
    // Debounce saves so rapid clicks don't fire many PUT requests
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveWeights(newWeights), 700);
  }

  function weightToLevel(value: number): number {
    if (value <= 0.45) return 0;
    if (value <= 0.8) return 1;
    return 2;
  }

  if (loading) return null;
  if (spots.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="size-5" />
          Alert Tuning
        </CardTitle>
        <CardDescription>
          Configure which conditions matter most for each spot.
          This helps match forecasts to your best sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Spot selector */}
        {spots.length > 1 && (
          <div>
            <label className="text-sm font-medium mb-1.5 block">Spot</label>
            <select
              value={selectedSpotId || ""}
              onChange={e => setSelectedSpotId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {spots.map(spot => (
                <option key={spot.id} value={spot.id}>{spot.name}</option>
              ))}
            </select>
          </div>
        )}

        {spots.length === 1 && (
          <p className="text-sm text-muted-foreground">
            Configuring alerts for <span className="font-medium text-foreground">{spots[0].name}</span>
          </p>
        )}

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

        {/* Advanced customization */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Customize
            {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3">
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
          )}
        </div>
      </CardContent>
    </Card>
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
