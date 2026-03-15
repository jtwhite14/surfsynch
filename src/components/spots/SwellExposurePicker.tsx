"use client";

import { CardinalDirection } from "@/types";

interface SwellExposurePickerProps {
  value: CardinalDirection[];
  onChange: (directions: CardinalDirection[]) => void;
}

const DIRECTIONS: { dir: CardinalDirection; row: number; col: number }[] = [
  { dir: "NW", row: 0, col: 0 },
  { dir: "N",  row: 0, col: 1 },
  { dir: "NE", row: 0, col: 2 },
  { dir: "W",  row: 1, col: 0 },
  // center empty
  { dir: "E",  row: 1, col: 2 },
  { dir: "SW", row: 2, col: 0 },
  { dir: "S",  row: 2, col: 1 },
  { dir: "SE", row: 2, col: 2 },
];

export function SwellExposurePicker({ value, onChange }: SwellExposurePickerProps) {
  function toggle(dir: CardinalDirection) {
    if (value.includes(dir)) {
      onChange(value.filter(d => d !== dir));
    } else {
      onChange([...value, dir]);
    }
  }

  return (
    <div>
      <label className="text-sm font-medium mb-1.5 block">Swell exposure</label>
      <p className="text-xs text-muted-foreground mb-2">
        Select the directions this spot receives swell from.
      </p>
      <div className="grid grid-cols-3 gap-1.5 w-fit">
        {[0, 1, 2].map(row =>
          [0, 1, 2].map(col => {
            const entry = DIRECTIONS.find(d => d.row === row && d.col === col);
            if (!entry) {
              // Center cell — compass dot
              return (
                <div
                  key={`${row}-${col}`}
                  className="w-10 h-10 flex items-center justify-center"
                >
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                </div>
              );
            }
            const selected = value.includes(entry.dir);
            return (
              <button
                key={entry.dir}
                type="button"
                onClick={() => toggle(entry.dir)}
                className={`w-10 h-10 rounded text-xs font-medium transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {entry.dir}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
