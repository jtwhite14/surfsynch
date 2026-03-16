"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils/date";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  X,
  MoreHorizontal,
  Pencil,
  Trash2,
  MapPin,
  AlertTriangle,
  BellOff,
  Bell,
  Target,
  Share2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { SpotConditions } from "@/components/spots/SpotConditions";
import { SpotAlertCard } from "@/components/alerts/SpotAlertCard";
import { WeeklyForecast } from "@/components/forecast/WeeklyForecast";
import { SpotPaneSessionDetail } from "@/components/spots/SpotPaneSessionDetail";
import { SpotPaneEditSpot } from "@/components/spots/SpotPaneEditSpot";
import { SpotPaneProfiles } from "@/components/profiles/SpotPaneProfiles";
import { ProfileWizard } from "@/components/profiles/ProfileWizard";
import { SpotSharePanel } from "@/components/sharing/SpotSharePanel";
import { IncomingInvites } from "@/components/sharing/IncomingInvites";
import { SharedSpotsList } from "@/components/sharing/SharedSpotsList";
import { SharedSpotPane } from "@/components/sharing/SharedSpotPane";
import type { SurfSpot } from "@/lib/db/schema";
import type { SurfSessionWithConditions, SharedSpotView, CardinalDirection, ConditionProfileResponse } from "@/types";

