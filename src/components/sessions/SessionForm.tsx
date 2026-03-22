"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { extractExifData, isExifSupported } from "@/lib/utils/exif";
import { SurfSpot, Surfboard, Wetsuit } from "@/lib/db/schema";
import { findNearestSpot } from "@/lib/utils/geo";
import { groupPhotosBySession, PhotoGroup } from "@/lib/utils/photo-grouping";
import { EquipmentSelect } from "@/components/equipment/EquipmentSelect";
import { EquipmentFormDialog } from "@/components/equipment/EquipmentFormDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, MapPin } from "lucide-react";
import dynamic from "next/dynamic";

const SpotMap = dynamic(() => import("@/components/map/SpotMap"), { ssr: false });

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_DIMENSION = 2048;

function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (file.size <= MAX_FILE_SIZE) {
      resolve(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas error")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.85;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error("Compress failed")); return; }
            if (blob.size > MAX_FILE_SIZE && quality > 0.3) { quality -= 0.15; tryCompress(); }
            else resolve(blob);
          },
          "image/jpeg",
          quality
        );
      };
      tryCompress();
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

interface SessionFormProps {
  spots: SurfSpot[];
  defaultSpotId?: string;
  surfboards?: Surfboard[];
  wetsuits?: Wetsuit[];
}

interface UploadedPhoto {
  id: string;
  photoUrl: string;
  exifData: { dateTime?: string; latitude?: number; longitude?: number } | null;
  isDuplicate?: boolean;
  existingSessionDate?: string;
}

interface SessionDraft {
  spotId: string;
  date: Date;
  startTime: string;
  endTime: string;
  rating: number;
  notes: string;
  photoUrls: string[];
  expanded: boolean;
  activePhotoIndex: number;
  surfboardId: string;
  wetsuitId: string;
}

function deriveSessionDraft(group: PhotoGroup, spots: SurfSpot[], defaultSpotId?: string): SessionDraft {
  let spotId = defaultSpotId || "";
  let date = new Date();
  let startTime = "09:00";
  let endTime = "";

  if (group.earliestTime) {
    date = group.earliestTime;
    const hours = group.earliestTime.getHours().toString().padStart(2, "0");
    const minutes = group.earliestTime.getMinutes().toString().padStart(2, "0");
    startTime = `${hours}:${minutes}`;
  }

  if (group.latestTime && group.earliestTime && group.latestTime.getTime() !== group.earliestTime.getTime()) {
    const endHours = group.latestTime.getHours().toString().padStart(2, "0");
    const endMinutes = group.latestTime.getMinutes().toString().padStart(2, "0");
    endTime = `${endHours}:${endMinutes}`;
  }

  if (group.centroidLat && group.centroidLng && spots.length > 0) {
    const nearest = findNearestSpot(group.centroidLat, group.centroidLng, spots);
    if (nearest && nearest.distance < 10) {
      spotId = nearest.spot.id;
    }
  }

  const photoUrls = group.photos
    .map((p) => p.photoUrl)
    .filter((url) => !url.startsWith("blob:"));

  return { spotId, date, startTime, endTime, rating: 3, notes: "", photoUrls, expanded: false, activePhotoIndex: 0, surfboardId: "", wetsuitId: "" };
}

