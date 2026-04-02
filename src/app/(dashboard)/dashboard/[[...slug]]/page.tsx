"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils/date";
import {
  ArrowLeft,
  CloudSun,
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
  Waves,
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
import { SurfboardIcon } from "@/components/icons/SurfboardIcon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FiveStarHeatmap } from "@/components/spots/FiveStarHeatmap";
import { GearModal } from "@/components/gear/GearModal";
import { ForecastCalendar } from "@/components/forecast-calendar/ForecastCalendar";
import { haversineDistance, getDistancePenalty, getRarityBoost } from "@/lib/utils/geo";
import type { SurfSpot, Surfboard, Wetsuit } from "@/lib/db/schema";
import type { SurfSessionWithConditions, CardinalDirection, ConditionProfileResponse } from "@/types";
import type { WindRoseValue } from "@/components/profiles/WindRose";

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
  const params = useParams<{ slug?: string[] }>();
  const searchParams = useSearchParams();
  const openShareHandled = useRef(false);
  const initialSlug = useRef(params.slug);
  const [spots, setSpots] = useState<SurfSpot[]>([]);
  const [sessions, setSessions] = useState<SurfSessionWithConditions[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertsForecastTab, setAlertsForecastTab] = useState<"alerts" | "forecast">("alerts");
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(true);
  const [sessionsTab, setSessionsTab] = useState<"sessions" | "spots" | "equipment">("sessions");
  const [surfboards, setSurfboards] = useState<Surfboard[]>([]);
  const [wetsuits, setWetsuits] = useState<Wetsuit[]>([]);

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
  const [alertSummaries, setAlertSummaries] = useState<Array<{ spotId: string; spotName: string; effectiveScore: number; travelScore: number; distanceKm: number | null; forecastHour: string; timeWindow: string; conditions: string }>>([]);
  const [spotProfileCounts, setSpotProfileCounts] = useState<Record<string, number>>({});

  // Track which spots are shared (not owned by current user)
  const [sharedSpotIds, setSharedSpotIds] = useState<Set<string>>(new Set());

  // Gear modal
  const [gearModalOpen, setGearModalOpen] = useState(false);

  // Map direction editing overlay
  const [directionEdit, setDirectionEdit] = useState<{
    spotId: string;
    field: string;
    selected: CardinalDirection[];
    mode: "target" | "exclusion";
  } | null>(null);

  // Wind rose editing overlay
  const [windRoseEdit, setWindRoseEdit] = useState<{
    spotId: string;
    value: WindRoseValue;
    onChange: (value: WindRoseValue) => void;
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
  const [dismissedHomeBanner, setDismissedHomeBanner] = useState(false);

  const spotsNeedingAttention = useMemo(() => {
    const items: { spot: SurfSpot; missingLocation: boolean; missingProfile: boolean }[] = [];
    for (const s of spots) {
      if (sharedSpotIds.has(s.id)) continue; // Skip shared spots
      const missingLocation = parseFloat(s.latitude) === 0 && parseFloat(s.longitude) === 0;
      const missingProfile = spotProfileCounts[s.id] === 0;
      if (missingLocation || missingProfile) {
        items.push({ spot: s, missingLocation, missingProfile });
      }
    }
    return items;
  }, [spots, spotProfileCounts, sharedSpotIds]);

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
      handleSpotClick(data.spot);
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
    window.history.pushState(null, "", `/dashboard/spot/${spot.id}`);
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
    setSpotSessions([]);
    setShowAllSessions(false);
    setPaneView("spot");
    setViewingSession(null);
    window.history.pushState(null, "", "/dashboard");
  };


  const handleViewSession = (session: SurfSessionWithConditions) => {
    setViewingSession(session);
    setPaneView("session");
    if (selectedSpot) {
      window.history.pushState(null, "", `/dashboard/spot/${selectedSpot.id}/session/${session.id}`);
    }
  };

  const handleBackToSpot = useCallback(() => {
    setPaneView("spot");
    setViewingSession(null);
    if (selectedSpot) {
      window.history.pushState(null, "", `/dashboard/spot/${selectedSpot.id}`);
      // Refresh profile count for the selected spot
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

  // Listen for "Add Gear" from sidebar
  useEffect(() => {
    const handler = () => setGearModalOpen(true);
    window.addEventListener("open-gear-modal", handler);
    return () => window.removeEventListener("open-gear-modal", handler);
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const parts = path.replace(/^\/dashboard\/?/, "").split("/").filter(Boolean);
      if (parts[0] === "spot" && parts[1]) {
        const spot = spots.find((s) => s.id === parts[1]);
        if (spot) {
          handleSpotClick(spot).then(() => {
            if (parts[2] === "session" && parts[3]) {
              setTimeout(() => {
                setSpotSessions((prev) => {
                  const session = prev.find((s) => s.id === parts[3]);
                  if (session) { setViewingSession(session); setPaneView("session"); }
                  return prev;
                });
              }, 500);
            }
          });
        }
      } else {
        handleCloseSpotDetail();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [spots, handleSpotClick]);

  useEffect(() => {
    Promise.all([
      fetch("/api/spots").then((r) => (r.ok ? r.json() : { spots: [] })),
      fetch("/api/user/location").then((r) => (r.ok ? r.json() : { latitude: null, longitude: null })),
      fetch("/api/sessions?limit=5").then((r) => (r.ok ? r.json() : { sessions: [] })),
      fetch("/api/surfboards").then((r) => (r.ok ? r.json() : { surfboards: [] })),
      fetch("/api/wetsuits").then((r) => (r.ok ? r.json() : { wetsuits: [] })),
    ])
      .then(([spotsData, locationData, sessionsData, surfboardsData, wetsuitsData]) => {
        const allSpots = spotsData.spots || [];
        setSpots(allSpots);
        setSharedSpotIds(new Set(allSpots.filter((s: any) => s.isShared).map((s: any) => s.id)));
        setSessions(sessionsData.sessions || []);
        setSurfboards(surfboardsData.surfboards || []);
        setWetsuits(wetsuitsData.wetsuits || []);
        if (locationData.latitude && locationData.longitude) {
          setHomeLocation({ latitude: locationData.latitude, longitude: locationData.longitude });
        }

        // Fetch alert status and profile counts for each spot (fire-and-forget, non-blocking)
        const spotsList = spotsData.spots || [];
        if (spotsList.length > 0) {
          // Fetch profiles and alerts in parallel, then combine for ranking
          const profilesPromise = Promise.all(
            spotsList.map((s: SurfSpot) =>
              fetch(`/api/spots/${s.id}/profiles`)
                .then(r => r.ok ? r.json() : { profiles: [] })
                .then(data => ({ spotId: s.id, profiles: (data.profiles || []) as Array<{ consistency: 'low' | 'medium' | 'high'; qualityCeiling: number; isActive: boolean }> }))
                .catch(() => ({ spotId: s.id, profiles: [] as Array<{ consistency: 'low' | 'medium' | 'high'; qualityCeiling: number; isActive: boolean }> }))
            )
          );

          const alertsPromise = Promise.all(
            spotsList.map((s: SurfSpot) =>
              fetch(`/api/spots/${s.id}/alerts`)
                .then(r => r.ok ? r.json() : { alerts: [] })
                .then(data => ({ spot: s, alerts: data.alerts || [] }))
                .catch(() => ({ spot: s, alerts: [] }))
            )
          );

          Promise.all([profilesPromise, alertsPromise]).then(([profileResults, alertResults]) => {
            // Build profile counts + per-spot rarity boost
            const counts: Record<string, number> = {};
            const spotRarity: Record<string, number> = {};
            for (const { spotId, profiles } of profileResults) {
              counts[spotId] = profiles.length;
              // Best rarity boost across active profiles for this spot
              let best = 1.0;
              for (const p of profiles) {
                if (p.isActive) {
                  best = Math.max(best, getRarityBoost(p.consistency, p.qualityCeiling));
                }
              }
              spotRarity[spotId] = best;
            }
            setSpotProfileCounts(counts);

            const ids = new Set<string>();
            const summaries: typeof alertSummaries = [];
            const homeLat = locationData.latitude;
            const homeLng = locationData.longitude;
            for (const { spot, alerts } of alertResults) {
              if (alerts.length > 0) {
                ids.add(spot.id);
                // Compute distance from home (if set)
                const distanceKm = (homeLat && homeLng)
                  ? haversineDistance(homeLat, homeLng, parseFloat(spot.latitude), parseFloat(spot.longitude))
                  : null;
                const rarity = spotRarity[spot.id] ?? 1.0;
                // Best alert per day per spot
                const bestByDay = new Map<string, typeof alerts[0]>();
                for (const alert of alerts) {
                  const dayKey = new Date(alert.forecastHour).toDateString();
                  const existing = bestByDay.get(dayKey);
                  if (!existing || alert.effectiveScore > existing.effectiveScore) {
                    bestByDay.set(dayKey, alert);
                  }
                }
                for (const best of bestByDay.values()) {
                  const snapshot = best.forecastSnapshot;
                  const waveHeight = snapshot?.primarySwellHeight != null
                    ? `${(snapshot.primarySwellHeight * 3.28084).toFixed(0)}ft`
                    : '';
                  const period = snapshot?.primarySwellPeriod != null
                    ? `@ ${snapshot.primarySwellPeriod.toFixed(0)}s`
                    : '';
                  const score = Math.round(best.effectiveScore);
                  const distancePenalty = distanceKm != null ? getDistancePenalty(distanceKm) : 1;
                  summaries.push({
                    spotId: spot.id,
                    spotName: spot.name,
                    effectiveScore: score,
                    travelScore: Math.round(score * distancePenalty * rarity),
                    distanceKm,
                    forecastHour: best.forecastHour,
                    timeWindow: best.timeWindow,
                    conditions: [waveHeight, period].filter(Boolean).join(' '),
                  });
                }
              }
            }
            setAlertSpotIds(ids);
            // Sort by distance + rarity adjusted score
            setAlertSummaries(summaries.sort((a, b) => b.travelScore - a.travelScore));
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Auto-open shared spot from invite onboarding redirect
  useEffect(() => {
    if (loading || spots.length === 0 || openShareHandled.current) return;
    const openShareId = searchParams.get("openShare");
    if (!openShareId) return;
    openShareHandled.current = true;
    const match = spots.find((s: any) => s.shareId === openShareId);
    if (match) {
      handleSpotClick(match);
    }
    router.replace("/dashboard");
  }, [loading, spots, searchParams, router, handleSpotClick]);

  // Restore spot/session from URL on initial load (e.g. /dashboard/spot/:id/session/:sid)
  useEffect(() => {
    const slug = initialSlug.current;
    if (!slug || slug.length < 2 || slug[0] !== "spot" || loading || spots.length === 0) return;
    const spotId = slug[1];
    const spot = spots.find((s) => s.id === spotId);
    if (!spot) return;
    const sessionId = slug.length >= 4 && slug[2] === "session" ? slug[3] : null;
    handleSpotClick(spot).then(() => {
      if (sessionId) {
        // Wait briefly for sessions to load, then select the session
        const trySelect = () => {
          setSpotSessions((prev) => {
            const session = prev.find((s) => s.id === sessionId);
            if (session) {
              setViewingSession(session);
              setPaneView("session");
            }
            return prev;
          });
        };
        setTimeout(trySelect, 500);
      }
    });
    initialSlug.current = undefined; // Only run once
  }, [loading, spots, handleSpotClick]);

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
    [selectedSpot, profileWizard]
  );

  return (
    <div className={`relative h-full w-full${addSpotMode !== "idle" ? " cursor-crosshair" : ""}`}>
      {loading ? (
        <div className="h-full w-full flex items-center justify-center bg-muted">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <SpotMap
        spots={spots}
        interactive={addSpotMode !== "idle"}
        onMapClick={addSpotMode !== "idle" ? handleMapClick : undefined}
        onSpotClick={addSpotMode === "idle" ? handleSpotClick : undefined}
        selectedSpotId={selectedSpot?.id}
        newSpotMarker={newSpotMarker}
        flyToPadding={flyToPadding}
        alertSpotIds={alertSpotIds}
        {...(initialViewState && { initialViewState })}
        directionEdit={directionEdit && selectedSpot ? {
          spotId: selectedSpot.id,
          selected: directionEdit.selected,
          mode: directionEdit.mode,
          onChange: (dirs) => setDirectionEdit(prev => prev ? { ...prev, selected: dirs } : null),
        } : undefined}
        windRoseEdit={windRoseEdit}
        wizardSpotId={profileWizard?.spotId}
      />
      )}

      {/* Spots needing attention banner */}
      {spotsNeedingAttention.length > 0 && !dismissedLocationBanner && !selectedSpot && addSpotMode === "idle" && (
        <div className="absolute top-4 left-4 right-4 sm:left-auto sm:right-4 z-20 sm:w-96">
          <div className="rounded-lg border border-amber-500/40 bg-background/95 backdrop-blur-sm shadow-[--shadow-popover] p-4 max-h-[calc(100vh-2rem)] flex flex-col">
            <div className="flex items-start gap-3 min-h-0">
              <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                <p className="text-sm font-medium shrink-0">
                  {spotsNeedingAttention.length === 1
                    ? "1 spot needs your attention"
                    : `${spotsNeedingAttention.length} spots need your attention`}
                </p>
                <p className="text-xs text-muted-foreground mt-1 shrink-0">
                  Complete your spots to get accurate alerts and conditions.
                </p>
                <div className="mt-3 space-y-2 overflow-y-auto pb-4">
                  {spotsNeedingAttention.map(({ spot, missingLocation, missingProfile }) => (
                    <div key={spot.id} className="rounded-lg border border-dashed px-3 py-2 space-y-1.5">
                      <p className="text-sm font-medium truncate">{spot.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {missingLocation && (
                          <button
                            onClick={() => handleFixLocation(spot)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-accent/50 px-2.5 py-1 text-xs hover:bg-accent transition-all duration-100"
                          >
                            <MapPin className="size-3" />
                            <span>Set location</span>
                          </button>
                        )}
                        {missingProfile && (
                          <button
                            onClick={() => { handleSpotClick(spot); setPaneView("profiles"); }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-accent/50 px-2.5 py-1 text-xs hover:bg-accent transition-all duration-100"
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
                className="rounded-md p-1 hover:bg-accent transition-all duration-100 shrink-0"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Home location missing banner */}
      {!homeLocation && !loading && !dismissedHomeBanner && !selectedSpot && addSpotMode === "idle" && spotsNeedingAttention.length === 0 && (
        <div className="absolute top-4 left-4 right-4 sm:left-auto sm:right-4 z-20 sm:w-96">
          <div className="rounded-lg border border-amber-500/40 bg-background/95 backdrop-blur-sm shadow-[--shadow-popover] p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Set your home location</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add your home location so we can center your map and show nearby conditions.
                </p>
                <button
                  onClick={() => router.push("/settings")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent/50 px-2.5 py-1 text-xs hover:bg-accent transition-all duration-100 mt-2"
                >
                  <MapPin className="size-3" />
                  <span>Set location</span>
                </button>
              </div>
              <button
                onClick={() => setDismissedHomeBanner(true)}
                className="rounded-md p-1 hover:bg-accent transition-all duration-100 shrink-0"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spot detail pane — hidden when profile wizard is active */}
      {selectedSpot && addSpotMode === "idle" && !profileWizard && (
        <div className="absolute inset-0 sm:inset-auto sm:top-4 sm:left-4 sm:bottom-4 z-20 w-full sm:w-[50vw] sm:max-w-[800px] flex flex-col sm:rounded-lg border bg-background/95 sm:bg-background/90 backdrop-blur-sm shadow-[--shadow-popover] overflow-hidden">
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
                  <h2 className="text-xl font-bold tracking-[-0.02em] truncate">{selectedSpot.name}</h2>
                  {selectedSpot.description && (
                    <p className="text-sm text-muted-foreground mt-1">{selectedSpot.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {parseFloat(selectedSpot.latitude).toFixed(5)}, {parseFloat(selectedSpot.longitude).toFixed(5)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!sharedSpotIds.has(selectedSpot.id) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded-md p-2 hover:bg-accent transition-all duration-100">
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
                  )}
                  <button
                    onClick={handleCloseSpotDetail}
                    className="rounded-md p-2 hover:bg-accent transition-all duration-100"
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
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
                {showAllSessions ? (
                  /* All Sessions view */
                  <div>
                    <button
                      onClick={() => setShowAllSessions(false)}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-all duration-100 mb-3"
                    >
                      <ArrowLeft className="size-4" />
                      Back
                    </button>
                    <h3 className="text-sm font-semibold tracking-[-0.01em] mb-3">All Sessions</h3>
                    <div className="space-y-3">
                      {spotSessions.map((session) => {
                        const photo = session.photos?.[0]?.photoUrl || session.photoUrl;
                        return (
                          <button
                            key={session.id}
                            onClick={() => handleViewSession(session)}
                            className="block w-full text-left rounded-lg border bg-background/60 overflow-hidden hover:bg-accent/50 transition-all duration-100"
                          >
                            {photo && (
                              <div className="relative aspect-video w-full overflow-hidden">
                                <img
                                  src={photo}
                                  alt={`Session on ${formatDate(session.date)}`}
                                  className="w-full h-full object-cover"
                                />
                                {session.friendUser && (
                                  <Avatar className="absolute bottom-1.5 left-1.5 size-6 border-2 border-background shadow">
                                    <AvatarImage src={session.friendUser.image ?? undefined} />
                                    <AvatarFallback className="text-[10px]">
                                      {session.friendUser.name?.charAt(0) ?? "?"}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                              </div>
                            )}
                            <div className="px-3 py-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {!photo && session.friendUser && (
                                    <Avatar className="size-5 shrink-0">
                                      <AvatarImage src={session.friendUser.image ?? undefined} />
                                      <AvatarFallback className="text-[8px]">
                                        {session.friendUser.name?.charAt(0) ?? "?"}
                                      </AvatarFallback>
                                    </Avatar>
                                  )}
                                  <p className="font-medium text-sm">{formatDate(session.date)}</p>
                                  {session.friendUser && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0">
                                      {session.friendUser.name?.split(" ")[0] ?? "Friend"}
                                    </span>
                                  )}
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
                    {/* Alerts */}
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
                      <div className="rounded-lg border bg-background/60 overflow-hidden p-3">
                        <SpotAlertCard spotId={selectedSpot.id} sessionCount={spotSessions.length} embedded />
                      </div>
                    )}

                    {/* Forecast */}
                    <div className="rounded-lg border bg-background/60 overflow-hidden">
                      <WeeklyForecast spotId={selectedSpot.id} embedded />
                    </div>

                    {/* Condition Profiles */}
                    {spotProfileCounts[selectedSpot.id] === 0 && !sharedSpotIds.has(selectedSpot.id) && (
                      <button
                        onClick={() => setPaneView("profiles")}
                        className="w-full rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-3 py-2.5 text-left hover:bg-yellow-500/15 transition-all duration-100"
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

                    {/* Recent Sessions section */}
                    {loadingSpotSessions ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : spotSessions.length > 0 ? (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold tracking-[-0.01em]">Recent Sessions</h3>
                          {spotSessions.length > 2 && (
                            <button
                              onClick={() => setShowAllSessions(true)}
                              className="text-xs text-muted-foreground hover:text-foreground transition-all duration-100"
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
                                className="block w-full text-left rounded-lg border bg-background/60 overflow-hidden hover:bg-accent/50 transition-all duration-100"
                              >
                                {photo && (
                                  <div className="relative aspect-video w-full overflow-hidden">
                                    <img
                                      src={photo}
                                      alt={`Session on ${formatDate(session.date)}`}
                                      className="w-full h-full object-cover"
                                    />
                                    {session.friendUser && (
                                      <Avatar className="absolute bottom-1.5 left-1.5 size-5 border-2 border-background shadow">
                                        <AvatarImage src={session.friendUser.image ?? undefined} />
                                        <AvatarFallback className="text-[8px]">
                                          {session.friendUser.name?.charAt(0) ?? "?"}
                                        </AvatarFallback>
                                      </Avatar>
                                    )}
                                  </div>
                                )}
                                <div className="px-3 py-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      {!photo && session.friendUser && (
                                        <Avatar className="size-4 shrink-0">
                                          <AvatarImage src={session.friendUser.image ?? undefined} />
                                          <AvatarFallback className="text-[7px]">
                                            {session.friendUser.name?.charAt(0) ?? "?"}
                                          </AvatarFallback>
                                        </Avatar>
                                      )}
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

                    {/* 5-Star Condition Frequency */}
                    <FiveStarHeatmap spotId={selectedSpot.id} />

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
      {/* Alerts + Sessions/Spots panels — visible when no spot is selected */}
      {!selectedSpot && addSpotMode === "idle" && (
        <div className="absolute bottom-4 left-4 right-4 sm:bottom-auto sm:right-auto sm:top-4 z-10 sm:w-80 flex flex-col gap-3">
          {loading ? (
            /* Skeleton panels while data loads */
            <>
              <div className="rounded-lg border bg-background/90 backdrop-blur-sm shadow-[--shadow-popover] overflow-hidden">
                <div className="px-4 py-2.5 border-b">
                  <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                </div>
                <div className="space-y-1 p-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 px-2 py-2">
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-24 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-background/90 backdrop-blur-sm shadow-[--shadow-popover] overflow-hidden">
                <div className="flex items-center border-b gap-2 px-4 py-2.5">
                  <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-12 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-10 bg-muted animate-pulse rounded" />
                </div>
                <div className="space-y-1 p-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-3 px-2 py-2">
                      <div className="w-10 h-10 bg-muted animate-pulse rounded shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-24 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (sessions.length > 0 || alertSummaries.length > 0 || spots.length > 0 || surfboards.length > 0 || wetsuits.length > 0) ? (
            <>
          {/* Alerts + Forecast tabbed panel */}
          <div className="rounded-lg border bg-background/90 backdrop-blur-sm shadow-[--shadow-popover] overflow-hidden">
            <div className="flex border-b">
              <button
                onClick={() => setAlertsForecastTab("alerts")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all duration-100 ${
                  alertsForecastTab === "alerts"
                    ? "text-foreground border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Bell className="size-3.5" />
                Alerts
                {alertSummaries.length > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                    {alertSummaries.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setAlertsForecastTab("forecast")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all duration-100 ${
                  alertsForecastTab === "forecast"
                    ? "text-foreground border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CloudSun className="size-3.5" />
                Forecast
              </button>
            </div>

            {alertsForecastTab === "alerts" ? (
              <div className="max-h-80 overflow-y-auto">
                {alertSummaries.length === 0 ? (
                  <div className="px-4 py-3 text-center">
                    <p className="text-sm text-muted-foreground">No upcoming alerts</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Alerts appear when forecast conditions match your best sessions.
                    </p>
                  </div>
                ) : (
                  (() => {
                    const now = new Date();
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                    // Group alerts by day
                    const grouped = new Map<string, { label: string; sortKey: number; items: typeof alertSummaries }>();
                    for (const summary of alertSummaries) {
                      const forecastDate = new Date(summary.forecastHour);
                      const target = new Date(forecastDate.getFullYear(), forecastDate.getMonth(), forecastDate.getDate());
                      const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                      const dayKey = target.toISOString().slice(0, 10);
                      const dayLabel = diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : forecastDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

                      if (!grouped.has(dayKey)) {
                        grouped.set(dayKey, { label: dayLabel, sortKey: diffDays, items: [] });
                      }
                      grouped.get(dayKey)!.items.push(summary);
                    }

                    // Sort groups by date
                    const sortedGroups = [...grouped.entries()].sort((a, b) => a[1].sortKey - b[1].sortKey);

                    return sortedGroups.map(([dayKey, group]) => (
                      <div key={dayKey}>
                        <div className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30 border-b">
                          {group.label}
                        </div>
                        {group.items.map((summary) => {
                          const spot = spots.find(s => s.id === summary.spotId);
                          return (
                            <button
                              key={`${summary.spotId}:${summary.forecastHour}`}
                              onClick={() => spot && handleSpotClick(spot)}
                              className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-all duration-100 w-full text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{summary.spotName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {summary.timeWindow} · {summary.conditions}
                                  {summary.distanceKm != null && summary.distanceKm > 5 && (
                                    <> · {summary.distanceKm < 1.6 ? `${(summary.distanceKm * 1000).toFixed(0)}m` : `${(summary.distanceKm * 0.621371).toFixed(0)}mi`}</>
                                  )}
                                </p>
                              </div>
                              <span className="text-xs font-medium text-primary shrink-0">
                                {summary.effectiveScore}%
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ));
                  })()
                )}
              </div>
            ) : spots.length > 0 ? (
              <ForecastCalendar
                spots={spots.map(s => ({ id: s.id, name: s.name }))}
                onSpotClick={(spotId) => {
                  const spot = spots.find(s => s.id === spotId);
                  if (spot) handleSpotClick(spot);
                }}
                embedded
              />
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">No spots added yet</p>
              </div>
            )}
          </div>

          {/* Sessions / Spots panel */}
          {(sessions.length > 0 || spots.length > 0 || surfboards.length > 0 || wetsuits.length > 0) && (
            <div className="rounded-lg border bg-background/90 backdrop-blur-sm shadow-[--shadow-popover] overflow-hidden">
              <div className="flex border-b">
                <button
                  onClick={() => { setSessionsTab("sessions"); setSessionsPanelOpen(true); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all duration-100 ${
                    sessionsTab === "sessions"
                      ? "text-foreground border-b-2 border-primary -mb-px"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Waves className="size-3.5" />
                  Sessions
                </button>
                <button
                  onClick={() => { setSessionsTab("spots"); setSessionsPanelOpen(true); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all duration-100 ${
                    sessionsTab === "spots"
                      ? "text-foreground border-b-2 border-primary -mb-px"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MapPin className="size-3.5" />
                  Spots
                </button>
                <button
                  onClick={() => { setSessionsTab("equipment"); setSessionsPanelOpen(true); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all duration-100 ${
                    sessionsTab === "equipment"
                      ? "text-foreground border-b-2 border-primary -mb-px"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <SurfboardIcon className="size-3.5" />
                  Gear
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
                        <button
                          key={session.id}
                          onClick={async () => {
                            const spot = spots.find((s) => s.id === session.spotId);
                            if (spot) {
                              await handleSpotClick(spot);
                              handleViewSession(session);
                            }
                          }}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-all duration-100 w-full text-left"
                        >
                          <div className="relative shrink-0">
                            {photo && (
                              <img
                                src={photo}
                                alt=""
                                className="w-10 h-10 rounded object-cover"
                              />
                            )}
                            {session.friendUser && photo && (
                              <Avatar className="absolute -bottom-1 -left-1 size-5 border-2 border-background shadow">
                                <AvatarImage src={session.friendUser.image ?? undefined} />
                                <AvatarFallback className="text-[8px]">
                                  {session.friendUser.name?.charAt(0) ?? "?"}
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">
                                {session.spot?.name || "Unknown Spot"}
                              </p>
                              {session.friendUser && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0">
                                  {session.friendUser.name?.split(" ")[0] ?? "Friend"}
                                </span>
                              )}
                            </div>
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
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {sessionsPanelOpen && sessionsTab === "equipment" && (
                <div className="max-h-80 overflow-y-auto">
                  {surfboards.length === 0 && wetsuits.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-muted-foreground">No gear yet</p>
                    </div>
                  ) : (
                    [...surfboards.map((b) => ({ ...b, _type: "surfboard" as const })), ...wetsuits.map((w) => ({ ...w, _type: "wetsuit" as const }))]
                      .sort((a, b) => ((b as any).sessionCount || 0) - ((a as any).sessionCount || 0))
                      .map((item) => {
                        const subtitle = item._type === "surfboard"
                          ? [item.brand, item.model, item.boardType].filter(Boolean).join(" · ")
                          : [item.brand, (item as Wetsuit).thickness ? `${(item as Wetsuit).thickness}mm` : null, (item as Wetsuit).style].filter(Boolean).join(" · ");
                        return (
                          <button
                            key={item.id}
                            onClick={() => setGearModalOpen(true)}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-all duration-100 w-full text-left"
                          >
                            {item._type === "surfboard" && (item as Surfboard).photoUrl && (
                              <img
                                src={(item as Surfboard).photoUrl!}
                                alt=""
                                className="w-10 h-10 rounded object-cover shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium truncate ${item.retired ? "opacity-50" : ""}`}>
                                {item.name}
                                {item.retired && <span className="ml-1.5 text-xs text-muted-foreground">(retired)</span>}
                              </p>
                              {subtitle && (
                                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {(item as any).sessionCount > 0
                                ? `${(item as any).sessionCount} session${(item as any).sessionCount === 1 ? "" : "s"}`
                                : item._type === "surfboard" ? "Board" : "Wetsuit"}
                            </span>
                          </button>
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
                    [...spots]
                      .sort((a, b) => {
                        if (!homeLocation) return 0;
                        const distA = haversineDistance(homeLocation.latitude, homeLocation.longitude, parseFloat(a.latitude), parseFloat(a.longitude));
                        const distB = haversineDistance(homeLocation.latitude, homeLocation.longitude, parseFloat(b.latitude), parseFloat(b.longitude));
                        return distA - distB;
                      })
                      .map((spot) => {
                        const distMi = homeLocation
                          ? haversineDistance(homeLocation.latitude, homeLocation.longitude, parseFloat(spot.latitude), parseFloat(spot.longitude)) * 0.621371
                          : null;
                        return (
                      <button
                        key={spot.id}
                        onClick={() => handleSpotClick(spot)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-all duration-100 w-full text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{spot.name}</p>
                          {spot.description && (
                            <p className="text-xs text-muted-foreground truncate">{spot.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {distMi !== null && (
                            <span className="text-xs text-muted-foreground">{distMi < 1 ? distMi.toFixed(1) : Math.round(distMi)} mi</span>
                          )}
                          {alertSpotIds.has(spot.id) && (
                            <span className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                      </button>
                        );
                      })
                  )}
                </div>
              )}
            </div>
          )}
            </>
          ) : null}
        </div>
      )}

      {/* Instruction banner (picking / detailing / fixing) */}
      {addSpotMode !== "idle" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <div className="flex items-center gap-2 rounded-full bg-background/90 backdrop-blur-sm shadow-[--shadow-popover] px-4 py-2 text-sm font-medium">
            <span>
              {addSpotMode === "picking"
                ? "Tap the map to place your spot"
                : addSpotMode === "fixing-picking"
                ? `Tap the map to set location for ${fixLocationSpot?.name}`
                : "Tap to adjust location"}
            </span>
            <button
              onClick={addSpotMode.startsWith("fixing") ? handleCancelFixLocation : handleCancelAddSpot}
              className="rounded-full p-1 hover:bg-accent transition-all duration-100"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom slide-up panel (detailing only) */}
      {addSpotMode === "detailing" && newSpotMarker && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] sm:w-96">
          <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-[--shadow-popover] p-4 space-y-3">
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
          <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-[--shadow-popover] p-4 space-y-3">
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
            setWindRoseEdit(null);
            // Refresh profiles list by toggling pane view
            setPaneView("spot");
            setTimeout(() => setPaneView("profiles"), 0);
          }}
          onCancel={() => {
            setProfileWizard(null);
            setDirectionEdit(null);
            setWindRoseEdit(null);
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
          onWindRoseEditStart={(value, onChange, mode) => {
            setWindRoseEdit({
              spotId: profileWizard.spotId,
              value,
              onChange: (v) => { onChange(v); setWindRoseEdit(prev => prev ? { ...prev, value: v } : null); },
              mode,
            });
          }}
          onWindRoseEditStop={() => setWindRoseEdit(null)}
        />
      )}

      <GearModal
        open={gearModalOpen}
        onClose={() => setGearModalOpen(false)}
        onChanged={async () => {
          const [boardsRes, suitsRes] = await Promise.all([
            fetch("/api/surfboards").then((r) => r.ok ? r.json() : { surfboards: [] }),
            fetch("/api/wetsuits").then((r) => r.ok ? r.json() : { wetsuits: [] }),
          ]);
          setSurfboards(boardsRes.surfboards || []);
          setWetsuits(suitsRes.wetsuits || []);
        }}
      />
    </div>
  );
}
