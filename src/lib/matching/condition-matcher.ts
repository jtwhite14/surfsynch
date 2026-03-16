import { MarineConditions, ConditionWeights, DEFAULT_CONDITION_WEIGHTS, MatchDetails, TimeWindow, CardinalDirection, PreferredWaveSize, PreferredSwellPeriod, PreferredWind, ProfileForMatching } from "@/types";
import { calculateDirectionAttenuation, calculateWaveEnergy } from "@/lib/wave-energy";
import { getReinforcementConfidence, isProfileActiveForMonth } from "@/lib/matching/profile-utils";

// ── Gaussian similarity ──

/**
 * Gaussian similarity: exp(-delta^2 / (2 * sigma^2))
 * Returns 0-1 where 1 = identical, ~0.13 at 2-sigma distance.
 */
function gaussianSimilarity(a: number, b: number, sigma: number): number {
  if (sigma <= 0) return a === b ? 1 : 0;
  const delta = a - b;
  return Math.exp(-(delta * delta) / (2 * sigma * sigma));
}

/**
 * Angular distance accounting for 360-degree wrap.
 */
function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Gaussian similarity for directional values (0-360 degrees).
 */
function directionalSimilarity(a: number, b: number, sigma: number): number {
  const dist = angularDistance(a, b);
  return Math.exp(-(dist * dist) / (2 * sigma * sigma));
}

// ── Sigmas (tuned per-variable) ──

const SIGMAS = {
  swellHeight: (sessionValue: number) => Math.max(0.4, 0.35 * sessionValue), // relative
  swellPeriod: 1.5,
  swellDirection: 30,
  windSpeed: 7.5, // km/h
  windDirection: 45,
  tideHeight: 0.75, // feet
  waveEnergy: (sessionValue: number) => Math.max(50, 0.35 * sessionValue), // relative, kJ
};

// ── Rating boost ──

const RATING_BOOST: Record<number, number> = {
  5: 1.0,
  4: 0.95,
  3: 0.85,
};

export function getRatingBoost(rating: number): number {
  return RATING_BOOST[Math.min(5, Math.max(3, rating))] ?? 0.5;
}

// ── Forecast confidence decay ──

export function getForecastConfidence(daysOut: number): number {
  if (daysOut <= 1) return 1.0;
  if (daysOut <= 2) return 0.95;
  if (daysOut <= 3) return 0.9;
  if (daysOut <= 4) return 0.8;
  if (daysOut <= 5) return 0.7;
  return 0.5;
}

// ── Time window classification ──

/**
 * Classify an hour (0-23) into a time window.
 * Only meaningful for daylight hours (5-19). Hours outside that range
 * are classified as afternoon but should be filtered out upstream.
 */
export function getTimeWindow(hour: number): TimeWindow {
  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 14) return 'midday';
  return 'afternoon';
}

export function isDaylightHour(hour: number): boolean {
  return hour >= 5 && hour < 20;
}

// ── Seasonal filter ──

/**
 * Check if a session date is within a seasonal window around a target date.
 * Uses day-of-year comparison, wrapping around year boundaries.
 */
export function isWithinSeasonalWindow(
  sessionDate: Date,
  targetDate: Date,
  windowDays: number = 60
): boolean {
  const sessionDoy = getDayOfYear(sessionDate);
  const targetDoy = getDayOfYear(targetDate);
  const diff = Math.abs(sessionDoy - targetDoy);
  const daysInYear = isLeapYear(targetDate.getFullYear()) ? 366 : 365;
  const wrappedDiff = Math.min(diff, daysInYear - diff);
  return wrappedDiff <= windowDays;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** DST-safe day-of-year using UTC methods. */
function getDayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((current - start) / (1000 * 60 * 60 * 24));
}

// ── Safe parseFloat that guards against NaN ──

function safeParseFloat(value: string | null): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

// ── Parse session conditions from DB strings to numbers ──

export interface ParsedConditions {
  swellHeight: number | null;
  swellPeriod: number | null;
  swellDirection: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  tideHeight: number | null;
  waveEnergy: number | null;
}