export function SessionForm({ spots: initialSpots, defaultSpotId, surfboards: initialSurfboards = [], wetsuits: initialWetsuits = [] }: SessionFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<"photo" | "details">("photo");

  // Local mutable copies of spots/equipment (so inline-created items appear immediately)
  const [spots, setSpots] = useState<SurfSpot[]>(initialSpots);
  const [surfboards, setSurfboards] = useState<Surfboard[]>(initialSurfboards);
  const [wetsuits, setWetsuits] = useState<Wetsuit[]>(initialWetsuits);

  // Photo upload state
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [photoGroups, setPhotoGroups] = useState<PhotoGroup[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-session details state
  const [sessionDrafts, setSessionDrafts] = useState<SessionDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add new spot dialog
  const [addSpotOpen, setAddSpotOpen] = useState(false);
  const [addSpotDraftIdx, setAddSpotDraftIdx] = useState(0);
  const [newSpotName, setNewSpotName] = useState("");
  const [newSpotDescription, setNewSpotDescription] = useState("");
  const [isSavingSpot, setIsSavingSpot] = useState(false);
  const [newSpotLocation, setNewSpotLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Add new equipment dialogs
  const [equipDialogType, setEquipDialogType] = useState<"surfboard" | "wetsuit">("surfboard");
  const [equipDialogOpen, setEquipDialogOpen] = useState(false);
  const [equipDraftIdx, setEquipDraftIdx] = useState(0);

  // Create upload session on mount
  useEffect(() => {
    async function createUploadSession() {
      setIsCreatingSession(true);
      try {
        const res = await fetch("/api/upload-sessions", { method: "POST" });
        if (!res.ok) throw new Error("Failed to create upload session");
        const data = await res.json();
        setUploadSessionId(data.id);
        setToken(data.token);
      } catch (err) {
        console.error("Error creating upload session:", err);
      } finally {
        setIsCreatingSession(false);
      }
    }
    createUploadSession();
  }, []);

  // Re-group photos whenever the photo list changes
  useEffect(() => {
    if (photos.length === 0) {
      setPhotoGroups([]);
      return;
    }
    const groups = groupPhotosBySession(photos);
    setPhotoGroups(groups);
  }, [photos]);

  // Poll for photos uploaded via QR code
  useEffect(() => {
    if (!uploadSessionId || step !== "photo") return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/upload-sessions?id=${uploadSessionId}`);
        if (res.ok) {
          const data = await res.json();
          const uploadedPhotos = data.uploadSession?.photos || data.photos;
          if (uploadedPhotos && uploadedPhotos.length > 0) {
            setPhotos((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const newPhotos = uploadedPhotos
                .filter((p: UploadedPhoto) => !existingIds.has(p.id))
                .map((p: UploadedPhoto & { existingSessionDate?: string }) => ({
                  ...p,
                  isDuplicate: p.isDuplicate || false,
                  existingSessionDate: p.existingSessionDate || undefined,
                }));
              return [...prev, ...newPhotos];
            });
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    };

    pollingRef.current = setInterval(poll, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [uploadSessionId, step]);

  // Handle direct file upload
  const handleDesktopUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      let exifData: UploadedPhoto["exifData"] = null;

      if (isExifSupported(file)) {
        try {
          exifData = await extractExifData(file) as UploadedPhoto["exifData"];
        } catch (error) {
          console.error("Error extracting EXIF:", error);
        }
      }

      if (token) {
        try {
          const processedFile = await resizeImage(file);
          const formData = new FormData();
          formData.append("file", processedFile, file.name);
          formData.append("token", token);
          formData.append("exifData", JSON.stringify(exifData || {}));

          const res = await fetch("/api/upload/public", {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            setPhotos((prev) => [
              ...prev,
              {
                id: data.photo.id,
                photoUrl: data.photo.photoUrl,
                exifData,
                isDuplicate: data.photo.isDuplicate || false,
                existingSessionDate: data.photo.existingSession?.date || undefined,
              },
            ]);
            continue;
          }
        } catch {
          // Fall through to local preview
        }
      }

      const localUrl = URL.createObjectURL(file);
      setPhotos((prev) => [
        ...prev,
        { id: `local-${Date.now()}-${Math.random()}`, photoUrl: localUrl, exifData },
      ]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleContinueToDetails = () => {
    if (photos.length === 0) {
      toast.error("Please upload at least one photo");
      return;
    }

    // Create a session draft per group, auto-filled from EXIF
    const drafts = photoGroups.map((group) =>
      deriveSessionDraft(group, spots, defaultSpotId)
    );
    // Expand the first one by default
    if (drafts.length > 0) drafts[0].expanded = true;
    setSessionDrafts(drafts);
    setStep("details");
  };

  const handleSkipPhoto = () => {
    setSessionDrafts([{
      spotId: defaultSpotId || "",
      date: new Date(),
      startTime: "09:00",
      endTime: "",
      rating: 3,
      notes: "",
      photoUrls: [],
      expanded: true,
      activePhotoIndex: 0,
      surfboardId: "",
      wetsuitId: "",
    }]);
    setStep("details");
  };

  const handleRemovePhoto = (photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const handleClearAllPhotos = () => {
    setPhotos([]);
    setPhotoGroups([]);
  };

  const handleRemoveDuplicates = () => {
    setPhotos((prev) => prev.filter((p) => !p.isDuplicate));
  };

  const hasDuplicates = photos.some((p) => p.isDuplicate);

  const updateDraft = (index: number, updates: Partial<SessionDraft>) => {
    setSessionDrafts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const toggleDraftExpanded = (index: number) => {
    setSessionDrafts((prev) =>
      prev.map((d, i) => ({ ...d, expanded: i === index ? !d.expanded : d.expanded }))
    );
  };

  const removeDraft = (index: number) => {
    setSessionDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Add new spot ---
  const openAddSpot = (draftIdx: number) => {
    setAddSpotDraftIdx(draftIdx);
    setNewSpotName("");
    setNewSpotDescription("");
    const group = photoGroups[draftIdx];
    if (group?.centroidLat && group?.centroidLng) {
      setNewSpotLocation({ lat: group.centroidLat, lng: group.centroidLng });
    } else {
      setNewSpotLocation(null);
    }
    setAddSpotOpen(true);
  };

  const handleSaveNewSpot = async () => {
    if (!newSpotName.trim() || !newSpotLocation) return;
    setIsSavingSpot(true);

    const lat = newSpotLocation.lat;
    const lng = newSpotLocation.lng;

    try {
      const res = await fetch("/api/spots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSpotName.trim(),
          latitude: lat,
          longitude: lng,
          description: newSpotDescription.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newSpot: SurfSpot = data.spot;
      setSpots((prev) => [...prev, newSpot]);
      updateDraft(addSpotDraftIdx, { spotId: newSpot.id });
      setAddSpotOpen(false);
      toast.success("Spot created!");
    } catch {
      toast.error("Failed to create spot");
    } finally {
      setIsSavingSpot(false);
    }
  };

  // --- Add new equipment ---
  const openAddEquipment = (type: "surfboard" | "wetsuit", draftIdx: number) => {
    setEquipDialogType(type);
    setEquipDraftIdx(draftIdx);
    setEquipDialogOpen(true);
  };

  const handleSubmit = async () => {
    const validDrafts = sessionDrafts.filter((d) => d.spotId);
    if (validDrafts.length === 0) {
      toast.error("Please select a spot for at least one session");
      return;
    }

    setIsSubmitting(true);
    let createdCount = 0;
    let lastSessionId = "";

    try {
      for (const draft of validDrafts) {
        const [startHours, startMinutes] = draft.startTime.split(":").map(Number);
        const sessionStartTime = new Date(draft.date);
        sessionStartTime.setHours(startHours, startMinutes, 0, 0);

        let sessionEndTime: Date | null = null;
        if (draft.endTime) {
          const [endHours, endMinutes] = draft.endTime.split(":").map(Number);
          sessionEndTime = new Date(draft.date);
          sessionEndTime.setHours(endHours, endMinutes, 0, 0);
        }

        const response = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spotId: draft.spotId,
            date: draft.date.toISOString(),
            startTime: sessionStartTime.toISOString(),
            endTime: sessionEndTime?.toISOString() || null,
            rating: draft.rating,
            notes: draft.notes.trim() || null,
            photoUrl: draft.photoUrls[0] || null,
            photoUrls: draft.photoUrls.length > 0 ? draft.photoUrls : null,
            surfboardId: draft.surfboardId && draft.surfboardId !== "none" ? draft.surfboardId : null,
            wetsuitId: draft.wetsuitId && draft.wetsuitId !== "none" ? draft.wetsuitId : null,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          lastSessionId = data.session.id;
          createdCount++;
        }
      }

      if (createdCount > 0) {
        toast.success(`${createdCount} session${createdCount !== 1 ? "s" : ""} logged!`);
        router.push("/dashboard");
      } else {
        toast.error("Failed to create sessions");
      }
    } catch (error) {
      console.error("Error creating sessions:", error);
      toast.error("Failed to create sessions");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Step indicator ----
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[
        { key: "photo", label: "Photos" },
        { key: "details", label: "Details" },
      ].map((s, idx) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              s.key === step
                ? "bg-primary text-primary-foreground"
                : s.key === "photo" && step === "details"
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {s.key === "photo" && step === "details" ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              idx + 1
            )}
          </div>
          {idx < 1 && (
            <div className={`w-16 h-0.5 ${step === "details" ? "bg-primary" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );

  // ---- STEP 1: Photo Upload ----
  if (step === "photo") {
    return (
      <div className="space-y-6">
        <StepIndicator />

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Add Photos</CardTitle>
            <CardDescription>
              Upload your session photos. Photos taken at a similar time and
              location will be automatically grouped into sessions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {photos.length > 0 ? (
              <div className="space-y-4">
                {/* Show groups with their photos */}
                {photoGroups.length > 1 ? (
                  <div className="space-y-3">
                    {photoGroups.map((group, idx) => (
                      <div key={idx} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">
                            Session {idx + 1}
                            {group.earliestTime && (
                              <span className="ml-2 text-muted-foreground font-normal">
                                {format(group.earliestTime, "MMM d, h:mma")}
                                {group.latestTime && group.latestTime.getTime() !== group.earliestTime.getTime() && (
                                  <span> - {format(group.latestTime, "h:mma")}</span>
                                )}
                              </span>
                            )}
                          </p>
                          <Badge variant="secondary" className="text-xs">
                            {group.photos.length} photo{group.photos.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                          {group.photos.map((photo) => {
                            const photoMeta = photos.find((p) => p.id === photo.id);
                            return (
                              <div key={photo.id} className="relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden group">
                                <img
                                  src={photo.photoUrl}
                                  alt="Session photo"
                                  className="w-full h-full object-cover"
                                />
                                {photoMeta?.isDuplicate && (
                                  <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-[9px] text-white text-center font-medium py-0.5">
                                    Duplicate
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhoto(photo.id)}
                                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Single group - show flat grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((photo) => (
                        <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden group">
                          <img
                            src={photo.photoUrl}
                            alt="Session photo"
                            className="w-full h-full object-cover"
                          />
                          {photo.isDuplicate && (
                            <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-[10px] text-white text-center font-medium py-0.5">
                              Duplicate{photo.existingSessionDate && (
                                <> &middot; {format(new Date(photo.existingSessionDate), "MMM d")}</>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(photo.id)}
                            className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                    {photos.length > 1 && photoGroups[0] && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-sm text-muted-foreground">
                          All {photos.length} photos grouped as one session
                          {photoGroups[0].earliestTime && (
                            <span> from {format(photoGroups[0].earliestTime, "h:mma")}</span>
                          )}
                          {photoGroups[0].latestTime && photoGroups[0].earliestTime &&
                            photoGroups[0].latestTime.getTime() !== photoGroups[0].earliestTime.getTime() && (
                            <span> to {format(photoGroups[0].latestTime, "h:mma")}</span>
                          )}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Add more + clear */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearAllPhotos}
                      className="text-destructive hover:text-destructive"
                    >
                      Clear all
                    </Button>
                    {hasDuplicates && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveDuplicates}
                        className="text-amber-600 hover:text-amber-700"
                      >
                        Remove duplicates
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {photos.length} photo{photos.length !== 1 ? "s" : ""}
                      {photoGroups.length > 1 && ` in ${photoGroups.length} sessions`}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Add more
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* QR Code */}
                {isCreatingSession ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-pulse text-muted-foreground">Setting up...</div>
                  </div>
                ) : token ? (
                  <div className="flex flex-col items-center space-y-3">
                    <div className="bg-white p-4 rounded-lg">
                      <QRCodeSVG
                        value={`${typeof window !== "undefined" ? window.location.origin : ""}/upload/${token}`}
                        size={200}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Scan with your phone to upload photos
                    </p>
                  </div>
                ) : null}

                {/* Direct upload */}
                <div className="border-t pt-4">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4 mr-2"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Upload from this device
                  </Button>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleDesktopUpload}
            />
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={handleSkipPhoto}>
            Skip photos
          </Button>
          <Button
            size="lg"
            disabled={photos.length === 0}
            onClick={handleContinueToDetails}
          >
            Continue
            {photoGroups.length > 1 && ` (${photoGroups.length} sessions)`}
          </Button>
        </div>
      </div>
    );
  }

  // ---- STEP 2: Session Details (one section per session) ----
  return (
    <div className="space-y-8">
      <StepIndicator />

      {sessionDrafts.map((draft, idx) => {
        const hasPhotos = draft.photoUrls.length > 0;
        const activePhoto = draft.photoUrls[draft.activePhotoIndex] || draft.photoUrls[0];

        return (
          <div key={idx} className="space-y-4">
            {/* Session label for multi-session */}
            {sessionDrafts.length > 1 && (
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Session {idx + 1}</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDraft(idx)}
                  className="text-destructive hover:text-destructive text-xs"
                >
                  Remove
                </Button>
              </div>
            )}

            {/* Hero photo with overlay info */}
            {hasPhotos && (
              <div className="space-y-2">
                <div className="relative rounded-2xl overflow-hidden">
                  <img
                    src={activePhoto}
                    alt="Session photo"
                    className="w-full h-[280px] sm:h-[360px] object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                  {/* Spot name + date overlay at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <p className="text-white/80 text-sm">
                      {format(draft.date, "MMMM d, yyyy")} at {draft.startTime}
                      {draft.endTime && ` - ${draft.endTime}`}
                    </p>
                    {draft.spotId && (
                      <p className="text-white text-xl font-bold mt-0.5">
                        {spots.find((s) => s.id === draft.spotId)?.name}
                      </p>
                    )}
                  </div>

                  {/* Navigation arrows for multi-photo */}
                  {draft.photoUrls.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft(idx, {
                            activePhotoIndex: (draft.activePhotoIndex - 1 + draft.photoUrls.length) % draft.photoUrls.length,
                          })
                        }
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 rounded-full flex items-center justify-center hover:bg-black/60 transition-colors"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft(idx, {
                            activePhotoIndex: (draft.activePhotoIndex + 1) % draft.photoUrls.length,
                          })
                        }
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 rounded-full flex items-center justify-center hover:bg-black/60 transition-colors"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <div className="absolute top-3 right-3 bg-black/50 rounded-full px-2 py-0.5 text-xs text-white">
                        {draft.activePhotoIndex + 1} / {draft.photoUrls.length}
                      </div>
                    </>
                  )}
                </div>

                {/* Thumbnail strip for multi-photo */}
                {draft.photoUrls.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto py-1">
                    {draft.photoUrls.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => updateDraft(idx, { activePhotoIndex: i })}
                        className={cn(
                          "flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden transition-all",
                          i === draft.activePhotoIndex
                            ? "ring-2 ring-primary opacity-100"
                            : "opacity-50 hover:opacity-80"
                        )}
                      >
                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Duplicate warning */}
            {hasPhotos && draft.photoUrls.length > 0 &&
              draft.photoUrls.every((url) =>
                photos.find((p) => p.photoUrl === url)?.isDuplicate
              ) && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  All photos in this session already exist in a previous session. You can still save it if intended.
                </p>
              </div>
            )}

            {/* Details form */}
            <Card>
              <CardHeader>
                <CardTitle>Session Details</CardTitle>
                <CardDescription>
                  {hasPhotos
                    ? "Auto-filled from photo metadata. Adjust as needed."
                    : "Log your surf session. Conditions will be automatically fetched."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Spot Selection */}
                <div className="space-y-2">
                  <Label>Surf Spot</Label>
                  <Select
                    value={draft.spotId}
                    onValueChange={(v) => {
                      if (v === "__add__") { openAddSpot(idx); return; }
                      updateDraft(idx, { spotId: v });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a spot" />
                    </SelectTrigger>
                    <SelectContent>
                      {spots.map((spot) => (
                        <SelectItem key={spot.id} value={spot.id}>
                          {spot.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="__add__" className="text-primary">
                        <span className="flex items-center gap-1.5">
                          <Plus className="size-3" />
                          Add new spot
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Equipment */}
                <EquipmentSelect
                  surfboards={surfboards}
                  wetsuits={wetsuits}
                  surfboardId={draft.surfboardId}
                  wetsuitId={draft.wetsuitId}
                  onSurfboardChange={(v) => updateDraft(idx, { surfboardId: v })}
                  onWetsuitChange={(v) => updateDraft(idx, { wetsuitId: v })}
                  onAddSurfboard={() => openAddEquipment("surfboard", idx)}
                  onAddWetsuit={() => openAddEquipment("wetsuit", idx)}
                />

                {/* Date */}
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal")}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {format(draft.date, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={draft.date}
                        onSelect={(d) => d && updateDraft(idx, { date: d })}
                        captionLayout="dropdown"
                        startMonth={new Date(2000, 0)}
                        endMonth={new Date(2030, 11)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={draft.startTime}
                      onChange={(e) => updateDraft(idx, { startTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time (optional)</Label>
                    <Input
                      type="time"
                      value={draft.endTime}
                      onChange={(e) => updateDraft(idx, { endTime: e.target.value })}
                    />
                  </div>
                </div>

                {/* Rating */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Rating</Label>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => updateDraft(idx, { rating: i + 1 })}
                          className="focus:outline-none"
                        >
                          <svg
                            className={`w-6 h-6 transition-colors ${
                              i < draft.rating ? "text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-200"
                            }`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>
                  <Slider
                    value={[draft.rating]}
                    onValueChange={([v]) => updateDraft(idx, { rating: v })}
                    min={1}
                    max={5}
                    step={1}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    placeholder="How was the session? Any memorable waves?"
                    value={draft.notes}
                    onChange={(e) => updateDraft(idx, { notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Divider between sessions */}
            {sessionDrafts.length > 1 && idx < sessionDrafts.length - 1 && (
              <div className="border-t" />
            )}
          </div>
        );
      })}

      {/* Submit */}
      <div className="flex gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep("photo")}
          disabled={isSubmitting}
        >
          Back
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || sessionDrafts.every((d) => !d.spotId)}
          className="flex-1"
        >
          {isSubmitting
            ? "Saving..."
            : sessionDrafts.length > 1
              ? `Log ${sessionDrafts.filter((d) => d.spotId).length} Sessions`
              : "Log Session"
          }
        </Button>
      </div>

      {/* Add New Spot Dialog */}
      <Dialog open={addSpotOpen} onOpenChange={setAddSpotOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Spot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                placeholder="e.g. Pipeline, Rincon…"
                value={newSpotName}
                onChange={(e) => setNewSpotName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional notes about this spot…"
                value={newSpotDescription}
                onChange={(e) => setNewSpotDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                Location *
              </Label>
              <p className="text-xs text-muted-foreground">
                {newSpotLocation
                  ? `Selected: ${newSpotLocation.lat.toFixed(5)}, ${newSpotLocation.lng.toFixed(5)} — tap the map to adjust`
                  : "Tap the map to set the spot location"}
              </p>
              <div className="h-[250px] rounded-lg overflow-hidden border">
                <SpotMap
                  spots={spots}
                  onMapClick={(lat, lng) => setNewSpotLocation({ lat, lng })}
                  newSpotMarker={newSpotLocation}
                  initialViewState={
                    newSpotLocation
                      ? { longitude: newSpotLocation.lng, latitude: newSpotLocation.lat, zoom: 13 }
                      : undefined
                  }
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAddSpotOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveNewSpot}
                disabled={!newSpotName.trim() || !newSpotLocation || isSavingSpot}
              >
                {isSavingSpot ? "Creating…" : "Create Spot"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add New Equipment Dialog */}
      <EquipmentFormDialog
        equipmentType={equipDialogType}
        open={equipDialogOpen}
        onOpenChange={setEquipDialogOpen}
        onSaved={() => {}}
        onSavedWithData={(item) => {
          if (equipDialogType === "surfboard") {
            setSurfboards((prev) => [...prev, item as Surfboard]);
            updateDraft(equipDraftIdx, { surfboardId: item.id });
          } else {
            setWetsuits((prev) => [...prev, item as Wetsuit]);
            updateDraft(equipDraftIdx, { wetsuitId: item.id });
          }
        }}
      />
    </div>
  );
}
