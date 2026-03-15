"use client";

import { useState, useEffect, useRef } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { Surfboard, Wetsuit } from "@/lib/db/schema";

interface EquipmentFormDialogProps {
  equipmentType: "surfboard" | "wetsuit";
  existing?: Surfboard | Wetsuit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onSavedWithData?: (item: Surfboard | Wetsuit) => void;
}

const BOARD_TYPES = ["shortboard", "longboard", "fish", "funboard", "midlength", "gun", "foamie", "SUP"] as const;
const FIN_SETUPS = ["thruster", "quad", "twin", "single", "2+1", "five", "none"] as const;
const TAIL_SHAPES = ["squash", "round", "pin", "swallow", "fish", "diamond"] as const;
const WETSUIT_STYLES = ["fullsuit", "springsuit", "shorty", "top", "shorts"] as const;
const WETSUIT_ENTRIES = ["chest_zip", "back_zip", "zipperless"] as const;
const WETSUIT_SIZES = ["XS", "S", "MS", "M", "MT", "L", "LS", "LT", "XL", "XXL"] as const;

const STYLE_LABELS: Record<string, string> = {
  fullsuit: "Full Suit", springsuit: "Spring Suit", shorty: "Shorty", top: "Top", shorts: "Shorts",
};
const ENTRY_LABELS: Record<string, string> = {
  chest_zip: "Chest Zip", back_zip: "Back Zip", zipperless: "Zipperless",
};