export function parseSessionConditions(conditions: {
  primarySwellHeight: string | null;
  primarySwellPeriod: string | null;
  primarySwellDirection: string | null;
  windSpeed: string | null;
  windDirection: string | null;
  tideHeight: string | null;
  waveEnergy: string | null;
}): ParsedConditions {
  const swellHeight = safeParseFloat(conditions.primarySwellHeight);
  const swellPeriod = safeParseFloat(conditions.primarySwellPeriod);
  return {
    swellHeight,
    swellPeriod,
    swellDirection: safeParseFloat(conditions.primarySwellDirection),
    windSpeed: safeParseFloat(conditions.windSpeed),
    windDirection: safeParseFloat(conditions.windDirection),
    tideHeight: safeParseFloat(conditions.tideHeight),
    waveEnergy: safeParseFloat(conditions.waveEnergy) ?? calculateWaveEnergy(swellHeight, swellPeriod),
  };
}

export function parseForecastConditions(forecast: MarineConditions): ParsedConditions {
  return {
    swellHeight: forecast.primarySwellHeight,
    swellPeriod: forecast.primarySwellPeriod,
    swellDirection: forecast.primarySwellDirection,
    windSpeed: forecast.windSpeed,
    windDirection: forecast.windDirection,
    tideHeight: forecast.tideHeight,
    waveEnergy: forecast.waveEnergy ?? calculateWaveEnergy(forecast.primarySwellHeight, forecast.primarySwellPeriod),
  };
}

// ── Preference bonus/penalty ──

const PREF_BONUS = 1.1;
const PREF_PENALTY = 0.85;

/** Wave size preference ranges in meters */
const WAVE_SIZE_RANGES: Record<PreferredWaveSize, [number, number]> = {
  small: [0, 0.9],     // <3ft
  medium: [0.9, 1.8],  // 3-6ft
  large: [1.8, 3.0],   // 6-10ft
  xl: [3.0, Infinity],  // 10ft+
};

/** Swell period preference ranges in seconds */
const SWELL_PERIOD_RANGES: Record<PreferredSwellPeriod, [number, number]> = {
  short: [0, 8],
  medium: [8, 12],
  long: [12, Infinity],
};

function getPreferenceMultiplier(value: number | null, pref: string | string[] | undefined, ranges: Record<string, [number, number]>): number {
  if (value == null || !pref) return 1.0;
  const prefs = Array.isArray(pref) ? pref : [pref];
  if (prefs.length === 0) return 1.0;
  for (const p of prefs) {
    if (p in ranges) {
      const [min, max] = ranges[p];
      if (value >= min && value < max) return PREF_BONUS;
    }
  }
  return PREF_PENALTY;
}

function getWindPreferenceMultiplier(windSpeed: number | null, pref: PreferredWind | PreferredWind[] | undefined): number {
  if (windSpeed == null || !pref) return 1.0;
  const prefs = Array.isArray(pref) ? pref : [pref];
  if (prefs.length === 0) return 1.0;
  if (prefs.includes('glassy')) {
    if (windSpeed < 10) return PREF_BONUS;
    if (windSpeed > 15) return PREF_PENALTY;
    return 1.0;
  }
  // Offshore/cross-offshore/onshore deferred — requires spot orientation
  return 1.0;
}

function getTidePreferenceMultiplier(tideHeight: number | null, pref: string | string[] | undefined): number {
  if (tideHeight == null || !pref) return 1.0;
  const prefs = Array.isArray(pref) ? pref : pref === 'any' ? [] : [pref];
  if (prefs.length === 0) return 1.0;

  // Check if any preferred tide matches — best match wins
  function singleTideMultiplier(p: string): number {
    if (p === 'low') return tideHeight! < -0.3 ? PREF_BONUS : (tideHeight! > 0.3 ? PREF_PENALTY : 1.0);
    if (p === 'high') return tideHeight! > 0.3 ? PREF_BONUS : (tideHeight! < -0.3 ? PREF_PENALTY : 1.0);
    if (p === 'mid') return (tideHeight! >= -0.3 && tideHeight! <= 0.3) ? PREF_BONUS : PREF_PENALTY;
    // incoming/outgoing can't be determined from a single height snapshot
    return 1.0;
  }

  return Math.max(...prefs.map(singleTideMultiplier));
}

// ── Core matching ──

/**
 * Compare forecast conditions against a past session's (or profile's) conditions.
 * Returns raw similarity score (0-100) and per-variable details.
 *
 * @param profileSpecifiedVars - Optional set of variable names specified by a profile.
 *   For profile-based matching: coverage is computed as matchedPairs / profileSpecifiedCount
 *   (not /7), and preference multipliers are skipped for profile-specified vars.
 */
