"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { TideCurveSelector } from "@/components/profiles/TideCurveSelector";
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

export interface WizardDirectionEditRequest {
  field: "swellDirection" | "windDirection" | "excludeSwellDir" | "excludeWindDir";
  selected: CardinalDirection[];
  mode: "target" | "exclusion";
}

interface ProfileWizardProps {
  spotId: string;
  profile?: ConditionProfileResponse;
  defaultName?: string;
  onSave: (profile: ConditionProfileResponse) => void;
  onCancel: () => void;
  onDirectionEditStart?: (req: WizardDirectionEditRequest) => void;
  onDirectionEditStop?: () => void;
  directionEditState?: { field: string; selected: CardinalDirection[]; mode: "target" | "exclusion" } | null;
}

const WAVE_SIZE_OPTIONS = [
  { value: "small", label: "Small (<3ft)" },
  { value: "medium", label: "Medium (3-6ft)" },
  { value: "large", label: "Large (6-10ft)" },
  { value: "xl", label: "XL (10ft+)" },
];

// Wave height slider: 0-20ft, with 20 meaning "20ft+"
const WAVE_HEIGHT_MIN = 0;
const WAVE_HEIGHT_MAX = 20;
const WAVE_HEIGHT_STEP = 1;

function feetToMeters(ft: number): number {
  return ft * 0.3048;
}

function metersToFeet(m: number): number {
  return m / 0.3048;
}

function formatWaveHeight(ft: number, isMax: boolean): string {
  if (isMax && ft >= WAVE_HEIGHT_MAX) return "Any";
  return `${ft}ft`;
}

// Swell period slider: 0-25s, with 25 meaning "25s+"
const PERIOD_MIN = 0;
const PERIOD_MAX = 25;
const PERIOD_STEP = 1;

function formatPeriod(s: number, isMax: boolean): string {
  if (isMax && s >= PERIOD_MAX) return "Any";
  return `${s}s`;
}

// Map tide curve segments to an average tide height for the legacy targetTideHeight field.
// Segments 0,11 = low (-0.5), 5,6 = high (0.5), linear interpolation between.
const SEGMENT_HEIGHTS = [
  -0.5, -0.33, -0.17, 0, 0.17, 0.33, 0.5, 0.33, 0.17, 0, -0.17, -0.33,
];
function tideCurveToHeight(segments: boolean[]): number {
  let sum = 0, count = 0;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i]) { sum += SEGMENT_HEIGHTS[i]; count++; }
  }
  return count > 0 ? sum / count : 0;
}

const PERIOD_OPTIONS = [
  { value: "short", label: "Short (<8s)" },
  { value: "medium", label: "Medium (8-12s)" },
  { value: "long", label: "Long (12s+)" },
];

