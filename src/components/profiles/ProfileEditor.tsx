"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import { SwellExposurePicker } from "@/components/spots/SwellExposurePicker";
import type { CardinalDirection, ConditionProfileResponse } from "@/types";
import { WEIGHT_PRESETS } from "@/types";
import {
  WAVE_SIZE_MIDPOINTS,
  SWELL_PERIOD_MIDPOINTS,
  WIND_SPEED_MIDPOINTS,
  TIDE_HEIGHT_MIDPOINTS,
  MONTHS,
  numericToCategory,
} from "@/lib/matching/profile-utils";

interface ProfileEditorProps {
  spotId: string;
  profile?: ConditionProfileResponse;
  onSave: (profile: ConditionProfileResponse) => void;
  onCancel: () => void;
}

const WAVE_SIZE_OPTIONS = [
  { value: "small", label: "Small (<3ft)" },
  { value: "medium", label: "Medium (3-6ft)" },
  { value: "large", label: "Large (6-10ft)" },
  { value: "xl", label: "XL (10ft+)" },
];

const PERIOD_OPTIONS = [
  { value: "short", label: "Short (<8s)" },
  { value: "medium", label: "Medium (8-12s)" },
  { value: "long", label: "Long (12s+)" },
];

const WIND_OPTIONS = [
  { value: "glassy", label: "Light/Glassy" },
  { value: "offshore", label: "Offshore" },
];

const TIDE_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "mid", label: "Mid" },
  { value: "high", label: "High" },
];

// Weight level ↔ numeric value conversions
function weightToLevel(value: number): number {
  if (value === 0) return 4; // Any
  if (value <= 0.45) return 0;
  if (value <= 0.8) return 1;
  if (value <= 1.2) return 2;
  return 3; // Critical
}

function levelToWeight(level: number): number {
  if (level === 0) return 0.3;
  if (level === 1) return 0.6;
  if (level === 2) return 1.0;
  if (level === 3) return 1.5;
  return 0; // Any/idk
}

