"use client";

import { Waves, Wind, ArrowUpDown, Clock, Package, BarChart3, type LucideIcon } from "lucide-react";

interface Insight {
  text: string;
  type: string;
  confidence: number;
}

interface InsightCardsProps {
  insights: Insight[];
}

const typeIcons: Record<string, LucideIcon> = {
  swell: Waves,
  wind: Wind,
  tide: ArrowUpDown,
  time: Clock,
  equipment: Package,
  general: BarChart3,
};

export function InsightCards({ insights }: InsightCardsProps) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="space-y-2">
      {insights.map((insight, i) => {
        const Icon = typeIcons[insight.type] || BarChart3;
        return (
          <div
            key={i}
            className="flex items-start gap-3 rounded-lg border bg-background/60 px-3 py-2.5"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground mt-0.5" />
            <p className="text-sm leading-relaxed">{insight.text}</p>
          </div>
        );
      })}
    </div>
  );
}