const WIND_OPTIONS = [
  { value: "glassy", label: "Light/Glassy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const TIDE_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "mid", label: "Mid" },
  { value: "high", label: "High" },
];

const IMPORTANCE_LEVELS = [
  { label: "Low", style: "bg-muted text-muted-foreground" },
  { label: "Med", style: "bg-primary/70 text-primary-foreground" },
  { label: "High", style: "bg-primary text-primary-foreground" },
  { label: "Critical", style: "bg-orange-500 text-white" },
  { label: "Any", style: "bg-muted text-muted-foreground ring-1 ring-border" },
] as const;

function weightToLevel(value: number): number {
  if (value === 0) return 4;
  if (value <= 0.45) return 0;
  if (value <= 0.8) return 1;
  if (value <= 1.2) return 2;
  return 3;
}

function levelToWeight(level: number): number {
  if (level === 0) return 0.3;
  if (level === 1) return 0.6;
  if (level === 2) return 1.0;
  if (level === 3) return 1.5;
  return 0;
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
  let sinSum = 0, cosSum = 0;
  for (const d of dirs) {
    const rad = cardinalToDeg(d) * Math.PI / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  return ((Math.atan2(sinSum, cosSum) * 180 / Math.PI) + 360) % 360;
}

type Step =
  | "preset"
  | "waveSize"
  | "exc_waveSize"
  | "swellPeriod"
  | "exc_swellPeriod"
  | "swellDirection"
  | "exc_swellDirection"
  | "wind"
  | "exc_windSpeed"
  | "exc_windDirection"
  | "tide"
  | "exc_tide"
  | "season"
  | "exc_season"
  | "quality";

const BASE_STEPS: Step[] = [
  "preset",
  "waveSize",
  "exc_waveSize",
  "swellPeriod",
  "exc_swellPeriod",
  "swellDirection",
  "exc_swellDirection",
  "wind",
  "exc_windSpeed",
  "exc_windDirection",
  "tide",
  "exc_tide",
  "season",
  "exc_season",
  "quality",
];

// Exclusion steps that can be skipped
const EXCLUSION_STEPS = new Set<Step>([
  "exc_waveSize", "exc_swellPeriod", "exc_swellDirection",
  "exc_windSpeed", "exc_windDirection", "exc_tide", "exc_season",
]);

const STEP_QUESTIONS: Record<Step, string> = {
  preset: "What type of break is this?",
  waveSize: "What size waves work here?",
  exc_waveSize: "What wave sizes don't work?",
  swellPeriod: "What swell period is ideal?",
  exc_swellPeriod: "What swell periods don't work?",
  swellDirection: "What direction should the swell come from?",
  exc_swellDirection: "What swell directions don't work?",
  wind: "How much wind can each direction handle?",
  exc_windSpeed: "What wind conditions don't work?",
  exc_windDirection: "What wind directions don't work?",
  tide: "What tide levels work?",
  exc_tide: "What tide levels don't work?",
  season: "When does this spot work best?",
  exc_season: "What months don't work?",
  quality: "How would you describe this spot?",
};

export function ProfileWizard({
  spotId,
  profile,
  defaultName,
  onSave,
  onCancel,
  onDirectionEditStart,
  onDirectionEditStop,
  directionEditState,
}: ProfileWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state — name is auto-generated (e.g. "Profile 1")
  const name = defaultName ?? "Profile";

  const sel = profile?.selections;
  const [waveSize, setWaveSize] = useState<string[]>(() => {
    if (sel?.waveSize?.length) return sel.waveSize;
    const cat = profile ? numericToCategory(profile.targetSwellHeight, WAVE_SIZE_MIDPOINTS) : null;
    return cat ? [cat] : [];
  });
  const [waveSizeRange, setWaveSizeRange] = useState<[number, number]>(() => {
    if (sel?.waveSizeRange) {
      return [sel.waveSizeRange.min, sel.waveSizeRange.max ?? WAVE_HEIGHT_MAX];
    }
    // Derive from existing categorical selections or target value
    if (sel?.waveSize?.length) {
      const ranges: Record<string, [number, number]> = { small: [0, 3], medium: [3, 6], large: [6, 10], xl: [10, 20] };
      let min = 20, max = 0;
      for (const s of sel.waveSize) {
        const r = ranges[s];
        if (r) { min = Math.min(min, r[0]); max = Math.max(max, r[1]); }
      }
      return [min, max];
    }
    if (profile?.targetSwellHeight != null) {
      const ft = Math.round(metersToFeet(profile.targetSwellHeight));
      return [Math.max(0, ft - 2), Math.min(WAVE_HEIGHT_MAX, ft + 2)];
    }
    return [2, 8]; // sensible default
  });
  const [swellPeriod, setSwellPeriod] = useState<string[]>(() => {
    if (sel?.swellPeriod?.length) return sel.swellPeriod;
    const cat = profile ? numericToCategory(profile.targetSwellPeriod, SWELL_PERIOD_MIDPOINTS) : null;
    return cat ? [cat] : [];
  });
  const [swellPeriodRange, setSwellPeriodRange] = useState<[number, number]>(() => {
    if (sel?.swellPeriodRange) {
      return [sel.swellPeriodRange.min, sel.swellPeriodRange.max ?? PERIOD_MAX];
    }
    if (sel?.swellPeriod?.length) {
      const ranges: Record<string, [number, number]> = { short: [0, 8], medium: [8, 12], long: [12, 25] };
      let min = 25, max = 0;
      for (const s of sel.swellPeriod) {
        const r = ranges[s];
        if (r) { min = Math.min(min, r[0]); max = Math.max(max, r[1]); }
      }
      return [min, max];
    }
    if (profile?.targetSwellPeriod != null) {
      const s = Math.round(profile.targetSwellPeriod);
      return [Math.max(0, s - 3), Math.min(PERIOD_MAX, s + 3)];
    }
    return [8, 16]; // sensible default
  });
  const [windRose, setWindRose] = useState<WindRoseValue>(() => {
    if (sel?.windRose && Object.keys(sel.windRose).length > 0) return sel.windRose;
    // Migrate from old windCondition + windDirection
    if (sel?.windDirection?.length) {
      const tier: WindSpeedTier = sel.windCondition?.includes("hard") ? "strong"
        : sel.windCondition?.includes("medium") ? "moderate"
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
    return profile?.targetSwellDirection != null ? [degToCardinal(profile.targetSwellDirection)] : [];
  });
  const [tideCurveSegments, setTideCurveSegments] = useState<boolean[]>(() => {
    if (sel?.tideCurve?.segments) return sel.tideCurve.segments;
    // Migrate from old tideLevel pills
    if (sel?.tideLevel?.length) {
      const segs = Array(12).fill(false);
      for (const level of sel.tideLevel) {
        if (level === "low") { segs[0] = segs[1] = segs[10] = segs[11] = true; }
        if (level === "mid") { segs[2] = segs[3] = segs[4] = segs[7] = segs[8] = segs[9] = true; }
        if (level === "high") { segs[5] = segs[6] = true; }
      }
      return segs;
    }
    return Array(12).fill(false);
  });
  const [activeMonths, setActiveMonths] = useState<number[]>(profile?.activeMonths ?? []);
  const [consistency, setConsistency] = useState<string>(profile?.consistency ?? "medium");
  const [qualityCeiling, setQualityCeiling] = useState<number>(profile?.qualityCeiling ?? 3);

  // Exclusion zones
  const exc = profile?.exclusions;
  const [excludeSwellDir, setExcludeSwellDir] = useState<CardinalDirection[]>(exc?.swellDirection ?? []);
  const [excludeWindDir, setExcludeWindDir] = useState<CardinalDirection[]>(exc?.windDirection ?? []);
  const [excludeWaveSize, setExcludeWaveSize] = useState<string[]>(exc?.swellHeight ?? []);
  const [excludeWaveSizeRange, setExcludeWaveSizeRange] = useState<[number, number]>(() => {
    if (exc?.swellHeightRange) return [exc.swellHeightRange.min, exc.swellHeightRange.max ?? WAVE_HEIGHT_MAX];
    return [0, 2];
  });
  const [excludeSwellPeriod, setExcludeSwellPeriod] = useState<string[]>(exc?.swellPeriod ?? []);
  const [excludePeriodRange, setExcludePeriodRange] = useState<[number, number]>(() => {
    if (exc?.swellPeriodRange) return [exc.swellPeriodRange.min, exc.swellPeriodRange.max ?? PERIOD_MAX];
    return [0, 6];
  });
  const [excludeWindSpeed, setExcludeWindSpeed] = useState<string[]>(exc?.windSpeed ?? []);
  const [excludeTide, setExcludeTide] = useState<string[]>(exc?.tideHeight ?? []);
  const [excludeTideCurveSegments, setExcludeTideCurveSegments] = useState<boolean[]>(() => {
    if (exc?.tideCurve?.segments) return exc.tideCurve.segments;
    return Array(12).fill(false);
  });
  const [excludeMonths, setExcludeMonths] = useState<number[]>([]);

  // Importance weights
  const [wSwellHeight, setWSwellHeight] = useState(profile?.weightSwellHeight ?? 0.8);
  const [wSwellPeriod, setWSwellPeriod] = useState(profile?.weightSwellPeriod ?? 0.7);
  const [wSwellDir, setWSwellDir] = useState(profile?.weightSwellDirection ?? 0.9);
  const [wWindSpeed, setWWindSpeed] = useState(profile?.weightWindSpeed ?? 0.7);
  const [wWindDir, setWWindDir] = useState(profile?.weightWindDirection ?? 0.6);
  const [wTideHeight, setWTideHeight] = useState(profile?.weightTideHeight ?? 0.5);
  const [wWaveEnergy, setWWaveEnergy] = useState(profile?.weightWaveEnergy ?? 0.8);

  const [activePreset, setActivePreset] = useState<string | null>(null);

  const steps = BASE_STEPS;
  const currentStep = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const isCompassStep = currentStep === "swellDirection"
    || currentStep === "exc_swellDirection" || currentStep === "exc_windDirection";
  const isExclusionStep = EXCLUSION_STEPS.has(currentStep);
  const isSkippable = !isLast;

  // Toggle helpers
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

  // Direction editing
  const startCompass = useCallback((step: Step) => {
    if (!onDirectionEditStart) return;
    if (step === "swellDirection") {
      onDirectionEditStart({ field: "swellDirection", selected: swellDirection, mode: "target" });
    } else if (step === "exc_swellDirection") {
      onDirectionEditStart({ field: "excludeSwellDir", selected: excludeSwellDir, mode: "exclusion" });
    } else if (step === "exc_windDirection") {
      onDirectionEditStart({ field: "excludeWindDir", selected: excludeWindDir, mode: "exclusion" });
    }
  }, [onDirectionEditStart, swellDirection, excludeSwellDir, excludeWindDir]);

  // Activate compass when entering a compass step
  useEffect(() => {
    if (isCompassStep) {
      startCompass(currentStep);
    } else {
      onDirectionEditStop?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Sync direction state from map overlay
  useEffect(() => {
    if (!directionEditState) return;
    const { field, selected } = directionEditState;
    if (field === "swellDirection") setSwellDirection(selected);
    if (field === "excludeSwellDir") setExcludeSwellDir(selected);
    if (field === "excludeWindDir") setExcludeWindDir(selected);
  }, [directionEditState]);

  function goNext() {
    if (isLast) return;
    setError(null);
    setStepIndex(prev => prev + 1);
  }

  function goBack() {
    if (isFirst) return;
    setError(null);
    setStepIndex(prev => prev - 1);
  }

  function buildExclusions(): ExclusionZones | null {
    const zones: ExclusionZones = {};
    if (excludeSwellDir.length > 0) zones.swellDirection = excludeSwellDir;
    if (excludeWindDir.length > 0) zones.windDirection = excludeWindDir;
    if (excludeWaveSize.length > 0) zones.swellHeight = excludeWaveSize;
    if (excludeWaveSizeRange) {
      zones.swellHeightRange = {
        min: excludeWaveSizeRange[0],
        max: excludeWaveSizeRange[1] >= WAVE_HEIGHT_MAX ? null : excludeWaveSizeRange[1],
      };
    }
    if (excludeSwellPeriod.length > 0) zones.swellPeriod = excludeSwellPeriod;
    if (excludePeriodRange) {
      zones.swellPeriodRange = {
        min: excludePeriodRange[0],
        max: excludePeriodRange[1] >= PERIOD_MAX ? null : excludePeriodRange[1],
      };
    }
    if (excludeWindSpeed.length > 0) zones.windSpeed = excludeWindSpeed;
    if (excludeTide.length > 0) zones.tideHeight = excludeTide;
    if (excludeTideCurveSegments.some(Boolean)) zones.tideCurve = { segments: excludeTideCurveSegments };
    return Object.keys(zones).length > 0 ? zones : null;
  }

  async function handleSave() {
    const saveName = name;

    // Compute target swell height from range slider (midpoint in meters)
    const rangeMax = waveSizeRange[1] >= WAVE_HEIGHT_MAX ? waveSizeRange[1] + 5 : waveSizeRange[1]; // treat 20 as ~25ft for midpoint
    const rangeMidFt = (waveSizeRange[0] + rangeMax) / 2;

    // Compute target swell period from range slider (midpoint in seconds)
    const periodMax = swellPeriodRange[1] >= PERIOD_MAX ? swellPeriodRange[1] + 5 : swellPeriodRange[1];
    const periodMid = (swellPeriodRange[0] + periodMax) / 2;

    const targets = {
      targetSwellHeight: feetToMeters(rangeMidFt),
      targetSwellPeriod: periodMid,
      targetSwellDirection: swellDirection.length > 0 ? avgCardinalDeg(swellDirection) : null,
      targetWindSpeed: (() => {
        const tiers = Object.values(windRose) as WindSpeedTier[];
        return tiers.length > 0
          ? tiers.reduce((sum, t) => sum + WIND_SPEED_TIER_THRESHOLDS[t], 0) / tiers.length
          : null;
      })(),
      targetWindDirection: (() => {
        const dirs = Object.keys(windRose) as CardinalDirection[];
        return dirs.length > 0 ? avgCardinalDeg(dirs) : null;
      })(),
      targetTideHeight: tideCurveSegments.some(Boolean)
        ? tideCurveToHeight(tideCurveSegments)
        : tideLevel.length > 0 ? avgMidpoints(tideLevel, TIDE_HEIGHT_MIDPOINTS) : null,
    };

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
          name: saveName,
          ...targets,
          selections: {
            waveSize,
            waveSizeRange: {
              min: waveSizeRange[0],
              max: waveSizeRange[1] >= WAVE_HEIGHT_MAX ? null : waveSizeRange[1],
            },
            swellPeriod,
            swellPeriodRange: {
              min: swellPeriodRange[0],
              max: swellPeriodRange[1] >= PERIOD_MAX ? null : swellPeriodRange[1],
            },
            swellDirection,
            windRose,
            // Backward-compat: derive old fields from windRose
            windCondition: Object.keys(windRose).length > 0 ? ["offshore"] : [],
            windDirection: Object.keys(windRose) as CardinalDirection[],
            tideLevel,
            tideCurve: tideCurveSegments.some(Boolean)
              ? { segments: tideCurveSegments }
              : undefined,
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

  function handleCancel() {
    onDirectionEditStop?.();
    onCancel();
  }

  // Render the step content
  function renderStepContent() {
    switch (currentStep) {
      case "preset":
        return (
          <div className="flex flex-wrap gap-2">
            {Object.entries(WEIGHT_PRESETS).map(([key, preset]) => (
              <WizardPill
                key={key}
                active={activePreset === key}
                onClick={() => applyPreset(key)}
              >
                {preset.label}
              </WizardPill>
            ))}
          </div>
        );

      case "waveSize":
        return (
          <StepWithImportance
            level={weightToLevel(wSwellHeight)}
            onLevelChange={(l) => setWSwellHeight(levelToWeight(l))}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm font-medium">
                <span className="text-primary">{formatWaveHeight(waveSizeRange[0], false)}</span>
                <span className="text-muted-foreground">to</span>
                <span className="text-primary">{formatWaveHeight(waveSizeRange[1], true)}</span>
              </div>
              <Slider
                min={WAVE_HEIGHT_MIN}
                max={WAVE_HEIGHT_MAX}
                step={WAVE_HEIGHT_STEP}
                value={waveSizeRange}
                onValueChange={(v) => setWaveSizeRange(v as [number, number])}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0ft</span>
                <span>5ft</span>
                <span>10ft</span>
                <span>15ft</span>
                <span>20ft+</span>
              </div>
            </div>
          </StepWithImportance>
        );

      case "swellPeriod":
        return (
          <StepWithImportance
            level={weightToLevel(wSwellPeriod)}
            onLevelChange={(l) => setWSwellPeriod(levelToWeight(l))}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm font-medium">
                <span className="text-primary">{formatPeriod(swellPeriodRange[0], false)}</span>
                <span className="text-muted-foreground">to</span>
                <span className="text-primary">{formatPeriod(swellPeriodRange[1], true)}</span>
              </div>
              <Slider
                min={PERIOD_MIN}
                max={PERIOD_MAX}
                step={PERIOD_STEP}
                value={swellPeriodRange}
                onValueChange={(v) => setSwellPeriodRange(v as [number, number])}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0s</span>
                <span>5s</span>
                <span>10s</span>
                <span>15s</span>
                <span>20s</span>
                <span>25s+</span>
              </div>
            </div>
          </StepWithImportance>
        );

      case "swellDirection":
        return (
          <StepWithImportance
            level={weightToLevel(wSwellDir)}
            onLevelChange={(l) => setWSwellDir(levelToWeight(l))}
          >
            <p className="text-xs text-muted-foreground">
              Tap the compass wedges on the map to select directions
            </p>
            {swellDirection.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {swellDirection.map(d => (
                  <span key={d} className="px-2 py-0.5 rounded-full text-xs font-medium border border-primary text-primary bg-primary/10">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </StepWithImportance>
        );

      case "wind":
        return (
          <StepWithImportance
            level={weightToLevel(wWindSpeed)}
            onLevelChange={(l) => { setWWindSpeed(levelToWeight(l)); setWWindDir(levelToWeight(l)); }}
          >
            <WindRose value={windRose} onChange={setWindRose} />
          </StepWithImportance>
        );

      case "tide":
        return (
          <StepWithImportance
            level={weightToLevel(wTideHeight)}
            onLevelChange={(l) => setWTideHeight(levelToWeight(l))}
          >
            <TideCurveSelector
              segments={tideCurveSegments}
              onChange={setTideCurveSegments}
              mode="target"
            />
          </StepWithImportance>
        );

      // ── Exclusion steps ──
      case "exc_waveSize":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="text-destructive">{formatWaveHeight(excludeWaveSizeRange[0], false)}</span>
              <span className="text-muted-foreground">to</span>
              <span className="text-destructive">{formatWaveHeight(excludeWaveSizeRange[1], true)}</span>
            </div>
            <Slider
              min={WAVE_HEIGHT_MIN}
              max={WAVE_HEIGHT_MAX}
              step={WAVE_HEIGHT_STEP}
              value={excludeWaveSizeRange}
              onValueChange={(v) => setExcludeWaveSizeRange(v as [number, number])}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0ft</span>
              <span>5ft</span>
              <span>10ft</span>
              <span>15ft</span>
              <span>20ft+</span>
            </div>
          </div>
        );

      case "exc_swellPeriod":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="text-destructive">{formatPeriod(excludePeriodRange[0], false)}</span>
              <span className="text-muted-foreground">to</span>
              <span className="text-destructive">{formatPeriod(excludePeriodRange[1], true)}</span>
            </div>
            <Slider
              min={PERIOD_MIN}
              max={PERIOD_MAX}
              step={PERIOD_STEP}
              value={excludePeriodRange}
              onValueChange={(v) => setExcludePeriodRange(v as [number, number])}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0s</span>
              <span>5s</span>
              <span>10s</span>
              <span>15s</span>
              <span>20s</span>
              <span>25s+</span>
            </div>
          </div>
        );

      case "exc_swellDirection":
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Tap the compass wedges on the map to select directions that don&apos;t work
            </p>
            {excludeSwellDir.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {excludeSwellDir.map(d => (
                  <span key={d} className="px-2 py-0.5 rounded-full text-xs font-medium border border-destructive text-destructive bg-destructive/10">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>
        );

      case "exc_windSpeed":
        return (
          <div className="flex flex-wrap gap-2">
            {WIND_OPTIONS.map(opt => (
              <ExclusionPill key={opt.value} active={excludeWindSpeed.includes(opt.value)} onClick={() => setExcludeWindSpeed(togglePill(excludeWindSpeed, opt.value))}>
                {opt.label}
              </ExclusionPill>
            ))}
          </div>
        );

      case "exc_windDirection":
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Tap the compass wedges on the map to select directions that don&apos;t work
            </p>
            {excludeWindDir.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {excludeWindDir.map(d => (
                  <span key={d} className="px-2 py-0.5 rounded-full text-xs font-medium border border-destructive text-destructive bg-destructive/10">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>
        );

      case "exc_tide":
        return (
          <TideCurveSelector
            segments={excludeTideCurveSegments}
            onChange={setExcludeTideCurveSegments}
            mode="exclusion"
          />
        );

      case "season":
        return (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Select the months this spot works <span className="text-muted-foreground/50">(all if none)</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MONTHS.map(m => (
                <button
                  key={m.value}
                  onClick={() => toggleMonth(m.value)}
                  className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium transition-colors border",
                    activeMonths.includes(m.value)
                      ? "border-primary text-primary bg-primary/10"
                      : "border-transparent bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        );

      case "exc_season":
        return (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Select months that never work
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MONTHS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setExcludeMonths(prev =>
                    prev.includes(m.value) ? prev.filter(v => v !== m.value) : [...prev, m.value]
                  )}
                  className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium transition-colors border",
                    excludeMonths.includes(m.value)
                      ? "border-destructive text-destructive bg-destructive/10"
                      : "border-transparent bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        );

      case "quality":
        return (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">How consistent?</span>
              <div className="flex gap-1.5">
                {([
                  { value: "low", label: "Rare" },
                  { value: "medium", label: "Sometimes" },
                  { value: "high", label: "Often" },
                ] as const).map(opt => (
                  <WizardPill key={opt.value} active={consistency === opt.value} onClick={() => setConsistency(opt.value)}>
                    {opt.label}
                  </WizardPill>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Quality ceiling</span>
              <div className="flex gap-1.5">
                {([
                  { value: 1, label: "Poor" },
                  { value: 2, label: "Fair" },
                  { value: 3, label: "Good" },
                  { value: 4, label: "Great" },
                  { value: 5, label: "Epic" },
                ] as const).map(opt => (
                  <WizardPill key={opt.value} active={qualityCeiling === opt.value} onClick={() => setQualityCeiling(opt.value)}>
                    {opt.label}
                  </WizardPill>
                ))}
              </div>
            </div>
          </div>
        );
    }
  }

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <div className="pointer-events-auto w-[420px] max-w-[92vw] m-4 sm:m-4">
        <div className="rounded-xl border bg-background/95 backdrop-blur-sm shadow-2xl overflow-hidden">
          {/* Question + close button */}
          <div className="px-5 pt-4 pb-3 flex items-start gap-3">
            <h3 className="text-base font-semibold text-foreground leading-snug flex-1">
              {STEP_QUESTIONS[currentStep]}
            </h3>
            <button
              onClick={handleCancel}
              className="rounded-md p-1 -mt-0.5 -mr-1 hover:bg-accent transition-colors shrink-0"
            >
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>

          {/* Content — fixed min-height so card stays consistent */}
          <div className="px-5 pb-3 min-h-[120px]">
            {renderStepContent()}
            {error && (
              <p className="text-sm text-destructive mt-2">{error}</p>
            )}
          </div>

          {/* Footer: nav buttons */}
          <div className="px-5 pb-4 flex items-center justify-end gap-2">
            {!isFirst && (
              <Button
                variant="ghost"
                size="sm"
                onClick={goBack}
                className="h-8 px-2 mr-auto"
              >
                <ChevronLeft className="size-4" />
              </Button>
            )}
            {isSkippable && (
              <Button
                variant="ghost"
                size="sm"
                onClick={goNext}
                className="h-8 text-muted-foreground"
              >
                Skip
              </Button>
            )}
            {isLast ? (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="h-8"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : profile ? "Save" : "Create"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={goNext}
                className="h-8"
              >
                Next
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

/* ── Pill button for wizard ── */

function WizardPill({
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
        "px-3 py-1.5 rounded-full text-sm font-medium transition-colors border",
        active
          ? "border-primary text-primary bg-primary/10"
          : "border-transparent bg-muted text-muted-foreground hover:bg-accent"
      )}
    >
      {children}
    </button>
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
        "px-3 py-1.5 rounded-full text-sm font-medium transition-colors border",
        active
          ? "border-destructive text-destructive bg-destructive/10"
          : "border-transparent bg-muted text-muted-foreground hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

/* ── Step wrapper with importance badge ── */

function StepWithImportance({
  level,
  onLevelChange,
  children,
}: {
  level: number;
  onLevelChange: (level: number) => void;
  children: React.ReactNode;
}) {
  const info = IMPORTANCE_LEVELS[level];
  return (
    <div className="space-y-3">
      {children}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Importance:</span>
        <button
          onClick={() => onLevelChange((level + 1) % 5)}
          className={`px-2 py-0.5 rounded text-xs font-semibold leading-none transition-colors ${info.style}`}
          title="Click to cycle importance"
        >
          {info.label}
        </button>
      </div>
    </div>
  );
}