export function ProfileEditor({ spotId, profile, onSave, onCancel }: ProfileEditorProps) {
  const [name, setName] = useState(profile?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Categorical selections (multi-select)
  const [waveSize, setWaveSize] = useState<string[]>(() => {
    const cat = profile ? numericToCategory(profile.targetSwellHeight, WAVE_SIZE_MIDPOINTS) : null;
    return cat ? [cat] : [];
  });
  const [swellPeriod, setSwellPeriod] = useState<string[]>(() => {
    const cat = profile ? numericToCategory(profile.targetSwellPeriod, SWELL_PERIOD_MIDPOINTS) : null;
    return cat ? [cat] : [];
  });
  const [windCondition, setWindCondition] = useState<string[]>(() => {
    const cat = profile ? numericToCategory(profile.targetWindSpeed, WIND_SPEED_MIDPOINTS) : null;
    return cat ? [cat] : [];
  });
  const [tideLevel, setTideLevel] = useState<string[]>(() => {
    const cat = profile ? numericToCategory(profile.targetTideHeight, TIDE_HEIGHT_MIDPOINTS) : null;
    return cat ? [cat] : [];
  });
  const [swellDirection, setSwellDirection] = useState<CardinalDirection[]>(
    profile?.targetSwellDirection != null
      ? [degToCardinal(profile.targetSwellDirection)]
      : []
  );
  const [activeMonths, setActiveMonths] = useState<number[]>(profile?.activeMonths ?? []);
  const [consistency, setConsistency] = useState<string>(profile?.consistency ?? "medium");
  const [qualityCeiling, setQualityCeiling] = useState<number>(profile?.qualityCeiling ?? 3);

  // Importance weights
  const [wSwellHeight, setWSwellHeight] = useState(profile?.weightSwellHeight ?? 0.8);
  const [wSwellPeriod, setWSwellPeriod] = useState(profile?.weightSwellPeriod ?? 0.7);
  const [wSwellDir, setWSwellDir] = useState(profile?.weightSwellDirection ?? 0.9);
  const [wWindSpeed, setWWindSpeed] = useState(profile?.weightWindSpeed ?? 0.7);
  const [wWindDir, setWWindDir] = useState(profile?.weightWindDirection ?? 0.6);
  const [wTideHeight, setWTideHeight] = useState(profile?.weightTideHeight ?? 0.5);
  const [wWaveEnergy, setWWaveEnergy] = useState(profile?.weightWaveEnergy ?? 0.8);

  // Spot type preset
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Advanced overrides
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advSwellHeight, setAdvSwellHeight] = useState(profile?.targetSwellHeight?.toString() ?? "");
  const [advSwellPeriod, setAdvSwellPeriod] = useState(profile?.targetSwellPeriod?.toString() ?? "");
  const [advSwellDir, setAdvSwellDir] = useState(profile?.targetSwellDirection?.toString() ?? "");
  const [advWindSpeed, setAdvWindSpeed] = useState(profile?.targetWindSpeed?.toString() ?? "");
  const [advWindDir, setAdvWindDir] = useState(profile?.targetWindDirection?.toString() ?? "");
  const [advTideHeight, setAdvTideHeight] = useState(profile?.targetTideHeight?.toString() ?? "");

  function togglePill<T extends string>(current: T[], value: T): T[] {
    return current.includes(value) ? current.filter(v => v !== value) : [...current, value];
  }

  function toggleMonth(month: number) {
    setActiveMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
    );
  }

  function applyPreset(presetKey: string) {
    const preset = WEIGHT_PRESETS[presetKey];
    if (!preset) return;
    const w = preset.weights;
    if (w.swellHeight != null) setWSwellHeight(w.swellHeight);
    if (w.swellPeriod != null) setWSwellPeriod(w.swellPeriod);
    if (w.swellDirection != null) setWSwellDir(w.swellDirection);
    if (w.tideHeight != null) setWTideHeight(w.tideHeight);
    if (w.windSpeed != null) setWWindSpeed(w.windSpeed);
    if (w.windDirection != null) setWWindDir(w.windDirection);
    if (w.waveEnergy != null) setWWaveEnergy(w.waveEnergy);
    setActivePreset(presetKey);
  }

  function buildTargets() {
    if (showAdvanced) {
      return {
        targetSwellHeight: advSwellHeight ? parseFloat(advSwellHeight) : null,
        targetSwellPeriod: advSwellPeriod ? parseFloat(advSwellPeriod) : null,
        targetSwellDirection: advSwellDir ? parseFloat(advSwellDir) : null,
        targetWindSpeed: advWindSpeed ? parseFloat(advWindSpeed) : null,
        targetWindDirection: advWindDir ? parseFloat(advWindDir) : null,
        targetTideHeight: advTideHeight ? parseFloat(advTideHeight) : null,
      };
    }

    return {
      targetSwellHeight: waveSize.length > 0 ? avgMidpoints(waveSize, WAVE_SIZE_MIDPOINTS) : null,
      targetSwellPeriod: swellPeriod.length > 0 ? avgMidpoints(swellPeriod, SWELL_PERIOD_MIDPOINTS) : null,
      targetSwellDirection: swellDirection.length > 0 ? avgCardinalDeg(swellDirection) : null,
      targetWindSpeed: windCondition.length > 0 ? avgMidpoints(windCondition, WIND_SPEED_MIDPOINTS) : null,
      targetWindDirection: null,
      targetTideHeight: tideLevel.length > 0 ? avgMidpoints(tideLevel, TIDE_HEIGHT_MIDPOINTS) : null,
    };
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const targets = buildTargets();
    const specifiedCount = Object.values(targets).filter(v => v != null).length;
    if (specifiedCount < 2) {
      setError("Set at least 2 conditions");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = profile
        ? `/api/spots/${spotId}/profiles/${profile.id}`
        : `/api/spots/${spotId}/profiles`;

      const res = await fetch(url, {
        method: profile ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...targets,
          activeMonths: activeMonths.length > 0 ? activeMonths : null,
          consistency,
          qualityCeiling,
          weightSwellHeight: wSwellHeight,
          weightSwellPeriod: wSwellPeriod,
          weightSwellDirection: wSwellDir,
          weightTideHeight: wTideHeight,
          weightWindSpeed: wWindSpeed,
          weightWindDirection: wWindDir,
          weightWaveEnergy: wWaveEnergy,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      const data = await res.json();
      onSave(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b">
        <button onClick={onCancel} className="rounded-md p-1 hover:bg-accent transition-colors">
          <ArrowLeft className="size-4" />
        </button>
        <h2 className="text-lg font-semibold">
          {profile ? "Edit Profile" : "New Profile"}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Profile name</Label>
          <Input
            id="profile-name"
            placeholder='e.g. "Winter NW swell"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Spot type presets */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Spot type preset</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(WEIGHT_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activePreset === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {!showAdvanced && (
          <>
            {/* Wave Size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-muted-foreground">Wave size</label>
                <ImportanceDots value={weightToLevel(wSwellHeight)} onChange={(level) => { setWSwellHeight(levelToWeight(level)); setActivePreset(null); }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {WAVE_SIZE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setWaveSize(togglePill(waveSize, opt.value))}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      waveSize.includes(opt.value)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Swell Period */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-muted-foreground">Swell period</label>
                <ImportanceDots value={weightToLevel(wSwellPeriod)} onChange={(level) => { setWSwellPeriod(levelToWeight(level)); setActivePreset(null); }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {PERIOD_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSwellPeriod(togglePill(swellPeriod, opt.value))}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      swellPeriod.includes(opt.value)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Swell Direction */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-muted-foreground">Swell direction</label>
                <ImportanceDots value={weightToLevel(wSwellDir)} onChange={(level) => { setWSwellDir(levelToWeight(level)); setActivePreset(null); }} />
              </div>
              <SwellExposurePicker
                value={swellDirection}
                onChange={setSwellDirection}
              />
            </div>

            {/* Wind */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-muted-foreground">Wind</label>
                <ImportanceDots value={weightToLevel(wWindSpeed)} onChange={(level) => { setWWindSpeed(levelToWeight(level)); setActivePreset(null); }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {WIND_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setWindCondition(togglePill(windCondition, opt.value))}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      windCondition.includes(opt.value)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tide */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-muted-foreground">Tide</label>
                <ImportanceDots value={weightToLevel(wTideHeight)} onChange={(level) => { setWTideHeight(levelToWeight(level)); setActivePreset(null); }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {TIDE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTideLevel(togglePill(tideLevel, opt.value))}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      tideLevel.includes(opt.value)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Active Months */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Active months <span className="text-xs text-muted-foreground/60">(all if none selected)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MONTHS.map(m => (
              <button
                key={m.value}
                onClick={() => toggleMonth(m.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeMonths.includes(m.value)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Consistency */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Consistency <span className="text-xs text-muted-foreground/60">(how often conditions align)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {([
              { value: "low", label: "Rare" },
              { value: "medium", label: "Sometimes" },
              { value: "high", label: "Often" },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setConsistency(opt.value)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  consistency === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quality Ceiling */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Quality ceiling <span className="text-xs text-muted-foreground/60">(how good when it works)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {([
              { value: 1, label: "Poor" },
              { value: 2, label: "Fair" },
              { value: 3, label: "Good" },
              { value: 4, label: "Great" },
              { value: 5, label: "Epic" },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setQualityCeiling(opt.value)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  qualityCeiling === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAdvanced ? "Use simple mode" : "Advanced: set exact values"}
        </button>

        {showAdvanced && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Swell height (m)</Label>
                <Input type="number" step="0.1" value={advSwellHeight} onChange={e => setAdvSwellHeight(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Swell period (s)</Label>
                <Input type="number" step="0.5" value={advSwellPeriod} onChange={e => setAdvSwellPeriod(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Swell direction (deg)</Label>
                <Input type="number" step="1" value={advSwellDir} onChange={e => setAdvSwellDir(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Wind speed (km/h)</Label>
                <Input type="number" step="1" value={advWindSpeed} onChange={e => setAdvWindSpeed(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Wind direction (deg)</Label>
                <Input type="number" step="1" value={advWindDir} onChange={e => setAdvWindDir(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tide height (ft)</Label>
                <Input type="number" step="0.1" value={advTideHeight} onChange={e => setAdvTideHeight(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>

      <div className="px-4 py-3 border-t flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : profile ? "Save" : "Create"}
        </Button>
      </div>
    </div>
  );
}

function ImportanceDots({
  value,
  onChange,
}: {
  value: number; // 0 = low, 1 = medium, 2 = high, 3 = critical, 4 = any/idk
  onChange: (level: number) => void;
}) {
  const labels = ["Low", "Med", "High", "Critical", "Any"];

  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3, 4].map(level => {
        const isActive = value === level;
        const levelLabel = labels[level];
        return (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              isActive
                ? level === 3
                  ? "bg-orange-500 text-white"
                  : level === 4
                    ? "bg-muted text-muted-foreground ring-1 ring-border"
                    : "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
            }`}
            title={`Priority: ${levelLabel}`}
          >
            {levelLabel}
          </button>
        );
      })}
    </div>
  );
}

const CARDINAL_DEGREES: Record<CardinalDirection, number> = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315,
};

function cardinalToDeg(dir: CardinalDirection): number {
  return CARDINAL_DEGREES[dir];
}

function degToCardinal(deg: number): CardinalDirection {
  const dirs: CardinalDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

function avgMidpoints(keys: string[], midpoints: Record<string, number>): number {
  const values = keys.map(k => midpoints[k]).filter(v => v != null);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function avgCardinalDeg(dirs: CardinalDirection[]): number {
  if (dirs.length === 1) return cardinalToDeg(dirs[0]);
  // Circular average to handle 0°/360° boundary
  let sinSum = 0, cosSum = 0;
  for (const d of dirs) {
    const rad = cardinalToDeg(d) * Math.PI / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  return ((Math.atan2(sinSum, cosSum) * 180 / Math.PI) + 360) % 360;
}
