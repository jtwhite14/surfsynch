import type { conditionProfiles } from "@/lib/db/schema";
import type { ConditionProfileResponse } from "@/types";

export function formatProfile(p: typeof conditionProfiles.$inferSelect): ConditionProfileResponse {
  return {
    id: p.id,
    spotId: p.spotId,
    name: p.name,
    sortOrder: p.sortOrder,
    isActive: p.isActive,
    targetSwellHeight: p.targetSwellHeight ? parseFloat(p.targetSwellHeight) : null,
    targetSwellPeriod: p.targetSwellPeriod ? parseFloat(p.targetSwellPeriod) : null,
    targetSwellDirection: p.targetSwellDirection ? parseFloat(p.targetSwellDirection) : null,
    targetWindSpeed: p.targetWindSpeed ? parseFloat(p.targetWindSpeed) : null,
    targetWindDirection: p.targetWindDirection ? parseFloat(p.targetWindDirection) : null,
    targetTideHeight: p.targetTideHeight ? parseFloat(p.targetTideHeight) : null,
    activeMonths: p.activeMonths as number[] | null,
    consistency: p.consistency as 'low' | 'medium' | 'high',
    qualityCeiling: p.qualityCeiling,
    reinforcementCount: p.reinforcementCount,
    source: p.source as 'manual' | 'auto_generated',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
