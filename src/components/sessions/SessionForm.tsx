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
import { SurfSpot } from "@/lib/db/schema";
import { findNearestSpot } from "@/lib/utils/geo";

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
}

interface UploadedPhoto {
  id: string;
  photoUrl: string;
  exifData: { dateTime?: string; latitude?: number; longitude?: number } | null;
}

export function SessionForm({ spots, defaultSpotId }: SessionFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<"photo" | "details">("photo");

  // Photo upload state
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [photo, setPhoto] = useState<UploadedPhoto | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [localPhotoFile, setLocalPhotoFile] = useState<File | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Session details state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [spotId, setSpotId] = useState(defaultSpotId || "");
  const [date, setDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [rating, setRating] = useState(3);
  const [notes, setNotes] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Create upload session on mount (for QR code)
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

  // Poll for photos uploaded via QR code
  useEffect(() => {
    if (!uploadSessionId || step !== "photo" || photo) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/upload-sessions?id=${uploadSessionId}`);
        if (res.ok) {
          const data = await res.json();
          const photos = data.uploadSession?.photos || data.photos;
          if (photos && photos.length > 0) {
            const uploaded = photos[photos.length - 1];
            setPhoto(uploaded);
            setPhotoPreview(uploaded.photoUrl);
            applyExifData(uploaded.exifData);
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
  }, [uploadSessionId, step, photo]);

  const applyExifData = useCallback((exifData: UploadedPhoto["exifData"]) => {
    if (!exifData) return;

    if (exifData.dateTime) {
      const dt = new Date(exifData.dateTime);
      setDate(dt);
      const hours = dt.getHours().toString().padStart(2, "0");
      const minutes = dt.getMinutes().toString().padStart(2, "0");
      setStartTime(`${hours}:${minutes}`);
      toast.success("Date and time extracted from photo");
    }

    if (exifData.latitude && exifData.longitude && spots.length > 0) {
      const nearest = findNearestSpot(exifData.latitude, exifData.longitude, spots);
      if (nearest && nearest.distance < 10) {
        setSpotId(nearest.spot.id);
        toast.success(`Location matched to ${nearest.spot.name}`);
      }
    }
  }, [spots]);

  // Handle direct file upload from this device
  const handleDesktopUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoPreview(URL.createObjectURL(file));
    setLocalPhotoFile(file);

    // Extract EXIF data locally
    if (isExifSupported(file)) {
      try {
        const exifData = await extractExifData(file);
        applyExifData(exifData as UploadedPhoto["exifData"]);
      } catch (error) {
        console.error("Error extracting EXIF:", error);
      }
    }

    // If we have an upload session, also upload via the public route so it's stored
    if (token) {
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
        if (res.ok) {
          const data = await res.json();
          setPhoto({
            id: data.photo.id,
            photoUrl: data.photo.photoUrl,
            exifData: null,
          });
          setPhotoPreview(data.photo.photoUrl);
          setLocalPhotoFile(null); // No need to re-upload on submit
        }
      } catch {
        // Keep the local file as fallback
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleContinueToDetails = () => {
    if (!photoPreview) {
      toast.error("Please upload a photo first");
      return;
    }
    setStep("details");
  };

  const handleSkipPhoto = () => {
    setStep("details");
  };

  const handleRemovePhoto = () => {
    setPhoto(null);
    setPhotoPreview(null);
    setLocalPhotoFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!spotId) {
      toast.error("Please select a spot");
      return;
    }

    setIsSubmitting(true);

    try {
      // Determine photo URL
      let photoUrl: string | null = photo?.photoUrl || null;

      // If we have a local file that wasn't uploaded via the session, upload it now
      if (localPhotoFile && !photoUrl) {
        setUploadingPhoto(true);
        const formData = new FormData();
        formData.append("file", localPhotoFile);

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          photoUrl = uploadData.url;
        } else {
          toast.error("Failed to upload photo");
        }
        setUploadingPhoto(false);
      }

      // Create session
      const [startHours, startMinutes] = startTime.split(":").map(Number);
      const sessionStartTime = new Date(date);
      sessionStartTime.setHours(startHours, startMinutes, 0, 0);

      let sessionEndTime: Date | null = null;
      if (endTime) {
        const [endHours, endMinutes] = endTime.split(":").map(Number);
        sessionEndTime = new Date(date);
        sessionEndTime.setHours(endHours, endMinutes, 0, 0);
      }

      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotId,
          date: date.toISOString(),
          startTime: sessionStartTime.toISOString(),
          endTime: sessionEndTime?.toISOString() || null,
          rating,
          notes: notes.trim() || null,
          photoUrl,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success("Session logged successfully!");
        router.push(`/sessions/${data.session.id}`);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to log session");
      }
    } catch (error) {
      console.error("Error creating session:", error);
      toast.error("Failed to log session");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Step indicator ----
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[
        { key: "photo", label: "Photo" },
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
              idx + 1
            )}
          </div>
          {idx < 1 && (
            <div
              className={`w-16 h-0.5 ${
                step === "details" ? "bg-primary" : "bg-muted"
              }`}
            />
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
            <CardTitle>Add a Photo</CardTitle>
            <CardDescription>
              Scan the QR code with your phone to upload a photo, or upload
              directly from this device. Date, time, and location will be
              extracted automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {photoPreview ? (
              <div className="space-y-4">
                <div className="relative flex justify-center">
                  <img
                    src={photoPreview}
                    alt="Session photo"
                    className="max-h-72 rounded-lg object-contain"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={handleRemovePhoto}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* QR Code */}
                {isCreatingSession ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-pulse text-muted-foreground">
                      Setting up...
                    </div>
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
                      Scan with your phone to upload a photo
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
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleDesktopUpload}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={handleSkipPhoto}>
            Skip photo
          </Button>
          <Button
            size="lg"
            disabled={!photoPreview}
            onClick={handleContinueToDetails}
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  // ---- STEP 2: Session Details ----
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StepIndicator />

      {/* Photo preview thumbnail */}
      {photoPreview && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-lg overflow-hidden border flex-shrink-0">
                <img
                  src={photoPreview}
                  alt="Session photo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Photo attached</p>
                <p className="text-xs text-muted-foreground">
                  Date and location auto-filled from photo metadata
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("photo");
                }}
              >
                Change
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Session Details</CardTitle>
          <CardDescription>
            Log your surf session. Conditions will be automatically fetched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Spot Selection */}
          <div className="space-y-2">
            <Label htmlFor="spot">Surf Spot</Label>
            <Select value={spotId} onValueChange={setSpotId}>
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
            {spots.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No spots yet.{" "}
                <a href="/sessions/new" className="text-primary hover:underline">
                  Add a spot first
                </a>
              </p>
            )}
          </div>

          {/* Date Selection */}
          <div className="space-y-2">
            <Label>Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-2 h-4 w-4"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {date ? format(date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time (optional)</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
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
                    onClick={() => setRating(i + 1)}
                    className="focus:outline-none"
                  >
                    <svg
                      className={`w-6 h-6 transition-colors ${
                        i < rating ? "text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-200"
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
              value={[rating]}
              onValueChange={([v]) => setRating(v)}
              min={1}
              max={5}
              step={1}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="How was the session? Any memorable waves?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !spotId}>
          {isSubmitting
            ? uploadingPhoto
              ? "Uploading photo..."
              : "Saving..."
            : "Log Session"}
        </Button>
      </div>
    </form>
  );
}
