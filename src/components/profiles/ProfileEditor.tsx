"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SwellExposurePicker } from "@/components/spots/SwellExposurePicker";
import type { CardinalDirection, ConditionProfileResponse, ExclusionZones, WindSpeedTier } from "@/types";
import { WEIGHT_PRESETS, WIND_SPEED_TIER_THRESHOLDS } from "@/types";
import { WindRose, WindRoseValue } from "@/components/profiles/WindRose";
import {
  WAVE_SIZE_MIDPOINTS,
  SWELL_PERIOD_MIDPOINTS,
  WIND_SPEED_MIDPOINTS,
  TIDE_HEIGHT_MIDPOINTS,
  MONTHS,
  numericToCategory,
} from "@/lib/matching/profile-utils";

export interface DirectionEditRequest {
  field: "swellDirection" | "windDirection" | "excludeSwellDir" | "excludeWindDir";
  selected: CardinalDirection[];
  mode: "target" | "exclusion";
}

interface ProfileEditorProps {
  spotId: string;
  profile?: ConditionProfileResponse;
  defaultName?: string;
  onSave: (profile: ConditionProfileResponse) => void;
  onCancel: () => void;
  /** Request the parent to show direction editing on the map */
  onDirectionEditStart?: (req: DirectionEditRequest) => void;
  onDirectionEditStop?: () => void;
  /** Current direction edit state from the map overlay (for syncing back) */
  directionEditState?: { field: string; selected: CardinalDirection[]; mode: "target" | "exclusion" } | null;
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

export function ProfileEditor({ spotId, profile, defaultName, onSave, onCancel, onDirectionEditStart, onDirectionEditStop, directionEditState }: ProfileEditorProps) {
  const name = defaultName ?? "Profile";
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
  const [windRose, setWindRose] = useState<WindRoseValue>(() => {
    if (sel?.windRose && Object.keys(sel.windRose).length > 0) return sel.windRose;
    // Migrate from old windCondition + windDirection
    if (sel?.windDirection?.length) {
      const tier: WindSpeedTier = sel.windCondition?.includes("offshore") ? "strong"
        : sel.windCondition?.includes("glassy") ? "light" : "moderate";
      const rose: WindRoseValue = {};
      for (const d of sel.windDirection) rose[d as CardinalDirection] = tier;
      return rose;
    }
    return {};
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
  const [activeMonths, setActiveMonths] = useState<number[]>(profile?.activeMonths ?? []);
  const [consistency, setConsistency] = useState<string>(profile?.consistency ?? "medium");
  const [qualityCeiling, setQualityCeiling] = useState<number>(profile?.qualityCeiling ?? 3);

  // Exclusion zones
  const exc = profile?.exclusions;
  const [excludeSwellDir, setExcludeSwellDir] = useState<CardinalDirection[]>(exc?.swellDirection ?? []);
  const [excludeWindDir, setExcludeWindDir] = useState<CardinalDirection[]>(exc?.windDirection ?? []);
  const [excludeWaveSize, setExcludeWaveSize] = useState<string[]>(exc?.swellHeight ?? []);
  const [excludeSwellPeriod, setExcludeSwellPeriod] = useState<string[]>(exc?.swellPeriod ?? []);
  const [excludeWindSpeed, setExcludeWindSpeed] = useState<string[]>(exc?.windSpeed ?? []);
  const [excludeTide, setExcludeTide] = useState<string[]>(exc?.tideHeight ?? []);

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

  const hasSwellExclusion = excludeSwellDir.length > 0 || excludeWaveSize.length > 0 || excludeSwellPeriod.length > 0;
  const hasWindExclusion = excludeWindDir.length > 0 || excludeWindSpeed.length > 0;
  const hasTideExclusion = excludeTide.length > 0;
  const [swellExcOpen, setSwellExcOpen] = useState(hasSwellExclusion);
  const [windExcOpen, setWindExcOpen] = useState(hasWindExclusion);
  const [tideExcOpen, setTideExcOpen] = useState(hasTideExclusion);

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
    // Derive wind targets from windRose
    const roseDirs = Object.keys(windRose) as CardinalDirection[];
    const roseTiers = Object.values(windRose) as WindSpeedTier[];
    const avgWindSpeed = roseTiers.length > 0
      ? roseTiers.reduce((sum, t) => sum + WIND_SPEED_TIER_THRESHOLDS[t], 0) / roseTiers.length
      : null;
    const avgWindDir = roseDirs.length > 0 ? avgCardinalDeg(roseDirs) : null;

    return {
      targetSwellHeight: waveSize.length > 0 ? avgMidpoints(waveSize, WAVE_SIZE_MIDPOINTS) : null,
      targetSwellPeriod: swellPeriod.length > 0 ? avgMidpoints(swellPeriod, SWELL_PERIOD_MIDPOINTS) : null,
      targetSwellDirection: swellDirection.length > 0 ? avgCardinalDeg(swellDirection) : null,
      targetWindSpeed: avgWindSpeed,
      targetWindDirection: avgWindDir,
      targetTideHeight: tideLevel.length > 0 ? avgMidpoints(tideLevel, TIDE_HEIGHT_MIDPOINTS) : null,
    };
  }

  function buildExclusions(): ExclusionZones | null {
    const zones: ExclusionZones = {};
    if (excludeSwellDir.length > 0) zones.swellDirection = excludeSwellDir;
    if (excludeWindDir.length > 0) zones.windDirection = excludeWindDir;
    if (excludeWaveSize.length > 0) zones.swellHeight = excludeWaveSize;
    if (excludeSwellPeriod.length > 0) zones.swellPeriod = excludeSwellPeriod;
    if (excludeWindSpeed.length > 0) zones.windSpeed = excludeWindSpeed;
    if (excludeTide.length > 0) zones.tideHeight = excludeTide;
    return Object.keys(zones).length > 0 ? zones : null;
  }

  // Map direction editing helpers
  function startMapEdit(field: DirectionEditRequest["field"], selected: CardinalDirection[], mode: "target" | "exclusion") {
    onDirectionEditStart?.({ field, selected, mode });
  }

  // Sync direction state from map overlay changes
  useEffect(() => {
    if (!directionEditState) return;
    const { field, selected } = directionEditState;
    switch (field) {
      case "swellDirection": setSwellDirection(selected); break;
      case "excludeSwellDir": setExcludeSwellDir(selected); break;
      case "excludeWindDir": setExcludeWindDir(selected); break;
    }
  }, [directionEditState]);

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
    onDirectionEditStop?.();

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
            windRose,
            // Backward-compat: derive old fields from windRose
            windCondition: Object.keys(windRose).length > 0 ? ["offshore"] : [],
            windDirection: Object.keys(windRose) as CardinalDirection[],
            tideLevel,
          },
          exclusions: buildExclusions(),
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

  function handleCancel() {
    onDirectionEditStop?.();
    onCancel();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b">
        <button onClick={handleCancel} className="rounded-md p-1 hover:bg-accent transition-colors">
          <ArrowLeft className="size-4" />
        </button>
        <h2 className="text-lg font-semibold">
          {profile ? "Edit Profile" : "New Profile"}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
                <div className="flex items-start gap-3">
                  <SwellExposurePicker value={swellDirection} onChange={setSwellDirection} />
                  {onDirectionEditStart && (
                    <button
                      onClick={() => startMapEdit("swellDirection", swellDirection, "target")}
                      className="text-[10px] text-primary hover:underline mt-1 whitespace-nowrap"
                    >
                      Edit on map
                    </button>
                  )}
                </div>
              </ConditionRow>

              {/* Swell — Doesn't work */}
              <ExclusionDropdown
                open={swellExcOpen}
                onToggle={() => setSwellExcOpen(!swellExcOpen)}
                hasExclusions={hasSwellExclusion}
              >
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Direction</span>
                  <div className="flex items-start gap-3">
                    <SwellExposurePicker value={excludeSwellDir} onChange={setExcludeSwellDir} variant="destructive" />
                    {onDirectionEditStart && (
                      <button
                        onClick={() => startMapEdit("excludeSwellDir", excludeSwellDir, "exclusion")}
                        className="text-[10px] text-destructive hover:underline mt-1 whitespace-nowrap"
                      >
                        Edit on map
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Size</span>
                  <div className="flex flex-wrap gap-1.5">
                    {WAVE_SIZE_OPTIONS.map(opt => (
                      <ExclusionPill key={opt.value} active={excludeWaveSize.includes(opt.value)} onClick={() => setExcludeWaveSize(togglePill(excludeWaveSize, opt.value))}>{opt.label}</ExclusionPill>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Period</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PERIOD_OPTIONS.map(opt => (
                      <ExclusionPill key={opt.value} active={excludeSwellPeriod.includes(opt.value)} onClick={() => setExcludeSwellPeriod(togglePill(excludeSwellPeriod, opt.value))}>{opt.label}</ExclusionPill>
                    ))}
                  </div>
                </div>
              </ExclusionDropdown>
            </fieldset>

            {/* ── Wind ── */}
            <fieldset className="space-y-3 rounded-lg border border-border/50 px-3 py-3">
              <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wind</legend>

              {/* Wind Rose — combined direction + speed tolerance */}
              <ConditionRow label="Tolerance" level={weightToLevel(wWindSpeed)} onLevelChange={(l) => { setWWindSpeed(levelToWeight(l)); setWWindDir(levelToWeight(l)); clearPreset(); }}>
                <WindRose value={windRose} onChange={setWindRose} />
              </ConditionRow>

              {/* Wind — Doesn't work */}
              <ExclusionDropdown
                open={windExcOpen}
                onToggle={() => setWindExcOpen(!windExcOpen)}
                hasExclusions={hasWindExclusion}
              >
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Direction</span>
                  <div className="flex items-start gap-3">
                    <SwellExposurePicker value={excludeWindDir} onChange={setExcludeWindDir} variant="destructive" />
                    {onDirectionEditStart && (
                      <button
                        onClick={() => startMapEdit("excludeWindDir", excludeWindDir, "exclusion")}
                        className="text-[10px] text-destructive hover:underline mt-1 whitespace-nowrap"
                      >
                        Edit on map
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Conditions</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[...WIND_OPTIONS, { value: "onshore", label: "Onshore" }].map(opt => (
                      <ExclusionPill key={opt.value} active={excludeWindSpeed.includes(opt.value)} onClick={() => setExcludeWindSpeed(togglePill(excludeWindSpeed, opt.value))}>{opt.label}</ExclusionPill>
                    ))}
                  </div>
                </div>
              </ExclusionDropdown>
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

              {/* Tide — Doesn't work */}
              <ExclusionDropdown
                open={tideExcOpen}
                onToggle={() => setTideExcOpen(!tideExcOpen)}
                hasExclusions={hasTideExclusion}
              >
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Level</span>
                  <div className="flex flex-wrap gap-1.5">
                    {TIDE_OPTIONS.map(opt => (
                      <ExclusionPill key={opt.value} active={excludeTide.includes(opt.value)} onClick={() => setExcludeTide(togglePill(excludeTide, opt.value))}>{opt.label}</ExclusionPill>
                    ))}
                  </div>
                </div>
              </ExclusionDropdown>
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
        <Button variant="outline" className="flex-1" onClick={handleCancel}>Cancel</Button>
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

/* ── Inline exclusion dropdown within a fieldset ── */

function ExclusionDropdown({
  open,
  onToggle,
  hasExclusions,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  hasExclusions: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-destructive/25 overflow-hidden -mx-0.5">
      <button
        type="button"
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-destructive/5 transition-colors"
        onClick={onToggle}
      >
        <ChevronRight className={`size-3 text-destructive/60 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        <span className="text-[11px] font-medium text-destructive/70 flex-1">Doesn&apos;t work</span>
        {!open && hasExclusions && (
          <span className="w-1.5 h-1.5 rounded-full bg-destructive/50" />
        )}
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-2.5 border-t border-destructive/15">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Red exclusion pill ── */

function ExclusionPill({
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
          ? "border border-destructive text-destructive bg-destructive/10"
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
