"use client";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { Surfboard, Wetsuit } from "@/lib/db/schema";

function formatLength(inches: string): string {
  const total = parseFloat(inches);
  const feet = Math.floor(total / 12);
  const remaining = Math.round(total % 12);
  return remaining > 0 ? `${feet}'${remaining}"` : `${feet}'`;
}

const STYLE_LABELS: Record<string, string> = {
  fullsuit: "Full Suit",
  springsuit: "Spring Suit",
  shorty: "Shorty",
  top: "Top",
  shorts: "Shorts",
};

const ENTRY_LABELS: Record<string, string> = {
  chest_zip: "Chest Zip",
  back_zip: "Back Zip",
  zipperless: "Zipperless",
};

interface EquipmentCardProps {
  equipment: Surfboard | Wetsuit;
  type: "surfboard" | "wetsuit";
  onEdit: () => void;
  onDelete: () => void;
  onRetire: () => void;
}

export function EquipmentCard({ equipment, type, onEdit, onDelete, onRetire }: EquipmentCardProps) {
  const isRetired = equipment.retired;

  const pills: string[] = [];
  if (type === "surfboard") {
    const board = equipment as Surfboard;
    if (board.lengthInches) pills.push(formatLength(board.lengthInches));
    if (board.boardType) pills.push(board.boardType.charAt(0).toUpperCase() + board.boardType.slice(1));
    if (board.finSetup) pills.push(board.finSetup.charAt(0).toUpperCase() + board.finSetup.slice(1));
    if (board.tailShape) pills.push(board.tailShape.charAt(0).toUpperCase() + board.tailShape.slice(1));
    if (board.volume) pills.push(`${board.volume}L`);
  } else {
    const suit = equipment as Wetsuit;
    if (suit.thickness) pills.push(`${suit.thickness}mm`);
    if (suit.style) pills.push(STYLE_LABELS[suit.style] || suit.style);
    if (suit.entry) pills.push(ENTRY_LABELS[suit.entry] || suit.entry);
    if (suit.size) pills.push(suit.size);
  }

  const brandModel = type === "surfboard"
    ? [
        (equipment as Surfboard).brand,
        (equipment as Surfboard).model,
      ].filter(Boolean).join(" ")
    : (equipment as Wetsuit).brand || "";

  const photoUrl = type === "surfboard" ? (equipment as Surfboard).photoUrl : null;

  return (
    <div className={`relative rounded-lg border overflow-hidden ${isRetired ? "opacity-50" : ""}`}>
      {photoUrl && (
        <div className="w-full aspect-[4/3]">
          <img
            src={photoUrl}
            alt={equipment.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{equipment.name}</h3>
            {isRetired && <Badge variant="secondary" className="text-xs">Retired</Badge>}
          </div>
          {brandModel && (
            <p className="text-sm text-muted-foreground truncate">{brandModel}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded-md hover:bg-accent text-muted-foreground">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={onRetire}>
              {isRetired ? "Unretire" : "Retire"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {pills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {pills.map((pill) => (
            <Badge key={pill} variant="secondary" className="text-xs">
              {pill}
            </Badge>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