export function EquipmentFormDialog({
  equipmentType,
  existing,
  open,
  onOpenChange,
  onSaved,
  onSavedWithData,
}: EquipmentFormDialogProps) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [saving, setSaving] = useState(false);

  // Surfboard fields
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState("");
  const [boardType, setBoardType] = useState("");
  const [lengthFeet, setLengthFeet] = useState("");
  const [lengthInches, setLengthInches] = useState("");
  const [width, setWidth] = useState("");
  const [thickness, setThickness] = useState("");
  const [volume, setVolume] = useState("");
  const [finSetup, setFinSetup] = useState("");
  const [tailShape, setTailShape] = useState("");

  // Wetsuit fields
  const [wetsuitThickness, setWetsuitThickness] = useState("");
  const [style, setStyle] = useState("");
  const [entry, setEntry] = useState("");
  const [size, setSize] = useState("");

  // Shared
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setBrand(existing.brand || "");
      setNotes(existing.notes || "");

      if (equipmentType === "surfboard") {
        const board = existing as Surfboard;
        setModel(board.model || "");
        setBoardType(board.boardType || "");
        if (board.lengthInches) {
          const total = parseFloat(board.lengthInches);
          setLengthFeet(Math.floor(total / 12).toString());
          setLengthInches(Math.round(total % 12).toString());
        } else {
          setLengthFeet("");
          setLengthInches("");
        }
        setWidth(board.width || "");
        setThickness(board.thickness || "");
        setVolume(board.volume || "");
        setFinSetup(board.finSetup || "");
        setTailShape(board.tailShape || "");
        setPhotoUrl(board.photoUrl || null);
      } else {
        const suit = existing as Wetsuit;
        setWetsuitThickness(suit.thickness || "");
        setStyle(suit.style || "");
        setEntry(suit.entry || "");
        setSize(suit.size || "");
      }
    } else {
      setName("");
      setBrand("");
      setModel("");
      setBoardType("");
      setLengthFeet("");
      setLengthInches("");
      setWidth("");
      setThickness("");
      setVolume("");
      setFinSetup("");
      setTailShape("");
      setWetsuitThickness("");
      setStyle("");
      setEntry("");
      setSize("");
      setPhotoUrl(null);
      setNotes("");
    }
  }, [open, existing, equipmentType]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || "Failed to upload photo");
        return;
      }

      const data = await response.json();
      setPhotoUrl(data.url);
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      const endpoint = equipmentType === "surfboard" ? "/api/surfboards" : "/api/wetsuits";
      const url = existing ? `${endpoint}?id=${existing.id}` : endpoint;
      const method = existing ? "PUT" : "POST";

      let body: Record<string, unknown>;
      if (equipmentType === "surfboard") {
        const totalInches = lengthFeet || lengthInches
          ? (parseFloat(lengthFeet || "0") * 12) + parseFloat(lengthInches || "0")
          : null;
        body = {
          name: name.trim(),
          brand: brand.trim() || null,
          model: model.trim() || null,
          boardType: boardType || null,
          lengthInches: totalInches,
          width: width ? parseFloat(width) : null,
          thickness: thickness ? parseFloat(thickness) : null,
          volume: volume ? parseFloat(volume) : null,
          finSetup: finSetup || null,
          tailShape: tailShape || null,
          photoUrl: photoUrl || null,
          notes: notes.trim() || null,
        };
      } else {
        body = {
          name: name.trim(),
          brand: brand.trim() || null,
          thickness: wetsuitThickness.trim() || null,
          style: style || null,
          entry: entry || null,
          size: size || null,
          notes: notes.trim() || null,
        };
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(existing ? `${equipmentType === "surfboard" ? "Surfboard" : "Wetsuit"} updated` : `${equipmentType === "surfboard" ? "Surfboard" : "Wetsuit"} added`);
        const item = data.surfboard || data.wetsuit;
        if (item) onSavedWithData?.(item);
        onSaved();
        onOpenChange(false);
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to save");
      }
    } catch (error) {
      console.error("Error saving equipment:", error);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit" : "Add"} {equipmentType === "surfboard" ? "Surfboard" : "Wetsuit"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              placeholder={equipmentType === "surfboard" ? 'e.g. "Daily Driver"' : 'e.g. "Winter Suit"'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Brand</Label>
            <Input
              placeholder={equipmentType === "surfboard" ? "e.g. Channel Islands" : "e.g. O'Neill"}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>

          {equipmentType === "surfboard" ? (
            <>
              <div className="space-y-2">
                <Label>Photo</Label>
                {photoUrl ? (
                  <div className="relative w-full aspect-[4/3] rounded-md overflow-hidden border">
                    <img
                      src={photoUrl}
                      alt="Board photo"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(null)}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 w-full h-24 rounded-md border border-dashed text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
                  >
                    <Camera className="size-4" />
                    {uploading ? "Uploading..." : "Add a photo"}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>

              <div className="space-y-2">
                <Label>Model</Label>
                <Input
                  placeholder="e.g. Happy Everyday"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Board Type</Label>
                <Select value={boardType} onValueChange={setBoardType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {BOARD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Length</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="Feet"
                      value={lengthFeet}
                      onChange={(e) => setLengthFeet(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="Inches"
                      value={lengthInches}
                      onChange={(e) => setLengthInches(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">in</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label>Width (in)</Label>
                  <Input
                    type="number"
                    step="0.25"
                    placeholder="20.5"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Thick (in)</Label>
                  <Input
                    type="number"
                    step="0.125"
                    placeholder="2.5"
                    value={thickness}
                    onChange={(e) => setThickness(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vol (L)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    placeholder="30.5"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Fin Setup</Label>
                  <Select value={finSetup} onValueChange={setFinSetup}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {FIN_SETUPS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tail Shape</Label>
                  <Select value={tailShape} onValueChange={setTailShape}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {TAIL_SHAPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Thickness</Label>
                <Input
                  placeholder='e.g. "3/2", "4/3"'
                  value={wetsuitThickness}
                  onChange={(e) => setWetsuitThickness(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Style</Label>
                  <Select value={style} onValueChange={setStyle}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {WETSUIT_STYLES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STYLE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Entry</Label>
                  <Select value={entry} onValueChange={setEntry}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {WETSUIT_ENTRIES.map((e) => (
                        <SelectItem key={e} value={e}>
                          {ENTRY_LABELS[e]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Size</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {WETSUIT_SIZES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              placeholder={equipmentType === "surfboard" ? "e.g. Good for small days" : "e.g. Runs a bit tight"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : existing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