// Minimum similarity required for "critical" importance variables (weight >= 1.5).
// Below this threshold the variable acts as a hard veto on the match.
const CRITICAL_WEIGHT_THRESHOLD = 1.5;
const CRITICAL_SIM_FLOOR = 0.3;

export function computeSimilarity(
  forecast: ParsedConditions,
  session: ParsedConditions,
  weights: ConditionWeights = DEFAULT_CONDITION_WEIGHTS,
  profileSpecifiedVars?: Set<string>
): { score: number; details: MatchDetails; coverage: number } {
  let weightedSum = 0;
  let totalWeight = 0;
  let nonNullCount = 0;
  let criticalVeto = false;
  const isProfileMatch = profileSpecifiedVars != null && profileSpecifiedVars.size > 0;
  const totalVars = isProfileMatch ? profileSpecifiedVars!.size : 7;

  // Per-variable similarities
  const details: MatchDetails = {
    swellHeight: null,
    swellPeriod: null,
    swellDirection: null,
    tideHeight: null,
    windSpeed: null,
    windDirection: null,
    waveEnergy: null,
    coverage: 0,
    ratingBoost: 1,
    forecastConfidence: 1,
  };

  // Swell height (relative sigma) + wave size preference
  if (forecast.swellHeight != null && session.swellHeight != null) {
    const sigma = SIGMAS.swellHeight(session.swellHeight);
    let sim = gaussianSimilarity(forecast.swellHeight, session.swellHeight, sigma);
    // Skip preference multiplier for profile-specified vars
    if (!isProfileMatch || !profileSpecifiedVars!.has("swellHeight")) {
      sim *= getPreferenceMultiplier(forecast.swellHeight, weights.preferredWaveSize, WAVE_SIZE_RANGES);
    }
    sim = Math.min(1, sim); // cap at 1 after bonus
    details.swellHeight = sim;
    weightedSum += weights.swellHeight * sim;
    totalWeight += weights.swellHeight;
    nonNullCount++;
    if (weights.swellHeight >= CRITICAL_WEIGHT_THRESHOLD && sim < CRITICAL_SIM_FLOOR) criticalVeto = true;
  }

  // Swell period + period preference
  if (forecast.swellPeriod != null && session.swellPeriod != null) {
    let sim = gaussianSimilarity(forecast.swellPeriod, session.swellPeriod, SIGMAS.swellPeriod);
    if (!isProfileMatch || !profileSpecifiedVars!.has("swellPeriod")) {
      sim *= getPreferenceMultiplier(forecast.swellPeriod, weights.preferredSwellPeriod, SWELL_PERIOD_RANGES);
    }
    sim = Math.min(1, sim);
    details.swellPeriod = sim;
    weightedSum += weights.swellPeriod * sim;
    totalWeight += weights.swellPeriod;
    nonNullCount++;
    if (weights.swellPeriod >= CRITICAL_WEIGHT_THRESHOLD && sim < CRITICAL_SIM_FLOOR) criticalVeto = true;
  }

  // Swell direction
  if (forecast.swellDirection != null && session.swellDirection != null) {
    const sim = directionalSimilarity(forecast.swellDirection, session.swellDirection, SIGMAS.swellDirection);
    details.swellDirection = sim;
    weightedSum += weights.swellDirection * sim;
    totalWeight += weights.swellDirection;
    nonNullCount++;
    if (weights.swellDirection >= CRITICAL_WEIGHT_THRESHOLD && sim < CRITICAL_SIM_FLOOR) criticalVeto = true;
  }

  // Wind speed + wind preference
  if (forecast.windSpeed != null && session.windSpeed != null) {
    let sim = gaussianSimilarity(forecast.windSpeed, session.windSpeed, SIGMAS.windSpeed);
    if (!isProfileMatch || !profileSpecifiedVars!.has("windSpeed")) {
      sim *= getWindPreferenceMultiplier(forecast.windSpeed, weights.preferredWind);
    }
    sim = Math.min(1, sim);
    details.windSpeed = sim;
    weightedSum += weights.windSpeed * sim;
    totalWeight += weights.windSpeed;
    nonNullCount++;
    if (weights.windSpeed >= CRITICAL_WEIGHT_THRESHOLD && sim < CRITICAL_SIM_FLOOR) criticalVeto = true;
  }

  // Wind direction
  if (forecast.windDirection != null && session.windDirection != null) {
    const sim = directionalSimilarity(forecast.windDirection, session.windDirection, SIGMAS.windDirection);
    details.windDirection = sim;
    weightedSum += weights.windDirection * sim;
    totalWeight += weights.windDirection;
    nonNullCount++;
    if (weights.windDirection >= CRITICAL_WEIGHT_THRESHOLD && sim < CRITICAL_SIM_FLOOR) criticalVeto = true;
  }

  // Tide height + tide preference
  if (forecast.tideHeight != null && session.tideHeight != null) {
    let sim = gaussianSimilarity(forecast.tideHeight, session.tideHeight, SIGMAS.tideHeight);
    if (!isProfileMatch || !profileSpecifiedVars!.has("tideHeight")) {
      sim *= getTidePreferenceMultiplier(forecast.tideHeight, weights.preferredTide);
    }
    sim = Math.min(1, sim);
    details.tideHeight = sim;
    weightedSum += weights.tideHeight * sim;
    totalWeight += weights.tideHeight;
    nonNullCount++;
    if (weights.tideHeight >= CRITICAL_WEIGHT_THRESHOLD && sim < CRITICAL_SIM_FLOOR) criticalVeto = true;
  }

  // Wave energy (relative sigma)
  if (forecast.waveEnergy != null && session.waveEnergy != null) {
    const sigma = SIGMAS.waveEnergy(session.waveEnergy);
    const sim = gaussianSimilarity(forecast.waveEnergy, session.waveEnergy, sigma);
    details.waveEnergy = sim;
    weightedSum += weights.waveEnergy * sim;
    totalWeight += weights.waveEnergy;
    nonNullCount++;
    if (weights.waveEnergy >= CRITICAL_WEIGHT_THRESHOLD && sim < CRITICAL_SIM_FLOOR) criticalVeto = true;
  }

  const coverage = nonNullCount / totalVars;
  details.coverage = coverage;

  // For profile matching: require minimum 2 absolute matched pairs and >=50% coverage
  // For session matching: require at least 50% coverage (3.5 of 7)
  const minAbsoluteCount = isProfileMatch ? 2 : 0;
  if (coverage < 0.5 || totalWeight === 0 || nonNullCount < minAbsoluteCount) {
    return { score: 0, details, coverage };
  }

  // Hard veto: if any critical-importance variable scored below the floor, reject the match
  if (criticalVeto) {
    return { score: 0, details, coverage };
  }

  const score = (weightedSum / totalWeight) * 100;
  return { score, details, coverage };
}

