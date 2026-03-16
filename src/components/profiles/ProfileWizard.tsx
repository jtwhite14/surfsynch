"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CardinalDirection, ConditionProfileResponse, ExclusionZones } from "@/types";
import { WEIGHT_PRESETS } from "@/types";
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
  | "name"
  | "preset"
  | "waveSize"
  | "swellPeriod"
  | "swellDirection"
  | "windSpeed"
  | "windDirection"
  | "tide"
  | "season";

const STEPS: Step[] = [
  "name",
  "preset",
  "waveSize",
  "swellPeriod",
  "swellDirection",
  "windSpeed",
  "windDirection",
  "tide",
  "season",
];

const STEP_QUESTIONS: Record<Step, string> = {
  name: "What should we call this profile?",
  preset: "What type of break is this?",
  waveSize: "What size waves work here?",
  swellPeriod: "What swell period is ideal?",
  swellDirection: "What direction should the swell come from?",
  windSpeed: "What wind conditions work?",
  windDirection: "What wind direction is best?",
  tide: "What tide levels work?",
  season: "When does this spot work best?",
};

// Steps that have an exclusion ("doesn't work") section
const STEPS_WITH_EXCLUSIONS: Step[] = ["waveSize", "swellPeriod", "swellDirection", "windSpeed", "windDirection", "tide"];

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

  // Form state
  const [name, setName] = useState(profile?.name ?? defaultName ?? "");

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
    return profile?.targetSwellDirection != null ? [degToCardinal(profile.targetSwellDirection)] : [];
  });
  const [windDirection, setWindDirection] = useState<CardinalDirection[]>(() => {
    if (sel?.windDirection?.length) return sel.windDirection as CardinalDirection[];
    return profile?.targetWindDirection != null ? [degToCardinal(profile.targetWindDirection)] : [];
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

  // Exclusion UI open state per step
  const [excOpen, setExcOpen] = useState(false);

  // Importance weights
  const [wSwellHeight, setWSwellHeight] = useState(profile?.weightSwellHeight ?? 0.8);
  const [wSwellPeriod, setWSwellPeriod] = useState(profile?.weightSwellPeriod ?? 0.7);
  const [wSwellDir, setWSwellDir] = useState(profile?.weightSwellDirection ?? 0.9);
  const [wWindSpeed, setWWindSpeed] = useState(profile?.weightWindSpeed ?? 0.7);
  const [wWindDir, setWWindDir] = useState(profile?.weightWindDirection ?? 0.6);
  const [wTideHeight, setWTideHeight] = useState(profile?.weightTideHeight ?? 0.5);
  const [wWaveEnergy, setWWaveEnergy] = useState(profile?.weightWaveEnergy ?? 0.8);

  const [activePreset, setActivePreset] = useState<string | null>(null);

  const currentStep = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const isCompassStep = currentStep === "swellDirection" || currentStep === "windDirection";
  const hasExclusions = STEPS_WITH_EXCLUSIONS.includes(currentStep);

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
    } else if (step === "windDirection") {
      onDirectionEditStart({ field: "windDirection", selected: windDirection, mode: "target" });
    }
  }, [onDirectionEditStart, swellDirection, windDirection]);

  // Activate compass when entering a compass step
  useEffect(() => {
    if (isCompassStep) {
      startCompass(currentStep);
    } else {
      onDirectionEditStop?.();
    }
    // Close exclusion section when changing steps
    setExcOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Sync direction state from map overlay
  useEffect(() => {
    if (!directionEditState) return;
    const { field, selected } = directionEditState;
    if (field === "swellDirection") setSwellDirection(selected);
    if (field === "windDirection") setWindDirection(selected);
    if (field === "excludeSwellDir") setExcludeSwellDir(selected);
    if (field === "excludeWindDir") setExcludeWindDir(selected);
  }, [directionEditState]);

  function goNext() {
    if (isLast) return;
    setError(null);
    if (currentStep === "name" && !name.trim()) {
      setError("Name is required");
      return;
    }
    setStepIndex(prev => prev + 1);
  }

  function goBack() {
    if (isFirst) return;
    setError(null);
    setStepIndex(prev => prev - 1);
  }

  function goToStep(idx: number) {
    if (idx >= 0 && idx < STEPS.length) {
      setError(null);
      setStepIndex(idx);
    }
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

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const targets = {
      targetSwellHeight: waveSize.length > 0 ? avgMidpoints(waveSize, WAVE_SIZE_MIDPOINTS) : null,
      targetSwellPeriod: swellPeriod.length > 0 ? avgMidpoints(swellPeriod, SWELL_PERIOD_MIDPOINTS) : null,
      targetSwellDirection: swellDirection.length > 0 ? avgCardinalDeg(swellDirection) : null,
      targetWindSpeed: windCondition.length > 0 ? avgMidpoints(windCondition, WIND_SPEED_MIDPOINTS) : null,
      targetWindDirection: windDirection.length > 0 ? avgCardinalDeg(windDirection) : null,
      targetTideHeight: tideLevel.length > 0 ? avgMidpoints(tideLevel, TIDE_HEIGHT_MIDPOINTS) : null,
    };

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
            windCondition,
            windDirection,
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

  function handleCancel() {
    onDirectionEditStop?.();
    onCancel();
  }

  // Get exclusion content for the current step
  function renderExclusionContent() {
    switch (currentStep) {
      case "waveSize":
        return (
          <div className="flex flex-wrap gap-2">
            {WAVE_SIZE_OPTIONS.map(opt => (
              <ExclusionPill key={opt.value} active={excludeWaveSize.includes(opt.value)} onClick={() => setExcludeWaveSize(togglePill(excludeWaveSize, opt.value))}>
                {opt.label}
              </ExclusionPill>
            ))}
          </div>
        );
      case "swellPeriod":
        return (
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map(opt => (
              <ExclusionPill key={opt.value} active={excludeSwellPeriod.includes(opt.value)} onClick={() => setExcludeSwellPeriod(togglePill(excludeSwellPeriod, opt.value))}>
                {opt.label}
              </ExclusionPill>
            ))}
          </div>
        );
      case "swellDirection":
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              Tap compass wedges on the map (shown in red)
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
          </>
        );
      case "windSpeed":
        return (
          <div className="flex flex-wrap gap-2">
            {[...WIND_OPTIONS, { value: "onshore", label: "Onshore" }].map(opt => (
              <ExclusionPill key={opt.value} active={excludeWindSpeed.includes(opt.value)} onClick={() => setExcludeWindSpeed(togglePill(excludeWindSpeed, opt.value))}>
                {opt.label}
              </ExclusionPill>
            ))}
          </div>
        );
      case "windDirection":
        return (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              Tap compass wedges on the map (shown in red)
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
          </>
        );
      case "tide":
        return (
          <div className="flex flex-wrap gap-2">
            {TIDE_OPTIONS.map(opt => (
              <ExclusionPill key={opt.value} active={excludeTide.includes(opt.value)} onClick={() => setExcludeTide(togglePill(excludeTide, opt.value))}>
                {opt.label}
              </ExclusionPill>
            ))}
          </div>
        );
      default:
        return null;
    }
  }

  // Check if current step has active exclusions
  function currentStepHasExclusions(): boolean {
    switch (currentStep) {
      case "waveSize": return excludeWaveSize.length > 0;
      case "swellPeriod": return excludeSwellPeriod.length > 0;
      case "swellDirection": return excludeSwellDir.length > 0;
      case "windSpeed": return excludeWindSpeed.length > 0;
      case "windDirection": return excludeWindDir.length > 0;
      case "tide": return excludeTide.length > 0;
      default: return false;
    }
  }

  // Handle toggling exclusion section — for compass directions, switch the map overlay mode
  function handleExcToggle() {
    const opening = !excOpen;
    setExcOpen(opening);

    if (isCompassStep && onDirectionEditStart) {
      if (opening) {
        // Switch compass to exclusion mode
        const field = currentStep === "swellDirection" ? "excludeSwellDir" : "excludeWindDir";
        const selected = currentStep === "swellDirection" ? excludeSwellDir : excludeWindDir;
        onDirectionEditStart({ field, selected, mode: "exclusion" });
      } else {
        // Switch back to target mode
        startCompass(currentStep);
      }
    }
  }

  // Render the step content
  function renderStepContent() {
    switch (currentStep) {
      case "name":
        return (
          <div className="space-y-3">
            <Input
              placeholder='e.g. "Winter NW swell"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="text-base"
              onKeyDown={(e) => e.key === "Enter" && goNext()}
            />
          </div>
        );

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
            <div className="flex flex-wrap gap-2">
              {WAVE_SIZE_OPTIONS.map(opt => (
                <WizardPill key={opt.value} active={waveSize.includes(opt.value)} onClick={() => setWaveSize(togglePill(waveSize, opt.value))}>
                  {opt.label}
                </WizardPill>
              ))}
            </div>
          </StepWithImportance>
        );

      case "swellPeriod":
        return (
          <StepWithImportance
            level={weightToLevel(wSwellPeriod)}
            onLevelChange={(l) => setWSwellPeriod(levelToWeight(l))}
          >
            <div className="flex flex-wrap gap-2">
              {PERIOD_OPTIONS.map(opt => (
                <WizardPill key={opt.value} active={swellPeriod.includes(opt.value)} onClick={() => setSwellPeriod(togglePill(swellPeriod, opt.value))}>
                  {opt.label}
                </WizardPill>
              ))}
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

      case "windSpeed":
        return (
          <StepWithImportance
            level={weightToLevel(wWindSpeed)}
            onLevelChange={(l) => setWWindSpeed(levelToWeight(l))}
          >
            <div className="flex flex-wrap gap-2">
              {WIND_OPTIONS.map(opt => (
                <WizardPill key={opt.value} active={windCondition.includes(opt.value)} onClick={() => setWindCondition(togglePill(windCondition, opt.value))}>
                  {opt.label}
                </WizardPill>
              ))}
            </div>
          </StepWithImportance>
        );

      case "windDirection":
        return (
          <StepWithImportance
            level={weightToLevel(wWindDir)}
            onLevelChange={(l) => setWWindDir(levelToWeight(l))}
          >
            <p className="text-xs text-muted-foreground">
              Tap the compass wedges on the map to select directions
            </p>
            {windDirection.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {windDirection.map(d => (
                  <span key={d} className="px-2 py-0.5 rounded-full text-xs font-medium border border-primary text-primary bg-primary/10">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </StepWithImportance>
        );

      case "tide":
        return (
          <StepWithImportance
            level={weightToLevel(wTideHeight)}
            onLevelChange={(l) => setWTideHeight(levelToWeight(l))}
          >
            <div className="flex flex-wrap gap-2">
              {TIDE_OPTIONS.map(opt => (
                <WizardPill key={opt.value} active={tideLevel.includes(opt.value)} onClick={() => setTideLevel(togglePill(tideLevel, opt.value))}>
                  {opt.label}
                </WizardPill>
              ))}
            </div>
          </StepWithImportance>
        );

      case "season":
        return (
          <div className="space-y-4">
            {/* Months */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Active months <span className="text-muted-foreground/50">(all if none)</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {MONTHS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => toggleMonth(m.value)}
                    className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium transition-colors",
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

            {/* Consistency */}
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

            {/* Quality ceiling */}
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
    <div className="absolute inset-0 z-30 pointer-events-none flex flex-col items-center">
      {/* Floating card — sits in upper portion so spot pin stays visible at center */}
      <div className="pointer-events-auto w-[420px] max-w-[92vw] mt-[12vh] sm:mt-[15vh]">
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

          {/* Exclusion section ("Doesn't work") */}
          {hasExclusions && (
            <div className="mx-5 mb-3 rounded-md border border-destructive/25 overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-destructive/5 transition-colors"
                onClick={handleExcToggle}
              >
                <ChevronRight className={`size-3 text-destructive/60 shrink-0 transition-transform duration-200 ${excOpen ? 'rotate-90' : ''}`} />
                <span className="text-xs font-medium text-destructive/70 flex-1">Doesn&apos;t work</span>
                {!excOpen && currentStepHasExclusions() && (
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive/50" />
                )}
              </button>
              {excOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-destructive/15">
                  {renderExclusionContent()}
                </div>
              )}
            </div>
          )}

          {/* Footer: progress dots + nav */}
          <div className="px-5 pb-4 flex items-center gap-3">
            {/* Progress dots */}
            <div className="flex gap-1.5 flex-1">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToStep(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === stepIndex
                      ? "w-6 bg-primary"
                      : i < stepIndex
                      ? "w-1.5 bg-primary/40"
                      : "w-1.5 bg-muted-foreground/20"
                  )}
                />
              ))}
            </div>

            {/* Nav buttons */}
            <div className="flex gap-2 shrink-0">
              {!isFirst && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goBack}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="size-4" />
                </Button>
              )}
              {currentStep === "preset" && (
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

        {/* Downward pointer arrow toward the spot pin */}
        <div className="flex justify-center -mt-px">
          <div className="w-3 h-3 rotate-45 bg-background/95 border-r border-b -mt-1.5" />
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
        "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
        active
          ? "border border-primary text-primary bg-primary/10"
          : "bg-muted text-muted-foreground hover:bg-accent"
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
        "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
        active
          ? "border border-destructive text-destructive bg-destructive/10"
          : "bg-muted text-muted-foreground hover:bg-accent"
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
