"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { SurfSpot } from "@/lib/db/schema";

interface SpotPaneEditSpotProps {
  spot: SurfSpot;
  onBack: () => void;
  onSave: (updatedSpot: SurfSpot) => void;
}

export function SpotPaneEditSpot({ spot, onBack, onSave }: SpotPaneEditSpotProps) {
  const [name, setName] = useState(spot.name);
  const [description, setDescription] = useState(spot.description || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(spot.name);
    setDescription(spot.description || "");
  }, [spot]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/spots?id=${spot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onSave(data.spot);
      onBack();
      toast.success("Spot updated!");
    } catch {
      toast.error("Failed to update spot");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <h2 className="text-sm font-semibold">Edit Spot</h2>
        <div className="w-12" /> {/* spacer for centering */}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-spot-name">Name</Label>
            <Input
              id="edit-spot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-spot-desc">Description</Label>
            <Textarea
              id="edit-spot-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this spot…"
              rows={2}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" className="flex-1" onClick={onBack}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
    </>
  );
}