/**
 * Full alert scoring: similarity * forecast confidence * rating boost.
 */
export function computeEffectiveScore(
  rawScore: number,
  daysOut: number,
  sessionRating: number
): number {
  const confidence = getForecastConfidence(daysOut);
  const boost = getRatingBoost(sessionRating);
  return rawScore * confidence * boost;
}

// ── Alert generation for a spot ──

export interface SessionForMatching {
  id: string;
  date: Date;
  rating: number;
  notes: string | null;
  photoUrl: string | null;
  conditions: ParsedConditions;
}

export interface ForecastHour {
  time: string;
  timestamp: Date;
  conditions: ParsedConditions;
  fullConditions: MarineConditions;
}

export interface ComputedAlert {
  forecastHour: Date;
  timeWindow: TimeWindow;
  matchScore: number;
  confidenceScore: number;
  effectiveScore: number;
  matchedSession: SessionForMatching;
  matchDetails: MatchDetails;
  forecastSnapshot: MarineConditions;
}

/**
 * Extract the local hour from a forecast timestamp string.
 * Open-Meteo returns times like "2026-03-15T07:00" in the spot's local
 * timezone (because we request timezone:"auto"). We parse the hour directly
 * from the string to avoid server-timezone conversion issues.
 */
function getLocalHourFromTimeString(timeStr: string): number {
  // Format: "YYYY-MM-DDTHH:MM" or ISO with offset
  const match = timeStr.match(/T(\d{2}):/);
  return match ? parseInt(match[1], 10) : new Date(timeStr).getUTCHours();
}

/**
 * Extract the local date string (YYYY-MM-DD) from a forecast time string.
 */
function getLocalDateFromTimeString(timeStr: string): string {
  return timeStr.slice(0, 10);
}

