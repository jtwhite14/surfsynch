import { calculateWaveEnergy } from "@/lib/wave-energy";
import type { ParsedConditions } from "./condition-matcher";
import type { ConditionWeights, ProfileForMatching } from "@/types";
import { DEFAULT_CONDITION_WEIGHTS } from "@/types";

/**
 * Convert a condition profile's target values to ParsedConditions for matching.
 * Computes waveEnergy from height + period via existing calculateWaveEnergy.
 */
export function profileToConditions(profile: {
  targetSwellHeight: string | null;
  targetSwellPeriod: string | null;
  targetSwellDirection: string | null;
  targetWindSpeed: string | null;
  targetWindDirection: string | null;
  targetTideHeight: string | null;
}): { conditions: ParsedConditions; specifiedVars: Set<string> } {
  const specifiedVars = new Set<string>();

  const swellHeight = safeParseFloat(profile.targetSwellHeight);
  const swellPeriod = safeParseFloat(profile.targetSwellPeriod);
  const swellDirection = safeParseFloat(profile.targetSwellDirection);
  const windSpeed = safeParseFloat(profile.targetWindSpeed);
  const windDirection = safeParseFloat(profile.targetWindDirection);
  const tideHeight = safeParseFloat(profile.targetTideHeight);

  if (swellHeight != null) specifiedVars.add("swellHeight");
  if (swellPeriod != null) specifiedVars.add("swellPeriod");
  if (swellDirection != null) specifiedVars.add("swellDirection");
  if (windSpeed != null) specifiedVars.add("windSpeed");
  if (windDirection != null) specifiedVars.add("windDirection");
  if (tideHeight != null) specifiedVars.add("tideHeight");

  const waveEnergy = calculateWaveEnergy(swellHeight, swellPeriod);
  if (swellHeight != null && swellPeriod != null) specifiedVars.add("waveEnergy");

  return {
    conditions: {
      swellHeight,
      swellPeriod,
      swellDirection,
      windSpeed,
      windDirection,
      tideHeight,
      waveEnergy,
    },
    specifiedVars,
  };
}

/**
 * Build ProfileForMatching from a DB profile row.
 */
export function buildProfileForMatching(profile: {
  id: string;
  name: string;
  targetSwellHeight: string | null;
  targetSwellPeriod: string | null;
  targetSwellDirection: string | null;
  targetWindSpeed: string | null;
  targetWindDirection: string | null;
  targetTideHeight: string | null;
  reinforcementCount: number;
  consistency: string;
  qualityCeiling: number;
  weightSwellHeight?: string;
  weightSwellPeriod?: string;
  weightSwellDirection?: string;
  weightTideHeight?: string;
  weightWindSpeed?: string;
  weightWindDirection?: string;
  weightWaveEnergy?: string;
}): ProfileForMatching {
  const { conditions, specifiedVars } = profileToConditions(profile);
  const weights: ConditionWeights = {
    ...DEFAULT_CONDITION_WEIGHTS,
    swellHeight: safeParseFloat(profile.weightSwellHeight ?? null) ?? DEFAULT_CONDITION_WEIGHTS.swellHeight,
    swellPeriod: safeParseFloat(profile.weightSwellPeriod ?? null) ?? DEFAULT_CONDITION_WEIGHTS.swellPeriod,
    swellDirection: safeParseFloat(profile.weightSwellDirection ?? null) ?? DEFAULT_CONDITION_WEIGHTS.swellDirection,
    tideHeight: safeParseFloat(profile.weightTideHeight ?? null) ?? DEFAULT_CONDITION_WEIGHTS.tideHeight,
    windSpeed: safeParseFloat(profile.weightWindSpeed ?? null) ?? DEFAULT_CONDITION_WEIGHTS.windSpeed,
    windDirection: safeParseFloat(profile.weightWindDirection ?? null) ?? DEFAULT_CONDITION_WEIGHTS.windDirection,
    waveEnergy: safeParseFloat(profile.weightWaveEnergy ?? null) ?? DEFAULT_CONDITION_WEIGHTS.waveEnergy,
  };
  return {
    id: profile.id,
    name: profile.name,
    conditions,
    specifiedVars,
    reinforcementCount: profile.reinforcementCount,
    consistency: profile.consistency as 'low' | 'medium' | 'high',
    qualityCeiling: profile.qualityCeiling,
    weights,
  };
}

