"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/date";
import { findNearbySpots } from "@/lib/utils/geo";
import { SurfSpot } from "@/lib/db/schema";
import { extractExifData, isExifSupported } from "@/lib/utils/exif";
import { ExifData } from "@/types";
import dynamic from "next/dynamic";

const SpotMap = dynamic(() => import("@/components/map/SpotMap"), {
  ssr: false,
  loading: () => (
    <div className="h-48 rounded-lg bg-muted animate-pulse" />
  ),
});

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB (Vercel limit)
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

// ---- Types ----

interface UploadedPhoto {
  id: string;
  photoUrl: string;
  exifData: ExifData | null;
  createdAt: string;
}

interface PhotoReview {
  photoId: string;
  photoUrl: string;
  exifData: ExifData | null;
  spotId: string;
  spotName: string;
  rating: number;
  notes: string;
  newSpotName: string;
  newSpotLat: number | null;
  newSpotLng: number | null;
  creatingNewSpot: boolean;
}

// ---- Component ----

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1 state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [spots, setSpots] = useState<SurfSpot[]>([]);
  const [reviews, setReviews] = useState<PhotoReview[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  // Step 3 state
  const [isCreating, setIsCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [createdSpotCount, setCreatedSpotCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  // ---- Step 1: QR Code Upload ----

  // Create upload session on mount
  useEffect(() => {
    async function createUploadSession() {
      setIsCreatingSession(true);
      try {
        const res = await fetch("/api/upload-sessions", { method: "POST" });
        if (!res.ok) throw new Error("Failed to create upload session");
        const data = await res.json();
        setSessionId(data.id);
        setToken(data.token);
      } catch (err) {
        console.error("Error creating upload session:", err);
        toast.error("Failed to initialize upload session");
      } finally {
        setIsCreatingSession(false);
      }
    }
    createUploadSession();
  }, []);

  // Poll for new photos
  useEffect(() => {
    if (!sessionId || step !== 1) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/upload-sessions?id=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          const sessionPhotos = data.uploadSession?.photos || data.photos;
          if (sessionPhotos && sessionPhotos.length > photos.length) {
            setPhotos(sessionPhotos);
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
  }, [sessionId, step, photos.length]);

  const handleDesktopUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || !token) return;

    for (const file of Array.from(files)) {
      try {
        let exifData = {};
        if (isExifSupported(file)) {
          exifData = await extractExifData(file);
        }
        const processedFile = await resizeImage(file);

        const formData = new FormData();
        formData.append("file", processedFile, file.name);
        formData.append("token", token);
        formData.append("exifData", JSON.stringify(exifData));

        const res = await fetch("/api/upload/public", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          toast.error(`Failed to upload ${file.name}`);
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    // Refresh photos after upload
    try {
      const res = await fetch(`/api/upload-sessions?id=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setPhotos(data.uploadSession?.photos || data.photos || []);
      }
    } catch {
      // ignore
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const advanceToStep2 = async () => {
    // Fetch spots
    try {
      const res = await fetch("/api/spots");
      if (res.ok) {
        const data = await res.json();
        setSpots(data.spots || []);
      }
    } catch {
      toast.error("Failed to load spots");
    }

    // Initialize reviews for each photo
    const initialReviews: PhotoReview[] = photos.map((photo) => ({
      photoId: photo.id,
      photoUrl: photo.photoUrl,
      exifData: photo.exifData,
      spotId: "",
      spotName: "",
      rating: 3,
      notes: "",
      newSpotName: "",
      newSpotLat: photo.exifData?.latitude ?? null,
      newSpotLng: photo.exifData?.longitude ?? null,
      creatingNewSpot: false,
    }));

    setReviews(initialReviews);
    setCurrentPhotoIndex(0);
    setStep(2);
  };

  // ---- Step 2: Photo Review ----

  const currentReview = reviews[currentPhotoIndex];

  const updateCurrentReview = useCallback(
    (updates: Partial<PhotoReview>) => {
      setReviews((prev) => {
        const next = [...prev];
        next[currentPhotoIndex] = { ...next[currentPhotoIndex], ...updates };
        return next;
      });
    },
    [currentPhotoIndex]
  );

  const getNearbySpots = useCallback(
    (exif: ExifData | null) => {
      if (!exif?.latitude || !exif?.longitude || spots.length === 0) return [];
      return findNearbySpots(exif.latitude, exif.longitude, spots);
    },
    [spots]
  );

  const allReviewsComplete = reviews.every(
    (r) => (r.spotId || (r.creatingNewSpot && r.newSpotName)) && r.rating >= 1
  );

  const advanceToStep3 = () => {
    setStep(3);
  };

  // ---- Step 3: Summary & Create ----

  const getSpotNameForReview = (review: PhotoReview): string => {
    if (review.creatingNewSpot) return review.newSpotName;
    const spot = spots.find((s) => s.id === review.spotId);
    return spot?.name || "Unknown spot";
  };

  const handleCreateSessions = async () => {
    setIsCreating(true);
    try {
      const payload = reviews.map((r) => ({
        photoId: r.photoId,
        photoUrl: r.photoUrl,
        spotId: r.creatingNewSpot ? null : r.spotId,
        newSpot: r.creatingNewSpot
          ? {
              name: r.newSpotName,
              latitude: r.newSpotLat,
              longitude: r.newSpotLng,
            }
          : null,
        rating: r.rating,
        notes: r.notes || null,
        exifData: r.exifData,
      }));

      const res = await fetch("/api/upload-sessions/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadSessionId: sessionId, sessions: payload }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create sessions");
      }

      const data = await res.json();
      setCreatedCount(data.sessionsCreated || reviews.length);
      setCreatedSpotCount(data.spotsCreated || 0);
      setIsComplete(true);
      toast.success("Sessions created successfully!");
    } catch (err) {
      console.error("Error creating sessions:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to create sessions"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // ---- Step indicator ----

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              s === step
                ? "bg-primary text-primary-foreground"
                : s < step
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {s < step ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              s
            )}
          </div>
          {s < 3 && (
            <div
              className={`w-16 h-0.5 ${
                s < step ? "bg-primary" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  // ---- Star Rating ----

  const StarRating = ({
    value,
    onChange,
  }: {
    value: number;
    onChange: (v: number) => void;
  }) => (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i + 1)}
          className="focus:outline-none"
        >
          <svg
            className={`w-6 h-6 transition-colors ${
              i < value
                ? "text-yellow-400"
                : "text-gray-300 hover:text-yellow-200"
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );

  // ---- Render ----

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold">Welcome to SurfSync</h1>
        <p className="text-muted-foreground mt-2">
          Import your surf photos to create your session history
        </p>
      </div>

      <StepIndicator />

      {/* ==================== STEP 1: QR CODE UPLOAD ==================== */}
      {step === 1 && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Upload Your Surf Photos</CardTitle>
              <CardDescription>
                Scan the QR code with your phone to upload photos from your
                camera roll, or upload directly from this device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isCreatingSession ? (
                <div className="flex justify-center py-12">
                  <div className="animate-pulse text-muted-foreground">
                    Setting up upload session...
                  </div>
                </div>
              ) : token ? (
                <div className="flex flex-col items-center space-y-4">
                  <QRCodeSVG
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/upload/${token}`}
                    size={256}
                  />
                  <p className="text-sm text-muted-foreground text-center max-w-md break-all">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/upload/${token}`
                      : ""}
                  </p>
                </div>
              ) : (
                <div className="flex justify-center py-12 text-destructive">
                  Failed to create upload session. Please refresh the page.
                </div>
              )}

              <div className="border-t pt-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Also upload from this device
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleDesktopUpload}
                />
              </div>
            </CardContent>
          </Card>

          {/* Photo thumbnails grid */}
          {photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Uploaded Photos
                  <Badge variant="secondary">{photos.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-3">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="aspect-square rounded-lg overflow-hidden border"
                    >
                      <img
                        src={photo.photoUrl}
                        alt="Surf photo"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              size="lg"
              disabled={photos.length === 0}
              onClick={advanceToStep2}
            >
              Done uploading ({photos.length} photo
              {photos.length !== 1 ? "s" : ""})
            </Button>
          </div>
        </div>
      )}

      {/* ==================== STEP 2: PHOTO REVIEW ==================== */}
      {step === 2 && currentReview && (
        <div className="space-y-6">
          {/* Navigation header */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPhotoIndex === 0}
              onClick={() =>
                setCurrentPhotoIndex((prev) => Math.max(0, prev - 1))
              }
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground font-medium">
              Photo {currentPhotoIndex + 1} of {reviews.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPhotoIndex === reviews.length - 1}
              onClick={() =>
                setCurrentPhotoIndex((prev) =>
                  Math.min(reviews.length - 1, prev + 1)
                )
              }
            >
              Next
            </Button>
          </div>

          {/* Photo display */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-center mb-4">
                <img
                  src={currentReview.photoUrl}
                  alt={`Photo ${currentPhotoIndex + 1}`}
                  className="max-h-96 rounded-lg object-contain"
                />
              </div>

              {/* EXIF info */}
              {currentReview.exifData && (
                <div className="flex flex-wrap gap-2 justify-center mb-4">
                  {currentReview.exifData.dateTime && (
                    <Badge variant="outline">
                      {formatDate(
                        new Date(currentReview.exifData.dateTime)
                      )}
                    </Badge>
                  )}
                  {currentReview.exifData.latitude &&
                    currentReview.exifData.longitude && (
                      <Badge variant="outline">
                        GPS: {currentReview.exifData.latitude.toFixed(4)},{" "}
                        {currentReview.exifData.longitude.toFixed(4)}
                      </Badge>
                    )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Spot selection */}
          <Card>
            <CardHeader>
              <CardTitle>Where was this?</CardTitle>
              <CardDescription>
                Select the surf spot for this photo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Nearby spots from GPS */}
              {(() => {
                const nearby = getNearbySpots(currentReview.exifData);
                if (nearby.length > 0) {
                  return (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Nearby spots
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        {nearby.map(({ spot, distance }) => (
                          <button
                            key={spot.id}
                            type="button"
                            onClick={() =>
                              updateCurrentReview({
                                spotId: spot.id,
                                spotName: spot.name,
                                creatingNewSpot: false,
                              })
                            }
                            className={`p-3 rounded-lg border text-left transition-colors ${
                              currentReview.spotId === spot.id
                                ? "border-primary bg-primary/5"
                                : "hover:border-primary/50"
                            }`}
                          >
                            <div className="font-medium text-sm">
                              {spot.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {distance.toFixed(1)} km away
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* All spots dropdown */}
              <div className="space-y-2">
                <Label>All spots</Label>
                <Select
                  value={
                    currentReview.creatingNewSpot ? "" : currentReview.spotId
                  }
                  onValueChange={(value) =>
                    updateCurrentReview({
                      spotId: value,
                      spotName:
                        spots.find((s) => s.id === value)?.name || "",
                      creatingNewSpot: false,
                    })
                  }
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
                  </SelectContent>
                </Select>
              </div>

              {/* Create new spot */}
              {!currentReview.creatingNewSpot ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    updateCurrentReview({
                      creatingNewSpot: true,
                      spotId: "",
                    })
                  }
                >
                  + Create New Spot
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border p-4">
                  <Label className="text-sm font-medium">New Spot</Label>
                  <Input
                    placeholder="Spot name"
                    value={currentReview.newSpotName}
                    onChange={(e) =>
                      updateCurrentReview({ newSpotName: e.target.value })
                    }
                  />
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Click the map to adjust the location
                    </Label>
                    <div className="h-56 rounded-lg overflow-hidden border">
                      <SpotMap
                        spots={spots}
                        interactive
                        onMapClick={(lat, lng) =>
                          updateCurrentReview({
                            newSpotLat: lat,
                            newSpotLng: lng,
                          })
                        }
                        newSpotMarker={
                          currentReview.newSpotLat !== null &&
                          currentReview.newSpotLng !== null
                            ? {
                                lat: currentReview.newSpotLat,
                                lng: currentReview.newSpotLng,
                              }
                            : null
                        }
                        initialViewState={{
                          latitude: currentReview.newSpotLat ?? 37.8,
                          longitude: currentReview.newSpotLng ?? -122.4,
                          zoom: currentReview.newSpotLat ? 14 : 9,
                        }}
                      />
                    </div>
                    {currentReview.newSpotLat !== null &&
                      currentReview.newSpotLng !== null && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {currentReview.newSpotLat.toFixed(5)},{" "}
                          {currentReview.newSpotLng.toFixed(5)}
                        </p>
                      )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={
                        !currentReview.newSpotName ||
                        currentReview.newSpotLat === null ||
                        currentReview.newSpotLng === null
                      }
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/spots", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              name: currentReview.newSpotName,
                              latitude: currentReview.newSpotLat,
                              longitude: currentReview.newSpotLng,
                            }),
                          });
                          if (!res.ok) throw new Error("Failed to create spot");
                          const data = await res.json();
                          const newSpot = data.spot;
                          setSpots((prev) => [...prev, newSpot]);
                          updateCurrentReview({
                            spotId: newSpot.id,
                            spotName: newSpot.name,
                            creatingNewSpot: false,
                            newSpotName: "",
                          });
                          toast.success(`Created spot "${newSpot.name}"`);
                        } catch {
                          toast.error("Failed to create spot");
                        }
                      }}
                    >
                      Save Spot
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateCurrentReview({
                          creatingNewSpot: false,
                          newSpotName: "",
                        })
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rating & Notes */}
          <Card>
            <CardHeader>
              <CardTitle>How was it?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Rating</Label>
                <StarRating
                  value={currentReview.rating}
                  onChange={(v) => updateCurrentReview({ rating: v })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="How was the session? Any memorable waves?"
                  value={currentReview.notes}
                  onChange={(e) =>
                    updateCurrentReview({ notes: e.target.value })
                  }
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Review completion status */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {reviews.filter(
                (r) =>
                  (r.spotId || (r.creatingNewSpot && r.newSpotName)) &&
                  r.rating >= 1
              ).length}{" "}
              of {reviews.length} photos reviewed
            </div>
            <Button
              size="lg"
              disabled={!allReviewsComplete}
              onClick={advanceToStep3}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* ==================== STEP 3: SUMMARY & CREATE ==================== */}
      {step === 3 && !isComplete && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Review & Create Sessions</CardTitle>
              <CardDescription>
                Confirm the details below, then create your sessions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {reviews.map((review, idx) => (
                  <div key={review.photoId} className="flex items-center gap-4 py-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden border flex-shrink-0">
                      <img
                        src={review.photoUrl}
                        alt={`Photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {getSpotNameForReview(review)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {review.exifData?.dateTime
                          ? formatDate(new Date(review.exifData.dateTime))
                          : "No date"}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <svg
                          key={i}
                          className={`w-4 h-4 ${
                            i < review.rating
                              ? "text-yellow-400"
                              : "text-gray-200"
                          }`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleCreateSessions}
              disabled={isCreating}
            >
              {isCreating
                ? "Creating sessions..."
                : `Create ${reviews.length} Session${reviews.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}

      {/* ==================== STEP 3: SUCCESS ==================== */}
      {step === 3 && isComplete && (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-8 pb-8">
              <div className="text-center space-y-4">
                <div className="text-6xl">*</div>
                <h2 className="text-2xl font-bold">You&apos;re all set!</h2>
                <p className="text-lg text-muted-foreground">
                  You&apos;ve added {createdCount} session
                  {createdCount !== 1 ? "s" : ""}
                  {createdSpotCount > 0
                    ? ` at ${createdSpotCount} new spot${createdSpotCount !== 1 ? "s" : ""}`
                    : ""}
                  !
                </p>
                <p className="text-sm text-muted-foreground">
                  SurfSync will now analyze your sessions against ocean
                  conditions to predict when the surf will be great for you.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button size="lg" onClick={() => router.push("/spots")}>
              Go to Dashboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