const SpotMap = dynamic(() => import("@/components/map/SpotMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-muted">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default function DashboardPage() {
  const router = useRouter();
  const [spots, setSpots] = useState<SurfSpot[]>([]);
  const [sessions, setSessions] = useState<SurfSessionWithConditions[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(true);
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(true);
  const [sessionsTab, setSessionsTab] = useState<"sessions" | "spots">("sessions");

  const [homeLocation, setHomeLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Add Spot / Fix Location state machine
  const [addSpotMode, setAddSpotMode] = useState<"idle" | "picking" | "detailing" | "fixing-picking" | "fixing-detailing">("idle");
  const [newSpotMarker, setNewSpotMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [newSpotName, setNewSpotName] = useState("");
  const [newSpotDescription, setNewSpotDescription] = useState("");
  const [isSavingSpot, setIsSavingSpot] = useState(false);

  // Spot detail pane
  const [selectedSpot, setSelectedSpot] = useState<SurfSpot | null>(null);
  const [spotSessions, setSpotSessions] = useState<SurfSessionWithConditions[]>([]);
  const [loadingSpotSessions, setLoadingSpotSessions] = useState(false);
  const [isDeletingSpot, setIsDeletingSpot] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [paneView, setPaneView] = useState<"spot" | "session" | "edit" | "profiles" | "shares">("spot");
  const [viewingSession, setViewingSession] = useState<SurfSessionWithConditions | null>(null);
  const [alertSpotIds, setAlertSpotIds] = useState<Set<string>>(new Set());
  const [alertSummaries, setAlertSummaries] = useState<Array<{ spotId: string; spotName: string; effectiveScore: number; forecastHour: string; timeWindow: string; conditions: string }>>([]);
  const [spotProfileCounts, setSpotProfileCounts] = useState<Record<string, number>>({});

  // Sharing state
  const [sharedSpots, setSharedSpots] = useState<SharedSpotView[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<Array<{
    id: string;
    inviteCode: string;
    spot: { id: string; name: string };
    sharedBy: { id: string; name: string | null; email: string };
  }>>([]);
  const [selectedSharedSpot, setSelectedSharedSpot] = useState<SharedSpotView | null>(null);

  // Map direction editing overlay
  const [directionEdit, setDirectionEdit] = useState<{
    spotId: string;
    field: string;
    selected: CardinalDirection[];
    mode: "target" | "exclusion";
  } | null>(null);

  // Profile wizard (map-centered step-by-step editor)
  const [profileWizard, setProfileWizard] = useState<{
    spotId: string;
    profile?: ConditionProfileResponse;
    defaultName: string;
  } | null>(null);

  // Missing location prompt
  const [fixLocationSpot, setFixLocationSpot] = useState<SurfSpot | null>(null);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [dismissedLocationBanner, setDismissedLocationBanner] = useState(false);

  const spotsNeedingAttention = useMemo(() => {
    const items: { spot: SurfSpot; missingLocation: boolean; missingProfile: boolean }[] = [];
    for (const s of spots) {
      const missingLocation = parseFloat(s.latitude) === 0 && parseFloat(s.longitude) === 0;
      const missingProfile = spotProfileCounts[s.id] === 0;
      if (missingLocation || missingProfile) {
        items.push({ spot: s, missingLocation, missingProfile });
      }
    }
    return items;
  }, [spots, spotProfileCounts]);

  const handleFixLocation = (spot: SurfSpot) => {
    setSelectedSpot(null);
    setFixLocationSpot(spot);
    setNewSpotMarker(null);
    setAddSpotMode("fixing-picking");
  };


  const handleCancelFixLocation = () => {
    setAddSpotMode("idle");
    setNewSpotMarker(null);
    setFixLocationSpot(null);
  };

  const handleSaveFixedLocation = async () => {
    if (!fixLocationSpot || !newSpotMarker) return;
    setIsSavingLocation(true);
    try {
      const res = await fetch(`/api/spots?id=${fixLocationSpot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: newSpotMarker.lat,
          longitude: newSpotMarker.lng,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSpots((prev) => prev.map((s) => (s.id === data.spot.id ? data.spot : s)));
      toast.success(`Location set for ${data.spot.name}`);
      handleCancelFixLocation();
    } catch {
      toast.error("Failed to update location");
    } finally {
      setIsSavingLocation(false);
    }
  };

  const handleStartAddSpot = () => {
    setSelectedSpot(null);
    setAddSpotMode("picking");
    setNewSpotMarker(null);
    setNewSpotName("");
    setNewSpotDescription("");
  };

  const handleMapClick = (lat: number, lng: number) => {
    setNewSpotMarker({ lat, lng });
    if (addSpotMode === "fixing-picking" || addSpotMode === "fixing-detailing") {
      setAddSpotMode("fixing-detailing");
    } else {
      setAddSpotMode("detailing");
    }
  };

  const handleCancelAddSpot = () => {
    setAddSpotMode("idle");
    setNewSpotMarker(null);
    setNewSpotName("");
    setNewSpotDescription("");
  };

  const handleSaveSpot = async () => {
    if (!newSpotMarker || !newSpotName.trim()) return;
    setIsSavingSpot(true);
    try {
      const res = await fetch("/api/spots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSpotName.trim(),
          latitude: newSpotMarker.lat,
          longitude: newSpotMarker.lng,
          description: newSpotDescription.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save spot");
      const data = await res.json();
      setSpots((prev) => [...prev, data.spot]);
      toast.success("Spot added!");
      handleCancelAddSpot();
    } catch {
      toast.error("Failed to save spot");
    } finally {
      setIsSavingSpot(false);
    }
  };

  // Spot click handler — fetch sessions for the spot
  const handleSpotClick = useCallback(async (spot: SurfSpot) => {
    setSelectedSpot(spot);
    setShowAllSessions(false);
    setPaneView("spot");
    setViewingSession(null);
    setLoadingSpotSessions(true);
    try {
      const res = await fetch(`/api/sessions?spotId=${spot.id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSpotSessions(data.sessions || []);
    } catch {
      setSpotSessions([]);
    } finally {
      setLoadingSpotSessions(false);
    }
  }, []);

  const handleCloseSpotDetail = () => {
    setSelectedSpot(null);
    setSelectedSharedSpot(null);
    setSpotSessions([]);
    setShowAllSessions(false);
    setPaneView("spot");
    setViewingSession(null);
  };

  const handleSharedSpotClick = (sharedSpot: SharedSpotView) => {
    setSelectedSpot(null);
    setSelectedSharedSpot(sharedSpot);
  };

  const handleInviteResolved = (inviteId: string, action: "accept" | "decline") => {
    setIncomingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    if (action === "accept") {
      // Refresh shared spots
      fetch("/api/shares/spots")
        .then((r) => (r.ok ? r.json() : { sharedSpots: [] }))
        .then((data) => setSharedSpots(data.sharedSpots || []))
        .catch(() => {});
    }
  };

  const handleViewSession = (session: SurfSessionWithConditions) => {
    setViewingSession(session);
    setPaneView("session");
  };

  const handleBackToSpot = useCallback(() => {
    setPaneView("spot");
    setViewingSession(null);
    // Refresh profile count for the selected spot
    if (selectedSpot) {
      fetch(`/api/spots/${selectedSpot.id}/profiles`)
        .then(r => r.ok ? r.json() : { profiles: [] })
        .then(data => {
          setSpotProfileCounts(prev => ({ ...prev, [selectedSpot.id]: (data.profiles || []).length }));
        })
        .catch(() => {});
    }
  }, [selectedSpot]);

  const handleSpotSaved = (updatedSpot: SurfSpot) => {
    setSpots((prev) => prev.map((s) => (s.id === updatedSpot.id ? updatedSpot : s)));
    setSelectedSpot(updatedSpot);
  };

  const handleDeleteSpot = async () => {
    if (!selectedSpot) return;
    if (!confirm(`Delete "${selectedSpot.name}" and all its sessions?`)) return;
    setIsDeletingSpot(true);
    try {
      const res = await fetch(`/api/spots?id=${selectedSpot.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSpots((prev) => prev.filter((s) => s.id !== selectedSpot.id));
      handleCloseSpotDetail();
      toast.success("Spot deleted");
    } catch {
      toast.error("Failed to delete spot");
    } finally {
      setIsDeletingSpot(false);
    }
  };

  const handleToggleSilence = async () => {
    if (!selectedSpot) return;
    const newSilenced = !selectedSpot.alertsSilenced;
    try {
      const res = await fetch(`/api/spots?id=${selectedSpot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertsSilenced: newSilenced }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      handleSpotSaved(data.spot);
      toast.success(newSilenced ? "Alerts silenced" : "Alerts enabled");
    } catch {
      toast.error("Failed to update alert settings");
    }
  };

  // Listen for "Add Spot" from sidebar
  useEffect(() => {
    const handler = () => handleStartAddSpot();
    window.addEventListener("start-add-spot", handler);
    return () => window.removeEventListener("start-add-spot", handler);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/spots").then((r) => (r.ok ? r.json() : { spots: [] })),
      fetch("/api/user/location").then((r) => (r.ok ? r.json() : { latitude: null, longitude: null })),
      fetch("/api/sessions?limit=5").then((r) => (r.ok ? r.json() : { sessions: [] })),
      fetch("/api/shares/spots").then((r) => (r.ok ? r.json() : { sharedSpots: [] })),
      fetch("/api/shares/incoming").then((r) => (r.ok ? r.json() : { invites: [] })),
    ])
      .then(([spotsData, locationData, sessionsData, sharedSpotsData, invitesData]) => {
        setSpots(spotsData.spots || []);
        setSessions(sessionsData.sessions || []);
        setSharedSpots(sharedSpotsData.sharedSpots || []);
        setIncomingInvites(invitesData.invites || []);
        if (locationData.latitude && locationData.longitude) {
          setHomeLocation({ latitude: locationData.latitude, longitude: locationData.longitude });
        }

        // Fetch alert status and profile counts for each spot (fire-and-forget, non-blocking)
        const spotsList = spotsData.spots || [];
        if (spotsList.length > 0) {
          // Fetch profile counts
          Promise.all(
            spotsList.map((s: SurfSpot) =>
              fetch(`/api/spots/${s.id}/profiles`)
                .then(r => r.ok ? r.json() : { profiles: [] })
                .then(data => ({ spotId: s.id, count: (data.profiles || []).length }))
                .catch(() => ({ spotId: s.id, count: 0 }))
            )
          ).then(results => {
            const counts: Record<string, number> = {};
            for (const { spotId, count } of results) {
              counts[spotId] = count;
            }
            setSpotProfileCounts(counts);
          });

          Promise.all(
            spotsList.map((s: SurfSpot) =>
              fetch(`/api/spots/${s.id}/alerts`)
                .then(r => r.ok ? r.json() : { alerts: [] })
                .then(data => ({ spot: s, alerts: data.alerts || [] }))
                .catch(() => ({ spot: s, alerts: [] }))
            )
          ).then(results => {
            const ids = new Set<string>();
            const summaries: typeof alertSummaries = [];
            for (const { spot, alerts } of results) {
              if (alerts.length > 0) {
                ids.add(spot.id);
                const best = alerts[0]; // Already sorted by effectiveScore
                const snapshot = best.forecastSnapshot;
                const waveHeight = snapshot?.primarySwellHeight != null
                  ? `${(snapshot.primarySwellHeight * 3.28084).toFixed(0)}ft`
                  : '';
                const period = snapshot?.primarySwellPeriod != null
                  ? `@ ${snapshot.primarySwellPeriod.toFixed(0)}s`
                  : '';
                summaries.push({
                  spotId: spot.id,
                  spotName: spot.name,
                  effectiveScore: Math.round(best.effectiveScore),
                  forecastHour: best.forecastHour,
                  timeWindow: best.timeWindow,
                  conditions: [waveHeight, period].filter(Boolean).join(' '),
                });
              }
            }
            setAlertSpotIds(ids);
            setAlertSummaries(summaries.sort((a, b) => b.effectiveScore - a.effectiveScore));
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const initialViewState = useMemo(() => {
    if (homeLocation) {
      return {
        longitude: homeLocation.longitude,
        latitude: homeLocation.latitude,
        zoom: 8,
      };
    }
    if (spots.length === 1) {
      return {
        longitude: parseFloat(spots[0].longitude),
        latitude: parseFloat(spots[0].latitude),
        zoom: 12,
      };
    }
    if (spots.length > 1) {
      const lngs = spots.map((s) => parseFloat(s.longitude));
      const lats = spots.map((s) => parseFloat(s.latitude));
      return {
        longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
        latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
        zoom: 10,
      };
    }
    return undefined;
  }, [spots, homeLocation]);

  // When the spot detail pane is open, pad flyTo so the spot centers in the visible area
  // On mobile (<640px), the pane covers the full width so no padding needed
  // When wizard is open, no padding - we want the spot centered
  const flyToPadding = useMemo(
    () => {
      if (profileWizard) return undefined;
      if (!selectedSpot) return undefined;
      const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
      return isMobile ? undefined : { left: typeof window !== "undefined" ? window.innerWidth * 0.5 : 700 };
    },
    [selectedSpot]
  );

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full${addSpotMode !== "idle" ? " cursor-crosshair" : ""}`}>
      <SpotMap
        spots={spots}
        interactive={addSpotMode !== "idle"}
        onMapClick={addSpotMode !== "idle" ? handleMapClick : undefined}
        onSpotClick={addSpotMode === "idle" ? handleSpotClick : undefined}
        selectedSpotId={selectedSpot?.id}
        newSpotMarker={newSpotMarker}
        flyToPadding={flyToPadding}
        alertSpotIds={alertSpotIds}
        sharedSpots={sharedSpots.map((s) => ({
          shareId: s.shareId,
          spot: s.spot,
          sharedBy: s.sharedBy,
        }))}
        onSharedSpotClick={(shared) => {
          const full = sharedSpots.find((s) => s.shareId === shared.shareId);
          if (full) handleSharedSpotClick(full);
        }}
        {...(initialViewState && { initialViewState })}
        directionEdit={directionEdit && selectedSpot ? {
          spotId: selectedSpot.id,
          selected: directionEdit.selected,
          mode: directionEdit.mode,
          onChange: (dirs) => setDirectionEdit(prev => prev ? { ...prev, selected: dirs } : null),
        } : undefined}
        wizardSpotId={profileWizard?.spotId}
      />

      {/* Spots needing attention banner */}
      {spotsNeedingAttention.length > 0 && !dismissedLocationBanner && !selectedSpot && addSpotMode === "idle" && (
        <div className="absolute top-4 left-4 right-4 sm:left-auto sm:right-4 z-20 sm:w-96">
          <div className="rounded-lg border border-amber-500/40 bg-background/95 backdrop-blur-sm shadow-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {spotsNeedingAttention.length === 1
                    ? "1 spot needs your attention"
                    : `${spotsNeedingAttention.length} spots need your attention`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Complete your spots to get accurate alerts and conditions.
                </p>
                <div className="mt-3 space-y-2">
                  {spotsNeedingAttention.map(({ spot, missingLocation, missingProfile }) => (
                    <div key={spot.id} className="rounded-md border border-dashed px-3 py-2 space-y-1.5">
                      <p className="text-sm font-medium truncate">{spot.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {missingLocation && (
                          <button
                            onClick={() => handleFixLocation(spot)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-accent/50 px-2.5 py-1 text-xs hover:bg-accent transition-colors"
                          >
                            <MapPin className="size-3" />
                            <span>Set location</span>
                          </button>
                        )}
                        {missingProfile && (
                          <button
                            onClick={() => { handleSpotClick(spot); setPaneView("profiles"); }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-accent/50 px-2.5 py-1 text-xs hover:bg-accent transition-colors"
                          >
                            <Target className="size-3" />
                            <span>Add condition profile</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setDismissedLocationBanner(true)}
                className="rounded-md p-1 hover:bg-accent transition-colors shrink-0"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spot detail pane — hidden when profile wizard is active */}
      {selectedSpot && addSpotMode === "idle" && !profileWizard && (
        <div className="absolute inset-0 sm:inset-auto sm:top-4 sm:left-4 sm:bottom-4 z-20 w-full sm:w-[50vw] sm:max-w-[800px] flex flex-col sm:rounded-lg border bg-background/95 sm:bg-background/90 backdrop-blur-sm shadow-lg overflow-hidden">
          {paneView === "session" && viewingSession ? (
            <SpotPaneSessionDetail
              session={viewingSession}
              onBack={handleBackToSpot}
              onSessionUpdated={(updated) => {
                setViewingSession(updated);
                setSpotSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
              }}
              onSessionDeleted={(sessionId) => {
                setSpotSessions((prev) => prev.filter((s) => s.id !== sessionId));
                handleBackToSpot();
              }}
            />
          ) : paneView === "shares" ? (
            <SpotSharePanel
              spotId={selectedSpot.id}
              spotName={selectedSpot.name}
              onBack={handleBackToSpot}
            />
          ) : paneView === "profiles" ? (
            <SpotPaneProfiles
              spotId={selectedSpot.id}
              onBack={handleBackToSpot}
              onDirectionEditStart={(req) => {
                setDirectionEdit({
                  spotId: selectedSpot.id,
                  field: req.field,
                  selected: req.selected,
                  mode: req.mode,
                });
              }}
              onDirectionEditStop={() => setDirectionEdit(null)}
              directionEditState={directionEdit}
              onWizardOpen={(editProfile, defaultName) => {
                setProfileWizard({
                  spotId: selectedSpot.id,
                  profile: editProfile,
                  defaultName,
                });
              }}
            />
          ) : paneView === "edit" ? (
            <SpotPaneEditSpot
              spot={selectedSpot}
              onBack={handleBackToSpot}
              onSave={handleSpotSaved}
            />
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold truncate">{selectedSpot.name}</h2>
                  {selectedSpot.description && (
                    <p className="text-sm text-muted-foreground mt-1">{selectedSpot.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {parseFloat(selectedSpot.latitude).toFixed(5)}, {parseFloat(selectedSpot.longitude).toFixed(5)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded-md p-2 hover:bg-accent transition-colors">
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setPaneView("edit")}>
                        <Pencil className="size-3.5 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPaneView("profiles")}>
                        <Target className="size-3.5 mr-2" />
                        Condition Profiles
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPaneView("shares")}>
                        <Share2 className="size-3.5 mr-2" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleToggleSilence}>
                        {selectedSpot.alertsSilenced ? (
                          <><Bell className="size-3.5 mr-2" />Enable alerts</>
                        ) : (
                          <><BellOff className="size-3.5 mr-2" />Silence alerts</>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDeleteSpot} disabled={isDeletingSpot} className="text-destructive">
                        <Trash2 className="size-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    onClick={handleCloseSpotDetail}
                    className="rounded-md p-2 hover:bg-accent transition-colors"
                  >
                    <X className="size-5 sm:size-4" />
                  </button>
                </div>
              </div>

              {/* Session count */}
              <div className="px-4 pb-3 border-b">
                <p className="text-sm text-muted-foreground">
                  {loadingSpotSessions
                    ? "Loading sessions..."
                    : `${spotSessions.length} session${spotSessions.length !== 1 ? "s" : ""}`}
                </p>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
                {showAllSessions ? (
                  /* All Sessions view */
                  <div>
                    <button
                      onClick={() => setShowAllSessions(false)}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
                    >
                      <ArrowLeft className="size-4" />
                      Back
                    </button>
                    <h3 className="text-sm font-semibold mb-3">All Sessions</h3>
                    <div className="space-y-3">
                      {spotSessions.map((session) => {
                        const photo = session.photos?.[0]?.photoUrl || session.photoUrl;
                        return (
                          <button
                            key={session.id}
                            onClick={() => handleViewSession(session)}
                            className="block w-full text-left rounded-lg border bg-background/60 overflow-hidden hover:bg-accent/50 transition-colors"
                          >
                            {photo && (
                              <div className="aspect-video w-full overflow-hidden">
                                <img
                                  src={photo}
                                  alt={`Session on ${formatDate(session.date)}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="px-3 py-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p className="font-medium text-sm">{formatDate(session.date)}</p>
                                  {session.ignored && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 shrink-0">
                                      Ignored
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center shrink-0">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <svg
                                      key={i}
                                      className={`w-3 h-3 ${
                                        i < session.rating ? "text-yellow-400" : "text-muted-foreground/30"
                                      }`}
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  ))}
                                </div>
                              </div>
                              {session.notes && (
                                <p className="text-xs text-muted-foreground truncate mt-1">{session.notes}</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Default view: Alerts + Recent Sessions + Conditions */
                  <>
                    {/* Session match alerts */}
                    {selectedSpot.alertsSilenced ? (
                      <div className="rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2.5 flex items-center gap-2">
                        <BellOff className="size-3.5 text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground">
                          Alerts are silenced.{" "}
                          <button onClick={handleToggleSilence} className="text-primary font-medium hover:underline">
                            Enable
                          </button>
                        </p>
                      </div>
                    ) : (
                      <SpotAlertCard spotId={selectedSpot.id} sessionCount={spotSessions.length} />
                    )}

                    {/* Condition Profiles */}
                    {spotProfileCounts[selectedSpot.id] === 0 && (
                      <button
                        onClick={() => setPaneView("profiles")}
                        className="w-full rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-3 py-2.5 text-left hover:bg-yellow-500/15 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="size-3.5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-yellow-700 dark:text-yellow-300">
                            No condition profiles set. Without profiles, alerts can only match against past sessions.{" "}
                            <span className="text-yellow-800 dark:text-yellow-200 font-medium">Add a profile</span>
                          </p>
                        </div>
                      </button>
                    )}


                    {/* Weekly forecast with integrated scores */}
                    <WeeklyForecast spotId={selectedSpot.id} />

                    {/* Recent Sessions section */}
                    {loadingSpotSessions ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : spotSessions.length > 0 ? (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold">Recent Sessions</h3>
                          {spotSessions.length > 2 && (
                            <button
                              onClick={() => setShowAllSessions(true)}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              View all
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {[...spotSessions].sort((a, b) => b.rating - a.rating).slice(0, 2).map((session) => {
                            const photo = session.photos?.[0]?.photoUrl || session.photoUrl;
                            return (
                              <button
                                key={session.id}
                                onClick={() => handleViewSession(session)}
                                className="block w-full text-left rounded-lg border bg-background/60 overflow-hidden hover:bg-accent/50 transition-colors"
                              >
                                {photo && (
                                  <div className="aspect-video w-full overflow-hidden">
                                    <img
                                      src={photo}
                                      alt={`Session on ${formatDate(session.date)}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                )}
                                <div className="px-3 py-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <p className="font-medium text-sm truncate">{formatDate(session.date)}</p>
                                      {session.ignored && (
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 shrink-0">
                                          Ignored
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center shrink-0">
                                      {Array.from({ length: 5 }).map((_, i) => (
                                        <svg
                                          key={i}
                                          className={`w-2.5 h-2.5 ${
                                            i < session.rating ? "text-yellow-400" : "text-muted-foreground/30"
                                          }`}
                                          fill="currentColor"
                                          viewBox="0 0 20 20"
                                        >
                                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                      ))}
                                    </div>
                                  </div>
                                  {session.notes && (
                                    <p className="text-xs text-muted-foreground truncate mt-1">{session.notes}</p>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">No sessions at this spot yet</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => router.push(`/sessions/new?spotId=${selectedSpot.id}`)}
                        >
                          <Plus className="size-3 mr-1" />
                          Add Session
                        </Button>
                      </div>
                    )}

                    {/* Conditions Timeline */}
                    <SpotConditions spotId={selectedSpot.id} />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Shared spot detail pane */}
      {selectedSharedSpot && !selectedSpot && addSpotMode === "idle" && (
        <SharedSpotPane
          sharedSpot={selectedSharedSpot}
          onClose={() => setSelectedSharedSpot(null)}
        />
      )}

      {/* Incoming invites banner */}
      {incomingInvites.length > 0 && !selectedSpot && !selectedSharedSpot && addSpotMode === "idle" && !spotsNeedingAttention.length && (
        <div className="absolute top-4 left-4 right-4 sm:left-auto sm:right-4 z-20 sm:w-96">
          <IncomingInvites
            invites={incomingInvites}
            onResolved={handleInviteResolved}
          />
        </div>
      )}

      {/* Alerts + Sessions/Spots panels — visible when no spot is selected */}
      {!selectedSpot && !selectedSharedSpot && addSpotMode === "idle" && (sessions.length > 0 || alertSummaries.length > 0 || sharedSpots.length > 0 || spots.length > 0) && (
        <div className="absolute bottom-4 left-4 right-4 sm:bottom-auto sm:right-auto sm:top-4 z-10 sm:w-80 flex flex-col gap-3">
          {/* Alerts panel */}
          <div className="rounded-lg border bg-background/90 backdrop-blur-sm shadow-lg overflow-hidden">
            <div className="flex items-center border-b">
              <span className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground">
                Alerts
                {alertSummaries.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                    {alertSummaries.length}
                  </span>
                )}
              </span>
              <button
                onClick={() => setAlertsPanelOpen((o) => !o)}
                className="px-3 py-2.5 hover:bg-accent/50 transition-colors"
              >
                {alertsPanelOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            </div>

            {alertsPanelOpen && (
              <div className="max-h-80 overflow-y-auto">
                {alertSummaries.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-muted-foreground">No upcoming alerts</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Alerts appear when forecast conditions match your best sessions.
                    </p>
                  </div>
                ) : (
                  alertSummaries.map((summary) => {
                    const forecastDate = new Date(summary.forecastHour);
                    const now = new Date();
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const target = new Date(forecastDate.getFullYear(), forecastDate.getMonth(), forecastDate.getDate());
                    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const dayLabel = diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : forecastDate.toLocaleDateString("en-US", { weekday: "short" });

                    const spot = spots.find(s => s.id === summary.spotId);
                    return (
                      <button
                        key={summary.spotId}
                        onClick={() => spot && handleSpotClick(spot)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors w-full text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{summary.spotName}</p>
                          <p className="text-xs text-muted-foreground">{dayLabel} {summary.conditions}</p>
                        </div>
                        <span className="text-xs font-medium text-primary shrink-0">
                          {summary.effectiveScore}%
                        </span>
                      </button>
                    );
                  })
                )}
                {sharedSpots.length > 0 && (
                  <>
                    <div className="border-t" />
                    <SharedSpotsList
                      sharedSpots={sharedSpots}
                      onSpotClick={handleSharedSpotClick}
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Sessions / Spots panel */}
          {(sessions.length > 0 || spots.length > 0) && (
            <div className="rounded-lg border bg-background/90 backdrop-blur-sm shadow-lg overflow-hidden">
              <div className="flex items-center border-b">
                <button
                  onClick={() => { setSessionsTab("sessions"); setSessionsPanelOpen(true); }}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                    sessionsTab === "sessions" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sessions
                </button>
                <button
                  onClick={() => { setSessionsTab("spots"); setSessionsPanelOpen(true); }}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                    sessionsTab === "spots" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Spots
                </button>
                <button
                  onClick={() => setSessionsPanelOpen((o) => !o)}
                  className="px-3 py-2.5 hover:bg-accent/50 transition-colors"
                >
                  {sessionsPanelOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
              </div>

              {sessionsPanelOpen && sessionsTab === "sessions" && (
                <div className="max-h-80 overflow-y-auto">
                  {sessions.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-muted-foreground">No sessions yet</p>
                    </div>
                  ) : (
                    sessions.map((session) => {
                      const photo = session.photos?.[0]?.photoUrl || session.photoUrl;
                      return (
                        <Link
                          key={session.id}
                          href={`/sessions/${session.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors"
                        >
                          {photo && (
                            <img
                              src={photo}
                              alt=""
                              className="w-10 h-10 rounded object-cover shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {session.spot?.name || "Unknown Spot"}
                            </p>
                            <p className="text-xs text-muted-foreground">{formatDate(session.date)}</p>
                          </div>
                          <div className="flex items-center shrink-0">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <svg
                                key={i}
                                className={`w-2.5 h-2.5 ${
                                  i < session.rating ? "text-yellow-400" : "text-muted-foreground/30"
                                }`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            ))}
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              )}

              {sessionsPanelOpen && sessionsTab === "spots" && (
                <div className="max-h-80 overflow-y-auto">
                  {spots.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-muted-foreground">No spots yet</p>
                    </div>
                  ) : (
                    spots.map((spot) => (
                      <button
                        key={spot.id}
                        onClick={() => handleSpotClick(spot)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors w-full text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{spot.name}</p>
                          {spot.description && (
                            <p className="text-xs text-muted-foreground truncate">{spot.description}</p>
                          )}
                        </div>
                        {alertSpotIds.has(spot.id) && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Instruction banner (picking / detailing / fixing) */}
      {addSpotMode !== "idle" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <div className="flex items-center gap-2 rounded-full bg-background/90 backdrop-blur-sm shadow-lg px-4 py-2 text-sm font-medium">
            <span>
              {addSpotMode === "picking"
                ? "Tap the map to place your spot"
                : addSpotMode === "fixing-picking"
                ? `Tap the map to set location for ${fixLocationSpot?.name}`
                : "Tap to adjust location"}
            </span>
            <button
              onClick={addSpotMode.startsWith("fixing") ? handleCancelFixLocation : handleCancelAddSpot}
              className="rounded-full p-1 hover:bg-accent transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom slide-up panel (detailing only) */}
      {addSpotMode === "detailing" && newSpotMarker && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] sm:w-96">
          <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="spot-name">Name</Label>
              <Input
                id="spot-name"
                placeholder="e.g. Pipeline, Rincon…"
                value={newSpotName}
                onChange={(e) => setNewSpotName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spot-desc">Description</Label>
              <Textarea
                id="spot-desc"
                placeholder="Optional notes about this spot…"
                value={newSpotDescription}
                onChange={(e) => setNewSpotDescription(e.target.value)}
                rows={2}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {newSpotMarker.lat.toFixed(5)}, {newSpotMarker.lng.toFixed(5)}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleCancelAddSpot}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveSpot}
                disabled={!newSpotName.trim() || isSavingSpot}
              >
                {isSavingSpot ? <Loader2 className="size-4 animate-spin" /> : "Save Spot"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom slide-up panel (fix location) */}
      {addSpotMode === "fixing-detailing" && newSpotMarker && fixLocationSpot && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] sm:w-96">
          <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg p-4 space-y-3">
            <p className="text-sm font-medium">{fixLocationSpot.name}</p>
            <p className="text-xs text-muted-foreground">
              {newSpotMarker.lat.toFixed(5)}, {newSpotMarker.lng.toFixed(5)}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleCancelFixLocation}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveFixedLocation}
                disabled={isSavingLocation}
              >
                {isSavingLocation ? <Loader2 className="size-4 animate-spin" /> : "Save Location"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Profile wizard overlay — map-centered step-by-step editor */}
      {profileWizard && selectedSpot && (
        <ProfileWizard
          spotId={profileWizard.spotId}
          profile={profileWizard.profile}
          defaultName={profileWizard.defaultName}
          onSave={(saved) => {
            setProfileWizard(null);
            setDirectionEdit(null);
            // Refresh profiles list by toggling pane view
            setPaneView("spot");
            setTimeout(() => setPaneView("profiles"), 0);
          }}
          onCancel={() => {
            setProfileWizard(null);
            setDirectionEdit(null);
          }}
          onDirectionEditStart={(req) => {
            setDirectionEdit({
              spotId: profileWizard.spotId,
              field: req.field,
              selected: req.selected,
              mode: req.mode,
            });
          }}
          onDirectionEditStop={() => setDirectionEdit(null)}
          directionEditState={directionEdit}
        />
      )}
    </div>
  );
}