/**
 * Reinforcement-count confidence: new manual profiles start at 0.9,
 * reach 1.0 at count=10.
 */
export function getReinforcementConfidence(reinforcementCount: number): number {
  return Math.min(1.0, 0.9 + 0.01 * reinforcementCount);
}

/**
 * EMA alpha curve for reinforcement.
 * Starts at 0.3 (strong early influence), floor at 0.05 (~20 sessions of memory).
 */
export function getReinforcementAlpha(reinforcementCount: number): number {
  return Math.max(0.05, 0.3 / (1 + 0.2 * reinforcementCount));
}

/**
 * Circular EMA for directional variables (0-360 degrees).
 * Naive linear EMA produces wrong results near 0°/360° boundary.
 */
export function circularEma(oldDeg: number, newDeg: number, alpha: number): number {
  const oldRad = oldDeg * Math.PI / 180;
  const newRad = newDeg * Math.PI / 180;
  const x = alpha * Math.cos(newRad) + (1 - alpha) * Math.cos(oldRad);
  const y = alpha * Math.sin(newRad) + (1 - alpha) * Math.sin(oldRad);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/**
 * Standard linear EMA for non-directional variables.
 */
export function linearEma(oldVal: number, newVal: number, alpha: number): number {
  return alpha * newVal + (1 - alpha) * oldVal;
}

/**
 * Check if a profile is active for a given month (1-12).
 */
export function isProfileActiveForMonth(activeMonths: number[] | null, month: number): boolean {
  if (!activeMonths || activeMonths.length === 0) return true;
  return activeMonths.includes(month);
}

/**
 * Map categorical pill selections to numeric target midpoints.
 */
export const WAVE_SIZE_MIDPOINTS: Record<string, number> = {
  small: 0.45,   // midpoint of [0, 0.9]
  medium: 1.35,  // midpoint of [0.9, 1.8]
  large: 2.4,    // midpoint of [1.8, 3.0]
  xl: 4.0,       // representative for 10ft+
};

export const SWELL_PERIOD_MIDPOINTS: Record<string, number> = {
  short: 4,      // midpoint of [0, 8]
  medium: 10,    // midpoint of [8, 12]
  long: 15,      // representative for 12s+
};

export const WIND_SPEED_MIDPOINTS: Record<string, number> = {
  glassy: 5,     // light winds
  offshore: 12,
  "cross-offshore": 12,
  onshore: 15,
};

export const TIDE_HEIGHT_MIDPOINTS: Record<string, number> = {
  low: -0.5,
  mid: 0,
  high: 0.5,
};

/**
 * Find the key in a midpoints map whose value is closest to the given number.
 */
export function closestMidpointKey(value: number, midpoints: Record<string, number>): string {
  let closest = "";
  let closestDist = Infinity;
  for (const [key, mid] of Object.entries(midpoints)) {
    const dist = Math.abs(value - mid);
    if (dist < closestDist) {
      closestDist = dist;
      closest = key;
    }
  }
  return closest;
}

/**
 * Reverse-map a numeric value to the closest categorical key, or null if value is null.
 */
export function numericToCategory(value: number | null, midpoints: Record<string, number>): string | null {
  if (value == null) return null;
  return closestMidpointKey(value, midpoints);
}

export const MONTHS = [
  { value: 1, label: "Jan" }, { value: 2, label: "Feb" }, { value: 3, label: "Mar" },
  { value: 4, label: "Apr" }, { value: 5, label: "May" }, { value: 6, label: "Jun" },
  { value: 7, label: "Jul" }, { value: 8, label: "Aug" }, { value: 9, label: "Sep" },
  { value: 10, label: "Oct" }, { value: 11, label: "Nov" }, { value: 12, label: "Dec" },
] as const;

function safeParseFloat(value: string | null): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}