/**
 * Generate alerts for a spot by comparing forecast hours to past sessions.
 * Returns the best alert per time-window per day, sorted by effective score.
 *
 * Forecast times are in the spot's local timezone (Open-Meteo timezone:"auto").
 * We parse hours from the time string directly to avoid UTC conversion bugs.
 */
export function generateAlerts(
  forecastHours: ForecastHour[],
  sessions: SessionForMatching[],
  weights: ConditionWeights = DEFAULT_CONDITION_WEIGHTS,
  threshold: number = 70,
  now: Date = new Date(),
  utcOffsetSeconds: number = 0,
  swellExposure?: CardinalDirection[]
): ComputedAlert[] {
  if (sessions.length === 0) return [];

  // Forecast timestamps are local times parsed as UTC on the server
  // (e.g. "2026-03-15T07:00" → 07:00 UTC, but it really means 07:00 local).
  // Shift `now` into the same "local-as-UTC" space so comparisons are correct.
  const nowLocalMs = now.getTime() + utcOffsetSeconds * 1000;

  // Filter sessions by seasonal window (±60 days, fall back to ±90, then all)
  const targetDate = now;
  let filteredSessions = sessions.filter(s => isWithinSeasonalWindow(s.date, targetDate, 60));
  if (filteredSessions.length === 0) {
    filteredSessions = sessions.filter(s => isWithinSeasonalWindow(s.date, targetDate, 90));
  }
  if (filteredSessions.length === 0) {
    filteredSessions = sessions;
  }

  // Score each forecast hour against each session
  const allCandidates: ComputedAlert[] = [];

  for (const fh of forecastHours) {
    // Parse hour from time string to stay in spot-local timezone
    const localHour = getLocalHourFromTimeString(fh.time);

    // Skip non-daylight hours
    if (!isDaylightHour(localHour)) continue;

    // Skip past hours (allow current hour — still has remaining minutes)
    // Compare in local-as-UTC space so timezone doesn't cause false filtering
    if (fh.timestamp.getTime() + 3600000 <= nowLocalMs) continue;

    // Direction attenuation from swell exposure setting
    const swellDir = fh.conditions.swellDirection;
    const attenuation = calculateDirectionAttenuation(swellDir, swellExposure);

    // If swell is mostly blocked by exposure, skip this hour entirely
    if (attenuation < 0.25) continue;

    const daysOut = (fh.timestamp.getTime() - nowLocalMs) / (1000 * 60 * 60 * 24);
    const forecastConfidence = getForecastConfidence(daysOut);

    let bestForThisHour: ComputedAlert | null = null;

    for (const session of filteredSessions) {
      const { score, details, coverage } = computeSimilarity(
        fh.conditions,
        session.conditions,
        weights
      );

      if (coverage < 0.5) continue;

      const ratingBoost = getRatingBoost(session.rating);
      // Soft-penalize partially exposed hours: sqrt so 45° ≈ 0.84x, not 0.5x
      const exposurePenalty = attenuation < 1.0 ? Math.sqrt(attenuation) : 1.0;
      const effectiveScore = score * forecastConfidence * ratingBoost * exposurePenalty;

      details.ratingBoost = ratingBoost;
      details.forecastConfidence = forecastConfidence;

      if (effectiveScore >= threshold) {
        if (!bestForThisHour || effectiveScore > bestForThisHour.effectiveScore) {
          bestForThisHour = {
            forecastHour: fh.timestamp,
            timeWindow: getTimeWindow(localHour),
            matchScore: score,
            confidenceScore: score * forecastConfidence,
            effectiveScore,
            matchedSession: session,
            matchDetails: details,
            forecastSnapshot: fh.fullConditions,
          };
        }
      }
    }

    if (bestForThisHour) {
      allCandidates.push(bestForThisHour);
    }
  }

  // Group by local date + time window, keep best per group
  const grouped = new Map<string, ComputedAlert>();
  for (const alert of allCandidates) {
    // Find the original time string for this alert's forecast hour
    const fh = forecastHours.find(f => f.timestamp.getTime() === alert.forecastHour.getTime());
    const localDate = fh ? getLocalDateFromTimeString(fh.time) : alert.forecastHour.toISOString().split('T')[0];
    const key = `${localDate}:${alert.timeWindow}`;
    const existing = grouped.get(key);
    if (!existing || alert.effectiveScore > existing.effectiveScore) {
      grouped.set(key, alert);
    }
  }

  // Sort by effective score descending
  return Array.from(grouped.values()).sort((a, b) => b.effectiveScore - a.effectiveScore);
}

