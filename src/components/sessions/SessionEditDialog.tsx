"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { SurfSessionWithConditions } from "@/types";
import { format } from "date-fns";

interface SessionEditDialogProps {
  session: SurfSessionWithConditions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (session: SurfSessionWithConditions) => void;
}

export function SessionEditDialog({
  session,
  open,
  onOpenChange,
  onSaved,
}: SessionEditDialogProps) {
  const [rating, setRating] = useState(session.rating);
  const [hoverRating, setHoverRating] = useState(0);
  const [notes, setNotes] = useState(session.notes || "");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRating(session.rating);
      setNotes(session.notes || "");
      const d = new Date(session.date);
      setDate(format(d, "yyyy-MM-dd"));
      const st = new Date(session.startTime);
      setStartTime(format(st, "HH:mm"));
      if (session.endTime) {
        const et = new Date(session.endTime);
        setEndTime(format(et, "HH:mm"));
      } else {
        setEndTime("");
      }
    }
  }, [open, session]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const dateObj = new Date(date + "T00:00:00");
      const startDateTime = new Date(date + "T" + startTime + ":00");
      const endDateTime = endTime
        ? new Date(date + "T" + endTime + ":00")
        : null;

      const body: Record<string, unknown> = {
        rating,
        notes: notes || null,
        date: dateObj.toISOString(),
        startTime: startDateTime.toISOString(),
      };

      if (endDateTime) {
        body.endTime = endDateTime.toISOString();
      } else {
        body.endTime = null;
      }

      const response = await fetch(`/api/sessions?id=${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success("Session updated");
        onSaved(data.session);
        onOpenChange(false);
      } else {
        toast.error("Failed to update session");
      }
    } catch (error) {
      console.error("Error updating session:", error);
      toast.error("Failed to update session");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit session</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rating */}
          <div className="space-y-2">
            <Label>Rating</Label>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className="p-0.5"
                  onMouseEnter={() => setHoverRating(i + 1)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(i + 1)}
                >
                  <svg
                    className={`w-7 h-7 transition-colors ${
                      i < (hoverRating || rating)
                        ? "text-yellow-400"
                        : "text-muted-foreground/30"
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

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="edit-date">Date</Label>
            <Input
              id="edit-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-start">Start time</Label>
              <Input
                id="edit-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-end">End time</Label>
              <Input
                id="edit-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How was the session?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
