"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Plus, Loader2, Trash2, Pencil, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { DirectionEditRequest } from "./ProfileEditor";
import type { CardinalDirection, ConditionProfileResponse } from "@/types";
import {
  MONTHS,
} from "@/lib/matching/profile-utils";
import { cn } from "@/lib/utils";

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoOpenedWizard, setAutoOpenedWizard] = useState(false);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/spots/${spotId}/profiles`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const loaded = data.profiles || [];
      setProfiles(loaded);
      if (loaded.length === 0 && !autoOpenedWizard) setView("create");
    } catch {
      toast.error("Failed to load profiles");
    } finally {
      setLoading(false);
    }
  }, [spotId]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handleDelete = async (profile: ConditionProfileResponse, displayName: string) => {
    if (!confirm(`Delete "${displayName}"?`)) return;
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

  // When view switches to create/edit, open the wizard overlay instead
  useEffect(() => {
    if (view === "create" && onWizardOpen) {
      onWizardOpen(undefined, `Profile ${profiles.length + 1}`);
      setView("list");
      setAutoOpenedWizard(true);
    } else if (view === "edit" && editingProfile && onWizardOpen) {
      onWizardOpen(editingProfile, editingProfile.name);
      setView("list");
      setEditingProfile(null);
    }
  }, [view, editingProfile, onWizardOpen, profiles.length]);

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

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
            <Button size="sm" onClick={() => setView("create")}>
              <Plus className="size-3.5 mr-1" />
              Create Profile
            </Button>
          </div>
        ) : (
          <>
            {profiles.map((profile, index) => {
              const isExpanded = expandedId === profile.id;
              const displayName = `Profile ${index + 1}`;
              return (
                <div
                  key={profile.id}
                  className="rounded-lg border px-3 py-2.5 transition-colors bg-background"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => toggleExpand(profile.id)}
                      className="text-left flex-1 min-w-0 flex items-start gap-2"
                    >
                      <ChevronDown className={cn(
                        "size-4 text-muted-foreground shrink-0 mt-0.5 transition-transform duration-200",
                        isExpanded ? "" : "-rotate-90"
                      )} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{displayName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {buildTargetSummary(profile)}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { setEditingProfile(profile); setView("edit"); }}
                        className="rounded-md p-1 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                        title="Edit profile"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(profile, displayName)}
                        className="rounded-md p-1 hover:bg-accent transition-colors text-muted-foreground hover:text-destructive"
                        title="Delete profile"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t space-y-2.5 text-xs">
                      {/* Swell */}
                      {(profile.targetSwellHeight != null || profile.targetSwellPeriod != null || profile.targetSwellDirection != null) && (
                        <div>
                          <span className="font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Swell</span>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-foreground">
                            {profile.targetSwellHeight != null && (
                              <span>Size: {(profile.targetSwellHeight * 3.28084).toFixed(0)}ft</span>
                            )}
                            {profile.targetSwellPeriod != null && (
                              <span>Period: {profile.targetSwellPeriod.toFixed(0)}s</span>
                            )}
                            {profile.targetSwellDirection != null && (
                              <span>Direction: {profile.targetSwellDirection.toFixed(0)}°</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Wind */}
                      {(profile.targetWindSpeed != null || profile.targetWindDirection != null) && (
                        <div>
                          <span className="font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Wind</span>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-foreground">
                            {profile.targetWindSpeed != null && (
                              <span>Speed: {profile.targetWindSpeed < 10 ? "light" : `${profile.targetWindSpeed.toFixed(0)} km/h`}</span>
                            )}
                            {profile.targetWindDirection != null && (
                              <span>Direction: {profile.targetWindDirection.toFixed(0)}°</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Tide */}
                      {profile.targetTideHeight != null && (
                        <div>
                          <span className="font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Tide</span>
                          <div className="mt-1 text-foreground">
                            {profile.targetTideHeight > 0.3 ? "High" : profile.targetTideHeight < -0.3 ? "Low" : "Mid"}
                          </div>
                        </div>
                      )}

                      {/* Exclusions */}
                      {profile.exclusions && Object.keys(profile.exclusions).length > 0 && (
                        <div>
                          <span className="font-medium text-destructive/70 uppercase tracking-wider text-[10px]">Doesn&apos;t work</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {profile.exclusions.swellDirection?.map(d => (
                              <span key={`sd-${d}`} className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px]">Swell {d}</span>
                            ))}
                            {profile.exclusions.windDirection?.map(d => (
                              <span key={`wd-${d}`} className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px]">Wind {d}</span>
                            ))}
                            {profile.exclusions.swellHeight?.map(v => (
                              <span key={`sh-${v}`} className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px]">{v} waves</span>
                            ))}
                            {profile.exclusions.swellPeriod?.map(v => (
                              <span key={`sp-${v}`} className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px]">{v} period</span>
                            ))}
                            {profile.exclusions.windSpeed?.map(v => (
                              <span key={`ws-${v}`} className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px]">{v} wind</span>
                            ))}
                            {profile.exclusions.tideHeight?.map(v => (
                              <span key={`th-${v}`} className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px]">{v} tide</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Weights */}
                      <div>
                        <span className="font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Importance</span>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-foreground">
                          <span>Swell height: {weightLabel(profile.weightSwellHeight)}</span>
                          <span>Period: {weightLabel(profile.weightSwellPeriod)}</span>
                          <span>Swell dir: {weightLabel(profile.weightSwellDirection)}</span>
                          <span>Wind: {weightLabel(profile.weightWindSpeed)}</span>
                          <span>Wind dir: {weightLabel(profile.weightWindDirection)}</span>
                          <span>Tide: {weightLabel(profile.weightTideHeight)}</span>
                        </div>
                      </div>

                      {/* Season */}
                      {profile.activeMonths && profile.activeMonths.length > 0 && (
                        <div>
                          <span className="font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Active months</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {profile.activeMonths.sort((a, b) => a - b).map(m => (
                              <span key={m} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
                                {MONTHS.find(mo => mo.value === m)?.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Quality + Consistency */}
                      <div className="flex gap-4">
                        <span>Consistency: {profile.consistency}</span>
                        <span>Quality ceiling: {profile.qualityCeiling}/5</span>
                      </div>

                      {profile.reinforcementCount > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          Reinforced {profile.reinforcementCount}x
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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

function weightLabel(w: number): string {
  if (w === 0) return "any";
  if (w <= 0.45) return "low";
  if (w <= 0.8) return "med";
  if (w <= 1.2) return "high";
  return "critical";
}
