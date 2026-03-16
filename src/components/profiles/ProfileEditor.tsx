"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

const IMPORTANCE_LEVELS = [
  { label: "Low", style: "bg-muted text-muted-foreground" },
  { label: "Med", style: "bg-primary/70 text-primary-foreground" },
  { label: "High", style: "bg-primary text-primary-foreground" },
  { label: "Critical", style: "bg-orange-500 text-white" },
  { label: "Any", style: "bg-muted text-muted-foreground ring-1 ring-border" },
] as const;

export function ProfileEditor({ spotId, profile, onSave, onCancel }: ProfileEditorProps) {
  const [name, setName] = useState(profile?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Categorical selections (multi-select)
  // Use saved selections if available, otherwise fall back to reverse-mapping from numeric
  const sel = profile?.selections;
  const [waveSize, setWaveSize] = useState<string[]>(() => {
    if (sel?.waveSize?.length) return sel.waveSize;
    const cat = profile ? numericToCategory(profile.targetSwellHeight, WAVE_SIZE_MIDPOINTS) : null;
    return cat ? [cat] : [];
  });
  const [swellPeriod, setSwellPeriod] = useState<string[]>(() => {
    if (sel?.swellPeriod?.length) return sel.swellPeriod;
    const cat = profile ? numericToCategory(profile.targetSwellPeriod, SWELL_PERIOD_MIDPOINTS) : null;
    return cat ? [cat] : [];
  });
  const [windCondition, setWindCondition] = useState<string[]>(() => {
    if (sel?.windCondition?.length) return sel.windCondition;
    const cat = profile ? numericToCategory(profile.targetWindSpeed, WIND_SPEED_MIDPOINTS) : null;
    return cat ? [cat] : [];
  });
  const [tideLevel, setTideLevel] = useState<string[]>(() => {
    if (sel?.tideLevel?.length) return sel.tideLevel;
    const cat = profile ? numericToCategory(profile.targetTideHeight, TIDE_HEIGHT_MIDPOINTS) : null;
    return cat ? [cat] : [];
  });
  const [swellDirection, setSwellDirection] = useState<CardinalDirection[]>(() => {
    if (sel?.swellDirection?.length) return sel.swellDirection as CardinalDirection[];
    return profile?.targetSwellDirection != null
      ? [degToCardinal(profile.targetSwellDirection)]
      : [];
  });
  const [windDirection, setWindDirection] = useState<CardinalDirection[]>(() => {
    if (sel?.windDirection?.length) return sel.windDirection as CardinalDirection[];
    return profile?.targetWindDirection != null
      ? [degToCardinal(profile.targetWindDirection)]
      : [];
  });
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
    return {
      targetSwellHeight: waveSize.length > 0 ? avgMidpoints(waveSize, WAVE_SIZE_MIDPOINTS) : null,
      targetSwellPeriod: swellPeriod.length > 0 ? avgMidpoints(swellPeriod, SWELL_PERIOD_MIDPOINTS) : null,
      targetSwellDirection: swellDirection.length > 0 ? avgCardinalDeg(swellDirection) : null,
      targetWindSpeed: windCondition.length > 0 ? avgMidpoints(windCondition, WIND_SPEED_MIDPOINTS) : null,
      targetWindDirection: windDirection.length > 0 ? avgCardinalDeg(windDirection) : null,
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
          selections: {
            waveSize,
            swellPeriod,
            swellDirection,
            windCondition,
            windDirection,
            tideLevel,
          },
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

  function clearPreset() { setActivePreset(null); }

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

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Name + Preset row */}
        <div className="space-y-1.5">
          <label htmlFor="profile-name" className="text-sm font-medium">Profile name</label>
          <Input
            id="profile-name"
            placeholder='e.g. "Winter NW swell"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(WEIGHT_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                activePreset === key
                  ? "border border-primary text-primary bg-primary/10"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* ── Swell ── */}
            <fieldset className="space-y-3 rounded-lg border border-border/50 px-3 py-3">
              <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Swell</legend>

              {/* Wave Size */}
              <ConditionRow label="Size" level={weightToLevel(wSwellHeight)} onLevelChange={(l) => { setWSwellHeight(levelToWeight(l)); clearPreset(); }}>
                <div className="flex flex-wrap gap-1.5">
                  {WAVE_SIZE_OPTIONS.map(opt => (
                    <Pill key={opt.value} active={waveSize.includes(opt.value)} onClick={() => setWaveSize(togglePill(waveSize, opt.value))}>{opt.label}</Pill>
                  ))}
                </div>
              </ConditionRow>

              {/* Swell Period */}
              <ConditionRow label="Period" level={weightToLevel(wSwellPeriod)} onLevelChange={(l) => { setWSwellPeriod(levelToWeight(l)); clearPreset(); }}>
                <div className="flex flex-wrap gap-1.5">
                  {PERIOD_OPTIONS.map(opt => (
                    <Pill key={opt.value} active={swellPeriod.includes(opt.value)} onClick={() => setSwellPeriod(togglePill(swellPeriod, opt.value))}>{opt.label}</Pill>
                  ))}
                </div>
              </ConditionRow>

              {/* Swell Direction */}
              <ConditionRow label="Direction" level={weightToLevel(wSwellDir)} onLevelChange={(l) => { setWSwellDir(levelToWeight(l)); clearPreset(); }}>
                <SwellExposurePicker value={swellDirection} onChange={setSwellDirection} />
              </ConditionRow>
            </fieldset>

            {/* ── Wind ── */}
            <fieldset className="space-y-3 rounded-lg border border-border/50 px-3 py-3">
              <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wind</legend>

              {/* Wind Speed */}
              <ConditionRow label="Speed" level={weightToLevel(wWindSpeed)} onLevelChange={(l) => { setWWindSpeed(levelToWeight(l)); clearPreset(); }}>
                <div className="flex flex-wrap gap-1.5">
                  {WIND_OPTIONS.map(opt => (
                    <Pill key={opt.value} active={windCondition.includes(opt.value)} onClick={() => setWindCondition(togglePill(windCondition, opt.value))}>{opt.label}</Pill>
                  ))}
                </div>
              </ConditionRow>

              {/* Wind Direction */}
              <ConditionRow label="Direction" level={weightToLevel(wWindDir)} onLevelChange={(l) => { setWWindDir(levelToWeight(l)); clearPreset(); }}>
                <SwellExposurePicker value={windDirection} onChange={setWindDirection} />
              </ConditionRow>
            </fieldset>

            {/* ── Tide ── */}
            <fieldset className="space-y-3 rounded-lg border border-border/50 px-3 py-3">
              <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tide</legend>
              <ConditionRow label="Level" level={weightToLevel(wTideHeight)} onLevelChange={(l) => { setWTideHeight(levelToWeight(l)); clearPreset(); }}>
                <div className="flex flex-wrap gap-1.5">
                  {TIDE_OPTIONS.map(opt => (
                    <Pill key={opt.value} active={tideLevel.includes(opt.value)} onClick={() => setTideLevel(togglePill(tideLevel, opt.value))}>{opt.label}</Pill>
                  ))}
                </div>
              </ConditionRow>
            </fieldset>

        {/* Active Months */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Active months <span className="text-muted-foreground/50">(all if none)</span>
          </label>
          <div className="flex flex-wrap gap-1">
            {MONTHS.map(m => (
              <button
                key={m.value}
                onClick={() => toggleMonth(m.value)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
                  activeMonths.includes(m.value)
                    ? "border border-primary text-primary bg-primary/10"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Consistency + Quality — inline row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Consistency</label>
            <div className="flex gap-1">
              {([
                { value: "low", label: "Rare" },
                { value: "medium", label: "Sometimes" },
                { value: "high", label: "Often" },
              ] as const).map(opt => (
                <Pill key={opt.value} active={consistency === opt.value} onClick={() => setConsistency(opt.value)}>{opt.label}</Pill>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Quality ceiling</label>
            <div className="flex gap-1">
              {([
                { value: 1, label: "Poor" },
                { value: 2, label: "Fair" },
                { value: 3, label: "Good" },
                { value: 4, label: "Great" },
                { value: 5, label: "Epic" },
              ] as const).map(opt => (
                <Pill key={opt.value} active={qualityCeiling === opt.value} onClick={() => setQualityCeiling(opt.value)}>{opt.label}</Pill>
              ))}
            </div>
          </div>
        </div>

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

/* ── Compact row: label + cycling importance badge on left, controls below ── */

function ConditionRow({
  label,
  level,
  onLevelChange,
  children,
}: {
  label: string;
  level: number;
  onLevelChange: (level: number) => void;
  children: React.ReactNode;
}) {
  const info = IMPORTANCE_LEVELS[level];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          onClick={() => onLevelChange((level + 1) % 5)}
          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none transition-colors ${info.style}`}
          title="Click to cycle importance"
        >
          {info.label}
        </button>
      </div>
      {children}
    </div>
  );
}

/* ── Reusable pill button ── */

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
        active
          ? "border border-primary text-primary bg-primary/10"
          : "bg-muted text-muted-foreground hover:bg-accent"
      )}
    >
      {children}
    </button>
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
