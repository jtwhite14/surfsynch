"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AlertTuningSection } from "@/components/alerts/AlertTuning";
import type { SurfSpot } from "@/lib/db/schema";
import type { ConditionWeights } from "@/types";

interface EditSpotDialogProps {
  spot: SurfSpot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updatedSpot: SurfSpot) => void;
}

export function EditSpotDialog({ spot, open, onOpenChange, onSave }: EditSpotDialogProps) {
  const [name, setName] = useState(spot.name);
  const [description, setDescription] = useState(spot.description || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(spot.name);
      setDescription(spot.description || "");
    }
  }, [open, spot]);

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
      onOpenChange(false);
      toast.success("Spot updated!");
    } catch {
      toast.error("Failed to update spot");
    } finally {
      setSaving(false);
    }
  }

  function handleWeightsSave(weights: ConditionWeights) {
    onSave({ ...spot, conditionWeights: weights });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Spot</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">Alert Tuning</h3>
            <AlertTuningSection spotId={spot.id} onSave={handleWeightsSave} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
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
      </DialogContent>
    </Dialog>
  );
}
