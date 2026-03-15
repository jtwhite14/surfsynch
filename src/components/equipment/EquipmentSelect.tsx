"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Shirt } from "lucide-react";
import { Surfboard, Wetsuit } from "@/lib/db/schema";

interface EquipmentSelectProps {
  surfboards: Surfboard[];
  wetsuits: Wetsuit[];
  surfboardId: string;
  wetsuitId: string;
  onSurfboardChange: (id: string) => void;
  onWetsuitChange: (id: string) => void;
}

export function EquipmentSelect({
  surfboards,
  wetsuits,
  surfboardId,
  wetsuitId,
  onSurfboardChange,
  onWetsuitChange,
}: EquipmentSelectProps) {
  const [expanded, setExpanded] = useState(false);

  const activeSurfboards = surfboards.filter((b) => !b.retired);
  const activeWetsuits = wetsuits.filter((w) => !w.retired);

  if (activeSurfboards.length === 0 && activeWetsuits.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shirt className="size-4" />
          <span>Equipment (optional)</span>
        </div>
        <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {activeSurfboards.length > 0 && (
            <div className="space-y-2">
              <Label>Surfboard</Label>
              <Select value={surfboardId} onValueChange={onSurfboardChange}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {activeSurfboards.map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      {board.name}
                      {board.brand && ` (${board.brand})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {activeWetsuits.length > 0 && (
            <div className="space-y-2">
              <Label>Wetsuit</Label>
              <Select value={wetsuitId} onValueChange={onWetsuitChange}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {activeWetsuits.map((suit) => (
                    <SelectItem key={suit.id} value={suit.id}>
                      {suit.name}
                      {suit.thickness && ` (${suit.thickness})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