// ── Profile-based alert generation ──

export interface ComputedProfileAlert {
  forecastHour: Date;
  timeWindow: TimeWindow;
  matchScore: number;
  confidenceScore: number;
  effectiveScore: number;
  matchedProfile: { id: string; name: string };
  qualityCeiling: number; // 1-5
  consistency: 'low' | 'medium' | 'high';
  matchDetails: MatchDetails;
  forecastSnapshot: MarineConditions;
}

/**
 * Generate alerts for a spot by comparing forecast hours to condition profiles.
 * Parallel to generateAlerts but uses profile-specific logic:
 * - No seasonal filtering (profiles use activeMonths instead)
 * - Reinforcement-count confidence instead of rating boost
 * - Profile-aware coverage calculation
 * - Skip preference multipliers for profile-specified variables
 */
export function generateProfileAlerts(
  forecastHours: ForecastHour[],
  profiles: ProfileForMatching[],
  weights: ConditionWeights = DEFAULT_CONDITION_WEIGHTS,
  threshold: number = 70,
  now: Date = new Date(),
  utcOffsetSeconds: number = 0,
  swellExposure?: CardinalDirection[]
): ComputedProfileAlert[] {
  if (profiles.length === 0) return [];

  const nowLocalMs = now.getTime() + utcOffsetSeconds * 1000;

  // Note: ProfileForMatching doesn't carry activeMonths, so caller must pre-filter.

  const allCandidates: ComputedProfileAlert[] = [];

  for (const fh of forecastHours) {
    const localHour = getLocalHourFromTimeString(fh.time);
    if (!isDaylightHour(localHour)) continue;
    if (fh.timestamp.getTime() + 3600000 <= nowLocalMs) continue;

    const swellDir = fh.conditions.swellDirection;
    const attenuation = calculateDirectionAttenuation(swellDir, swellExposure);
    if (attenuation < 0.25) continue;

    const daysOut = (fh.timestamp.getTime() - nowLocalMs) / (1000 * 60 * 60 * 24);
    const forecastConfidence = getForecastConfidence(daysOut);

    let bestForThisHour: ComputedProfileAlert | null = null;

    for (const profile of profiles) {
      const { score, details, coverage } = computeSimilarity(
        fh.conditions,
        profile.conditions,
        profile.weights,
        profile.specifiedVars
      );

      if (coverage < 0.5) continue;

      const reinforcementConfidence = getReinforcementConfidence(profile.reinforcementCount);
      const exposurePenalty = attenuation < 1.0 ? Math.sqrt(attenuation) : 1.0;
      // Quality ceiling boost: ceiling 3 = 1.0x (neutral), 5 = 1.1x, 1 = 0.9x
      const ceilingMultiplier = 1.0 + (profile.qualityCeiling - 3) * 0.05;
      const effectiveScore = score * forecastConfidence * reinforcementConfidence * exposurePenalty * ceilingMultiplier;

      details.ratingBoost = reinforcementConfidence;
      details.forecastConfidence = forecastConfidence;

      if (effectiveScore >= threshold) {
        if (!bestForThisHour || effectiveScore > bestForThisHour.effectiveScore) {
          bestForThisHour = {
            forecastHour: fh.timestamp,
            timeWindow: getTimeWindow(localHour),
            matchScore: score,
            confidenceScore: score * forecastConfidence,
            effectiveScore,
            matchedProfile: { id: profile.id, name: profile.name },
            qualityCeiling: profile.qualityCeiling,
            consistency: profile.consistency,
            matchDetails: details,
            forecastSnapshot: fh.fullConditions,
          };
        }
      }
    }

    if (bestForThisHour) {
      allCandidates.push(bestForThisHour);
    }
  }

  // Group by local date + time window, keep best per group
  const grouped = new Map<string, ComputedProfileAlert>();
  for (const alert of allCandidates) {
    const fh = forecastHours.find(f => f.timestamp.getTime() === alert.forecastHour.getTime());
    const localDate = fh ? getLocalDateFromTimeString(fh.time) : alert.forecastHour.toISOString().split('T')[0];
    const key = `${localDate}:${alert.timeWindow}`;
    const existing = grouped.get(key);
    if (!existing || alert.effectiveScore > existing.effectiveScore) {
      grouped.set(key, alert);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => b.effectiveScore - a.effectiveScore);
}
