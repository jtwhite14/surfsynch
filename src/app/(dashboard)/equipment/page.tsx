"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Surfboard, Wetsuit } from "@/lib/db/schema";
import { EquipmentCard } from "@/components/equipment/EquipmentCard";
import { EquipmentFormDialog } from "@/components/equipment/EquipmentFormDialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function EquipmentPage() {
  const [surfboards, setSurfboards] = useState<Surfboard[]>([]);
  const [wetsuits, setWetsuits] = useState<Wetsuit[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"surfboard" | "wetsuit">("surfboard");
  const [editingItem, setEditingItem] = useState<Surfboard | Wetsuit | null>(null);

  const fetchEquipment = async () => {
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
      console.error("Error fetching equipment:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEquipment();
  }, []);

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
        toast.success(`${type === "surfboard" ? "Surfboard" : "Wetsuit"} deleted`);
        fetchEquipment();
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
        fetchEquipment();
      }
    } catch {
      toast.error("Failed to update");
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-8 bg-muted rounded w-1/4 animate-pulse" />
        <div className="h-32 bg-muted rounded animate-pulse" />
        <div className="h-32 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl sm:text-3xl font-bold">Equipment</h1>

      {/* Surfboards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Surfboards</h2>
          <Button size="sm" variant="outline" onClick={() => handleAdd("surfboard")}>
            <Plus className="size-4 mr-1" />
            Add Surfboard
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
            <p>No surfboards yet</p>
            <p className="text-sm mt-1">Add your boards to track what you ride each session</p>
          </div>
        )}
      </section>

      {/* Wetsuits */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Wetsuits</h2>
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

      <EquipmentFormDialog
        equipmentType={dialogType}
        existing={editingItem}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchEquipment}
      />
    </div>
  );
}
