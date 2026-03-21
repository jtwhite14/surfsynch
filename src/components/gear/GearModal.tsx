"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Surfboard, Wetsuit } from "@/lib/db/schema";
import { EquipmentCard } from "@/components/equipment/EquipmentCard";
import { EquipmentFormDialog } from "@/components/equipment/EquipmentFormDialog";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

interface GearModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when gear is added/edited/deleted so the parent can refresh its data */
  onChanged?: () => void;
}

export function GearModal({ open, onClose, onChanged }: GearModalProps) {
  const [surfboards, setSurfboards] = useState<Surfboard[]>([]);
  const [wetsuits, setWetsuits] = useState<Wetsuit[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"surfboard" | "wetsuit">("surfboard");
  const [editingItem, setEditingItem] = useState<Surfboard | Wetsuit | null>(null);

  const fetchGear = useCallback(async () => {
    try {
      const [boardsRes, suitsRes] = await Promise.all([
        fetch("/api/surfboards"),
        fetch("/api/wetsuits"),
      ]);
      if (boardsRes.ok) {
        const data = await boardsRes.json();
        setSurfboards(data.surfboards || []);
      }
      if (suitsRes.ok) {
        const data = await suitsRes.json();
        setWetsuits(data.wetsuits || []);
      }
    } catch (error) {
      console.error("Error fetching gear:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchGear();
    }
  }, [open, fetchGear]);

  const handleAdd = (type: "surfboard" | "wetsuit") => {
    setDialogType(type);
    setEditingItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: Surfboard | Wetsuit, type: "surfboard" | "wetsuit") => {
    setDialogType(type);
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string, type: "surfboard" | "wetsuit") => {
    if (!confirm(`Delete this ${type}? Sessions using it will keep their data but the link will be removed.`)) return;
    try {
      const endpoint = type === "surfboard" ? "/api/surfboards" : "/api/wetsuits";
      const response = await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
      if (response.ok) {
        toast.success(`${type === "surfboard" ? "Board" : "Wetsuit"} deleted`);
        fetchGear();
        onChanged?.();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleRetire = async (item: Surfboard | Wetsuit, type: "surfboard" | "wetsuit") => {
    try {
      const endpoint = type === "surfboard" ? "/api/surfboards" : "/api/wetsuits";
      const response = await fetch(`${endpoint}?id=${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retired: !item.retired }),
      });
      if (response.ok) {
        toast.success(item.retired ? "Unretired" : "Retired");
        fetchGear();
        onChanged?.();
      }
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleSaved = () => {
    fetchGear();
    onChanged?.();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Modal panel */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] pb-[5vh] pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl max-h-full overflow-y-auto rounded-lg border bg-background shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background z-10">
            <h2 className="text-xl font-bold">Gear</h2>
            <button
              onClick={onClose}
              className="rounded-md p-2 hover:bg-accent transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="px-6 py-6 space-y-8">
            {loading ? (
              <div className="space-y-6">
                <div className="h-6 bg-muted rounded w-1/4 animate-pulse" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-32 bg-muted rounded animate-pulse" />
                  ))}
                </div>
                <div className="h-6 bg-muted rounded w-1/4 animate-pulse" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-32 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Surfboards */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Boards</h3>
                    <Button size="sm" variant="outline" onClick={() => handleAdd("surfboard")}>
                      <Plus className="size-4 mr-1" />
                      Add Board
                    </Button>
                  </div>
                  {surfboards.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {surfboards.map((board) => (
                        <EquipmentCard
                          key={board.id}
                          equipment={board}
                          type="surfboard"
                          onEdit={() => handleEdit(board, "surfboard")}
                          onDelete={() => handleDelete(board.id, "surfboard")}
                          onRetire={() => handleRetire(board, "surfboard")}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                      <p>No boards yet</p>
                      <p className="text-sm mt-1">Add your boards to track what you ride each session</p>
                    </div>
                  )}
                </section>

                {/* Wetsuits */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Wetsuits</h3>
                    <Button size="sm" variant="outline" onClick={() => handleAdd("wetsuit")}>
                      <Plus className="size-4 mr-1" />
                      Add Wetsuit
                    </Button>
                  </div>
                  {wetsuits.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {wetsuits.map((suit) => (
                        <EquipmentCard
                          key={suit.id}
                          equipment={suit}
                          type="wetsuit"
                          onEdit={() => handleEdit(suit, "wetsuit")}
                          onDelete={() => handleDelete(suit.id, "wetsuit")}
                          onRetire={() => handleRetire(suit, "wetsuit")}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                      <p>No wetsuits yet</p>
                      <p className="text-sm mt-1">Add your suits to track what you wear each session</p>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      <EquipmentFormDialog
        equipmentType={dialogType}
        existing={editingItem}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
      />
    </>
  );
}
