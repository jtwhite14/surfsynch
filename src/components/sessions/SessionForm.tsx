"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { extractExifData, isExifSupported } from "@/lib/utils/exif";
import { SurfSpot } from "@/lib/db/schema";
import { findNearestSpot } from "@/lib/utils/geo";

interface SessionFormProps {
  spots: SurfSpot[];
  defaultSpotId?: string;
}

export function SessionForm({ spots, defaultSpotId }: SessionFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [spotId, setSpotId] = useState(defaultSpotId || "");
  const [date, setDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [rating, setRating] = useState(3);
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));

    // Try to extract EXIF data
    if (isExifSupported(file)) {
      try {
        const exifData = await extractExifData(file);

        if (exifData.dateTime) {
          setDate(exifData.dateTime);
          const hours = exifData.dateTime.getHours().toString().padStart(2, "0");
          const minutes = exifData.dateTime.getMinutes().toString().padStart(2, "0");
          setStartTime(`${hours}:${minutes}`);
          toast.success("Date and time extracted from photo");
        }

        if (exifData.latitude && exifData.longitude && spots.length > 0) {
          // Find nearest spot
          const nearest = findNearestSpot(exifData.latitude, exifData.longitude, spots);
          if (nearest && nearest.distance < 10) {
            // Within 10km
            setSpotId(nearest.spot.id);
            toast.success(`Location matched to ${nearest.spot.name}`);
          }
        }
      } catch (error) {
        console.error("Error extracting EXIF:", error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!spotId) {
      toast.error("Please select a spot");
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload photo first if present
      let photoUrl: string | null = null;
      if (photoFile) {
        setUploadingPhoto(true);
        const formData = new FormData();
        formData.append("file", photoFile);

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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
                <a href="/spots" className="text-primary hover:underline">
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
                        i < rating ? "text-yellow-400" : "text-gray-300 hover:text-yellow-200"
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

      {/* Photo Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Photo (optional)</CardTitle>
          <CardDescription>
            Upload a photo from your session. Date/time and location may be extracted automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Input
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              className="cursor-pointer"
            />
            {photoPreview && (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="max-h-64 rounded-lg object-contain"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    setPhotoFile(null);
                    setPhotoPreview(null);
                  }}
                >
                  Remove
                </Button>
              </div>
            )}
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

