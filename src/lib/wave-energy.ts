/**
 * Wave energy calculation based on the linear wave power formula:
 *   P = (ρg² / 64π) × Hs² × Tp
 *
 * Where:
 *   ρ = seawater density (1025 kg/m³)
 *   g = gravitational acceleration (9.81 m/s²)
 *   Hs = significant wave height (meters)
 *   Tp = peak period (seconds)
 *
 * Result is in watts per meter of wave crest, converted to kilojoules
 * (energy per wave cycle: P × Tp / 1000).
 */

const RHO = 1025; // kg/m³ — seawater density
const G = 9.81;   // m/s²
const COEFFICIENT = (RHO * G * G) / (64 * Math.PI); // ≈ 490.6 W/(m²·s)

/**
 * Calculate wave energy in kilojoules.
 * Returns null if either input is missing.
 *
 * @param heightMeters - significant wave height (Hs) in meters
 * @param periodSeconds - peak swell period (Tp) in seconds
 * @returns energy in kJ, or null
 */
export function calculateWaveEnergy(
  heightMeters: number | null,
  periodSeconds: number | null
): number | null {
  if (heightMeters == null || periodSeconds == null) return null;
  if (heightMeters <= 0 || periodSeconds <= 0) return null;

  // Power in watts per meter of wave crest
  const powerWattsPerMeter = COEFFICIENT * heightMeters * heightMeters * periodSeconds;

  // Convert to kJ: energy per wave cycle over 1 meter of crest
  // E = P × T / 1000
  const energyKj = (powerWattsPerMeter * periodSeconds) / 1000;

  return Math.round(energyKj);
}

// ── Direction attenuation ──

import type { CardinalDirection } from "@/types";

/** Degree mapping for each cardinal direction. */
export const DIRECTION_DEGREES: Record<CardinalDirection, number> = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315,
};

/**
 * Compute an angular distance between two degree values (0-360), accounting for wrap.
 */
function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Calculate direction attenuation factor (0-1) for a swell direction
 * against a set of exposure directions.
 *
 * - No exposure set or no swell direction → 1.0 (no attenuation)
 * - Uses cos²(minDelta) when minDelta ≤ 90°, else 0
 * - Physical basis: wave energy flux perpendicular to shoreline ∝ cos²(θ)
 */
export function calculateDirectionAttenuation(
  swellDirDeg: number | null,
  exposureDirections?: CardinalDirection[]
): number {
  if (!exposureDirections || exposureDirections.length === 0) return 1.0;
  if (swellDirDeg == null) return 1.0;

  // Find the minimum angular distance between swell direction and any exposure direction
  let minDelta = 360;
  for (const dir of exposureDirections) {
    const delta = angularDistance(swellDirDeg, DIRECTION_DEGREES[dir]);
    if (delta < minDelta) minDelta = delta;
  }

  if (minDelta > 90) return 0;

  const radians = (minDelta * Math.PI) / 180;
  const cosVal = Math.cos(radians);
  return cosVal * cosVal; // cos²(θ)
}

/**
 * Human-readable energy label based on kJ thresholds.
 */
export function getEnergyLabel(kj: number | null): string {
  if (kj == null) return "N/A";
  if (kj < 100) return "Weak";
  if (kj < 500) return "Fun";
  if (kj < 1000) return "Solid";
  if (kj < 2000) return "Powerful";
  return "Heavy";
}

/**
 * Color for energy visualization (oklch).
 * Green → amber → orange → red as energy increases.
 */
export function getEnergyColor(kj: number | null): string {
  if (kj == null) return "oklch(0.5 0 0)"; // gray
  if (kj < 100) return "oklch(0.72 0.14 145)";  // green
  if (kj < 500) return "oklch(0.75 0.15 85)";   // amber
  if (kj < 1000) return "oklch(0.70 0.17 55)";  // orange
  if (kj < 2000) return "oklch(0.65 0.20 30)";  // deep orange
  return "oklch(0.60 0.22 15)";                   // red
}

/**
 * Format wave energy for display.
 */
export function formatWaveEnergy(kj: number | null): string {
  if (kj == null) return "N/A";
  if (kj >= 1000) return `${(kj / 1000).toFixed(1)}k kJ`;
  return `${kj} kJ`;
}
