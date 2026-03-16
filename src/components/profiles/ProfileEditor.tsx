"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import { SwellExposurePicker } from "@/components/spots/SwellExposurePicker";
import type { CardinalDirection, ConditionProfileResponse } from "@/types";
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

export function ProfileEditor({ spotId, profile, onSave, onCancel }: ProfileEditorProps) {
  const [name, setName] = useState(profile?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Categorical selections
  const [waveSize, setWaveSize] = useState<string | null>(
    profile ? numericToCategory(profile.targetSwellHeight, WAVE_SIZE_MIDPOINTS) : null
  );
  const [swellPeriod, setSwellPeriod] = useState<string | null>(
    profile ? numericToCategory(profile.targetSwellPeriod, SWELL_PERIOD_MIDPOINTS) : null
  );
  const [windCondition, setWindCondition] = useState<string | null>(
    profile ? numericToCategory(profile.targetWindSpeed, WIND_SPEED_MIDPOINTS) : null
  );
  const [tideLevel, setTideLevel] = useState<string | null>(
    profile ? numericToCategory(profile.targetTideHeight, TIDE_HEIGHT_MIDPOINTS) : null
  );
  const [swellDirection, setSwellDirection] = useState<CardinalDirection[]>(
    profile?.targetSwellDirection != null
      ? [degToCardinal(profile.targetSwellDirection)]
      : []
  );
  const [activeMonths, setActiveMonths] = useState<number[]>(profile?.activeMonths ?? []);

  // Advanced overrides
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advSwellHeight, setAdvSwellHeight] = useState(profile?.targetSwellHeight?.toString() ?? "");
  const [advSwellPeriod, setAdvSwellPeriod] = useState(profile?.targetSwellPeriod?.toString() ?? "");
  const [advSwellDir, setAdvSwellDir] = useState(profile?.targetSwellDirection?.toString() ?? "");
  const [advWindSpeed, setAdvWindSpeed] = useState(profile?.targetWindSpeed?.toString() ?? "");
  const [advWindDir, setAdvWindDir] = useState(profile?.targetWindDirection?.toString() ?? "");
  const [advTideHeight, setAdvTideHeight] = useState(profile?.targetTideHeight?.toString() ?? "");

  function togglePill<T extends string>(current: T | null, value: T): T | null {
    return current === value ? null : value;
  }

  function toggleMonth(month: number) {
    setActiveMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
    );
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
      targetSwellHeight: waveSize ? WAVE_SIZE_MIDPOINTS[waveSize] : null,
      targetSwellPeriod: swellPeriod ? SWELL_PERIOD_MIDPOINTS[swellPeriod] : null,
      targetSwellDirection: swellDirection.length > 0 ? cardinalToDeg(swellDirection[0]) : null,
      targetWindSpeed: windCondition ? WIND_SPEED_MIDPOINTS[windCondition] : null,
      targetWindDirection: null,
      targetTideHeight: tideLevel ? TIDE_HEIGHT_MIDPOINTS[tideLevel] : null,
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

        {!showAdvanced && (
          <>
            {/* Wave Size */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Wave size</label>
              <div className="flex flex-wrap gap-2">
                {WAVE_SIZE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setWaveSize(togglePill(waveSize, opt.value))}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      waveSize === opt.value
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
              <label className="text-sm font-medium text-muted-foreground">Swell period</label>
              <div className="flex flex-wrap gap-2">
                {PERIOD_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSwellPeriod(togglePill(swellPeriod, opt.value))}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      swellPeriod === opt.value
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
              <label className="text-sm font-medium text-muted-foreground">Swell direction</label>
              <SwellExposurePicker
                value={swellDirection}
                onChange={(dirs) => {
                  // Single-select: keep only the most recently picked direction
                  if (dirs.length > 1) {
                    const newest = dirs.filter(d => !swellDirection.includes(d));
                    setSwellDirection(newest.length > 0 ? [newest[0]] : [dirs[dirs.length - 1]]);
                  } else {
                    setSwellDirection(dirs);
                  }
                }}
              />
            </div>

            {/* Wind */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Wind</label>
              <div className="flex flex-wrap gap-2">
                {WIND_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setWindCondition(togglePill(windCondition, opt.value))}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      windCondition === opt.value
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
              <label className="text-sm font-medium text-muted-foreground">Tide</label>
              <div className="flex flex-wrap gap-2">
                {TIDE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTideLevel(togglePill(tideLevel, opt.value))}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      tideLevel === opt.value
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
