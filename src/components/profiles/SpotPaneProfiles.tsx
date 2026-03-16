"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Plus, Loader2, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { DirectionEditRequest } from "./ProfileEditor";
import type { CardinalDirection, ConditionProfileResponse } from "@/types";
import {
  WAVE_SIZE_MIDPOINTS,
  SWELL_PERIOD_MIDPOINTS,
  WIND_SPEED_MIDPOINTS,
  TIDE_HEIGHT_MIDPOINTS,
  MONTHS,
  closestMidpointKey,
} from "@/lib/matching/profile-utils";

interface SpotPaneProfilesProps {
  spotId: string;
  onBack: () => void;
  onDirectionEditStart?: (req: DirectionEditRequest) => void;
  onDirectionEditStop?: () => void;
  directionEditState?: { field: string; selected: CardinalDirection[]; mode: "target" | "exclusion" } | null;
  /** Open the map-centered wizard instead of inline ProfileEditor */
  onWizardOpen?: (profile: ConditionProfileResponse | undefined, defaultName: string) => void;
}

type View = "list" | "create" | "edit";

export function SpotPaneProfiles({ spotId, onBack, onDirectionEditStart, onDirectionEditStop, directionEditState, onWizardOpen }: SpotPaneProfilesProps) {
  const [profiles, setProfiles] = useState<ConditionProfileResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [editingProfile, setEditingProfile] = useState<ConditionProfileResponse | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/spots/${spotId}/profiles`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const loaded = data.profiles || [];
      setProfiles(loaded);
      if (loaded.length === 0) setView("create");
    } catch {
      toast.error("Failed to load profiles");
    } finally {
      setLoading(false);
    }
  }, [spotId]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handleToggleActive = async (profile: ConditionProfileResponse) => {
    try {
      const res = await fetch(`/api/spots/${spotId}/profiles/${profile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !profile.isActive }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProfiles(prev => prev.map(p => p.id === data.profile.id ? data.profile : p));
    } catch {
      toast.error("Failed to update profile");
    }
  };

  const handleDelete = async (profile: ConditionProfileResponse) => {
    if (!confirm(`Delete "${profile.name}"?`)) return;
    try {
      const res = await fetch(`/api/spots/${spotId}/profiles/${profile.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setProfiles(prev => prev.filter(p => p.id !== profile.id));
      toast.success("Profile deleted");
    } catch {
      toast.error("Failed to delete profile");
    }
  };

  const handleSave = (saved: ConditionProfileResponse) => {
    setProfiles(prev => {
      const existing = prev.find(p => p.id === saved.id);
      if (existing) return prev.map(p => p.id === saved.id ? saved : p);
      return [...prev, saved];
    });
    setView("list");
    setEditingProfile(null);
  };

  const handleGenerateFromSessions = async () => {
    setGenerating(true);
    try {
      // Fetch sessions with high ratings
      const res = await fetch(`/api/sessions?spotId=${spotId}&limit=50`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to fetch sessions");
      }
      const data = await res.json();
      const sessions = (data.sessions || []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => s.rating >= 3 && !s.ignored && s.conditions
      );

      if (sessions.length === 0) {
        toast.error("No sessions rated 3+ stars with conditions to generate from");
        return;
      }

      // Compute averages (fall back to waveHeight/wavePeriod if primary swell is null)
      const sums = { swellHeight: 0, swellPeriod: 0, windSpeed: 0, tideHeight: 0, swellDirSin: 0, swellDirCos: 0 };
      const counts = { swellHeight: 0, swellPeriod: 0, windSpeed: 0, tideHeight: 0, swellDir: 0 };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of sessions) {
        const c = s.conditions;
        const height = parseFloat(c?.primarySwellHeight) || parseFloat(c?.waveHeight) || NaN;
        if (!isNaN(height)) { sums.swellHeight += height; counts.swellHeight++; }
        const period = parseFloat(c?.primarySwellPeriod) || parseFloat(c?.wavePeriod) || NaN;
        if (!isNaN(period)) { sums.swellPeriod += period; counts.swellPeriod++; }
        const wind = parseFloat(c?.windSpeed);
        if (!isNaN(wind)) { sums.windSpeed += wind; counts.windSpeed++; }
        const tide = parseFloat(c?.tideHeight);
        if (!isNaN(tide)) { sums.tideHeight += tide; counts.tideHeight++; }
        const dir = parseFloat(c?.primarySwellDirection) || parseFloat(c?.waveDirection) || NaN;
        if (!isNaN(dir)) {
          const rad = dir * Math.PI / 180;
          sums.swellDirSin += Math.sin(rad);
          sums.swellDirCos += Math.cos(rad);
          counts.swellDir++;
        }
      }

      const avgHeight = counts.swellHeight > 0 ? sums.swellHeight / counts.swellHeight : null;
      const avgPeriod = counts.swellPeriod > 0 ? sums.swellPeriod / counts.swellPeriod : null;
      const avgWind = counts.windSpeed > 0 ? sums.windSpeed / counts.windSpeed : null;
      const avgTide = counts.tideHeight > 0 ? sums.tideHeight / counts.tideHeight : null;
      const avgDir = counts.swellDir > 0
        ? ((Math.atan2(sums.swellDirSin / counts.swellDir, sums.swellDirCos / counts.swellDir) * 180 / Math.PI) + 360) % 360
        : null;

      const targets: Record<string, number | null> = {
        targetSwellHeight: avgHeight,
        targetSwellPeriod: avgPeriod,
        targetSwellDirection: avgDir,
        targetWindSpeed: avgWind,
        targetWindDirection: null,
        targetTideHeight: avgTide,
      };

      const specifiedCount = Object.values(targets).filter(v => v != null).length;
      if (specifiedCount < 2) {
        toast.error(`Only ${specifiedCount} condition available from ${sessions.length} sessions — need at least 2`);
        return;
      }

      // Build name from conditions
      const heightLabel = avgHeight != null ? closestMidpointKey(avgHeight, WAVE_SIZE_MIDPOINTS) : null;
      const periodLabel = avgPeriod != null ? closestMidpointKey(avgPeriod, SWELL_PERIOD_MIDPOINTS) : null;
      const nameParts: string[] = [];
      if (heightLabel) nameParts.push(capitalize(heightLabel));
      if (periodLabel) nameParts.push(`${periodLabel} period`);
      const autoName = nameParts.length > 0 ? nameParts.join(", ") : `From ${sessions.length} sessions`;

      const createRes = await fetch(`/api/spots/${spotId}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: autoName,
          ...targets,
          source: "auto_generated",
        }),
      });

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => null);
        throw new Error(errData?.error || "Failed to create profile");
      }

      const created = await createRes.json();
      setProfiles(prev => [...prev, created.profile]);
      toast.success(`Profile generated from ${sessions.length} best sessions`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate profile");
    } finally {
      setGenerating(false);
    }
  };

  // When view switches to create/edit, open the wizard overlay instead
  useEffect(() => {
    if (view === "create" && onWizardOpen) {
      onWizardOpen(undefined, `Profile ${profiles.length + 1}`);
      setView("list");
    } else if (view === "edit" && editingProfile && onWizardOpen) {
      onWizardOpen(editingProfile, editingProfile.name);
      setView("list");
      setEditingProfile(null);
    }
  }, [view, editingProfile, onWizardOpen, profiles.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b">
        <button onClick={onBack} className="rounded-md p-1 hover:bg-accent transition-colors">
          <ArrowLeft className="size-4" />
        </button>
        <h2 className="text-lg font-semibold flex-1">Condition Profiles</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setView("create")}
          disabled={profiles.length >= 10}
        >
          <Plus className="size-3.5 mr-1" />
          Add
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-muted-foreground">
              No profiles yet. Create one to define your ideal conditions.
            </p>
            <div className="flex flex-col items-center gap-2">
              <Button size="sm" onClick={() => setView("create")}>
                <Plus className="size-3.5 mr-1" />
                Create Profile
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateFromSessions}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-3.5 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 mr-1" />
                )}
                Generate from best sessions
              </Button>
            </div>
          </div>
        ) : (
          <>
            {profiles.map(profile => (
              <div
                key={profile.id}
                className={`rounded-lg border px-3 py-2.5 transition-colors ${
                  profile.isActive ? "bg-background" : "bg-muted/30 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => { setEditingProfile(profile); setView("edit"); }}
                    className="text-left flex-1 min-w-0"
                  >
                    <p className="text-sm font-medium truncate">{profile.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {buildTargetSummary(profile)}
                    </p>
                    {profile.reinforcementCount > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Reinforced {profile.reinforcementCount}x
                      </p>
                    )}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleActive(profile)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        profile.isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {profile.isActive ? "Active" : "Off"}
                    </button>
                    <button
                      onClick={() => handleDelete(profile)}
                      className="rounded-md p-1 hover:bg-accent transition-colors text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {profile.activeMonths && profile.activeMonths.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {profile.activeMonths.sort((a, b) => a - b).map(m => (
                      <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {MONTHS.find(mo => mo.value === m)?.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {profiles.length < 10 && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={handleGenerateFromSessions}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-3.5 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 mr-1" />
                )}
                Generate from best sessions
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function buildTargetSummary(p: ConditionProfileResponse): string {
  const parts: string[] = [];
  if (p.targetSwellHeight != null) {
    const ft = (p.targetSwellHeight * 3.28084).toFixed(0);
    parts.push(`${ft}ft`);
  }
  if (p.targetSwellPeriod != null) {
    parts.push(`${p.targetSwellPeriod.toFixed(0)}s`);
  }
  if (p.targetSwellDirection != null) {
    parts.push(`${p.targetSwellDirection.toFixed(0)}°`);
  }
  if (p.targetWindSpeed != null) {
    parts.push(p.targetWindSpeed < 10 ? "light wind" : `${p.targetWindSpeed.toFixed(0)} km/h wind`);
  }
  if (p.targetTideHeight != null) {
    parts.push(`${p.targetTideHeight > 0.3 ? "high" : p.targetTideHeight < -0.3 ? "low" : "mid"} tide`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No targets set";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
