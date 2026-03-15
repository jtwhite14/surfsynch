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
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { SpotConditions } from "@/components/spots/SpotConditions";
import type { SurfSpot } from "@/lib/db/schema";
import type { SurfSessionWithConditions } from "@/types";

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
  const [panelOpen, setPanelOpen] = useState(true);

  const [homeLocation, setHomeLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Add Spot state machine
  const [addSpotMode, setAddSpotMode] = useState<"idle" | "picking" | "detailing">("idle");
  const [newSpotMarker, setNewSpotMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [newSpotName, setNewSpotName] = useState("");
  const [newSpotDescription, setNewSpotDescription] = useState("");
  const [isSavingSpot, setIsSavingSpot] = useState(false);

  // Spot detail pane
  const [selectedSpot, setSelectedSpot] = useState<SurfSpot | null>(null);
  const [spotSessions, setSpotSessions] = useState<SurfSessionWithConditions[]>([]);
  const [loadingSpotSessions, setLoadingSpotSessions] = useState(false);
  const [editingSpot, setEditingSpot] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingSpot, setIsDeletingSpot] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);

  const handleStartAddSpot = () => {
    setSelectedSpot(null);
    setAddSpotMode("picking");
    setNewSpotMarker(null);
    setNewSpotName("");
    setNewSpotDescription("");
  };

  const handleMapClick = (lat: number, lng: number) => {
    setNewSpotMarker({ lat, lng });
    setAddSpotMode("detailing");
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
    setEditingSpot(false);
    setShowAllSessions(false);
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
    setSpotSessions([]);
    setEditingSpot(false);
    setShowAllSessions(false);
  };

  const handleStartEdit = () => {
    if (!selectedSpot) return;
    setEditName(selectedSpot.name);
    setEditDescription(selectedSpot.description || "");
    setEditingSpot(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedSpot || !editName.trim()) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/spots?id=${selectedSpot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSpots((prev) => prev.map((s) => (s.id === data.spot.id ? data.spot : s)));
      setSelectedSpot(data.spot);
      setEditingSpot(false);
      toast.success("Spot updated!");
    } catch {
      toast.error("Failed to update spot");
    } finally {
      setIsSavingEdit(false);
    }
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
    ])
      .then(([spotsData, locationData, sessionsData]) => {
        setSpots(spotsData.spots || []);
        setSessions(sessionsData.sessions || []);
        if (locationData.latitude && locationData.longitude) {
          setHomeLocation({ latitude: locationData.latitude, longitude: locationData.longitude });
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
  const flyToPadding = useMemo(
    () => (selectedSpot ? { left: typeof window !== "undefined" ? window.innerWidth * 0.5 : 700 } : undefined),
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
        {...(initialViewState && { initialViewState })}
      />

      {/* Spot detail pane */}
      {selectedSpot && addSpotMode === "idle" && (
        <div className="absolute top-4 left-4 bottom-4 z-20 w-[calc(100%-2rem)] sm:w-[50vw] sm:max-w-[800px] flex flex-col rounded-lg border bg-background/90 backdrop-blur-sm shadow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              {editingSpot ? (
                <div className="space-y-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    className="text-lg font-bold"
                  />
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingSpot(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveEdit}
                      disabled={!editName.trim() || isSavingEdit}
                    >
                      {isSavingEdit ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold truncate">{selectedSpot.name}</h2>
                  {selectedSpot.description && (
                    <p className="text-sm text-muted-foreground mt-1">{selectedSpot.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {parseFloat(selectedSpot.latitude).toFixed(5)}, {parseFloat(selectedSpot.longitude).toFixed(5)}
                  </p>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!editingSpot && (
                <>
                  <button
                    onClick={handleStartEdit}
                    className="rounded-md p-1.5 hover:bg-accent transition-colors"
                    title="Edit spot"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={handleDeleteSpot}
                    disabled={isDeletingSpot}
                    className="rounded-md p-1.5 hover:bg-destructive/10 text-destructive transition-colors"
                    title="Delete spot"
                  >
                    {isDeletingSpot ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </>
              )}
              <button
                onClick={handleCloseSpotDetail}
                className="rounded-md p-1.5 hover:bg-accent transition-colors"
              >
                <X className="size-4" />
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
                      <Link
                        key={session.id}
                        href={`/sessions/${session.id}`}
                        className="block rounded-lg border bg-background/60 overflow-hidden hover:bg-accent/50 transition-colors"
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
                            <p className="font-medium text-sm">{formatDate(session.date)}</p>
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
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Default view: Recent Sessions + Conditions */
              <>
                {/* Recent Sessions section */}
                {loadingSpotSessions ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : spotSessions.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Recent Sessions</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {spotSessions.slice(0, 2).map((session) => {
                        const photo = session.photos?.[0]?.photoUrl || session.photoUrl;
                        return (
                          <Link
                            key={session.id}
                            href={`/sessions/${session.id}`}
                            className="block rounded-lg border bg-background/60 overflow-hidden hover:bg-accent/50 transition-colors"
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
                                <p className="font-medium text-sm truncate">{formatDate(session.date)}</p>
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
                          </Link>
                        );
                      })}
                    </div>
                    {spotSessions.length > 2 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => setShowAllSessions(true)}
                      >
                        View All Sessions ({spotSessions.length})
                      </Button>
                    )}
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
        </div>
      )}

      {/* Recent Sessions panel — visible when no spot is selected */}
      {!selectedSpot && addSpotMode === "idle" && sessions.length > 0 && (
        <div className="absolute top-4 left-4 z-10 w-[calc(100%-2rem)] sm:w-80">
          <div className="rounded-lg border bg-background/90 backdrop-blur-sm shadow-lg overflow-hidden">
            <button
              onClick={() => setPanelOpen((o) => !o)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors"
            >
              <span>Recent Sessions</span>
              {panelOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            {panelOpen && (
              <div className="border-t max-h-80 overflow-y-auto">
                {sessions.map((session) => {
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
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instruction banner (picking / detailing) */}
      {addSpotMode !== "idle" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <div className="flex items-center gap-2 rounded-full bg-background/90 backdrop-blur-sm shadow-lg px-4 py-2 text-sm font-medium">
            <span>
              {addSpotMode === "picking"
                ? "Tap the map to place your spot"
                : "Tap to adjust location"}
            </span>
            <button
              onClick={handleCancelAddSpot}
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
    </div>
  );
}
