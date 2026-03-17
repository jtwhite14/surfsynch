import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSpots, surfSessions, spotForecasts, conditionProfiles } from "@/lib/db";
import { eq, and, gte } from "drizzle-orm";
import { fetchMarineForecast } from "@/lib/api/open-meteo";
import { fetchTideTimeline } from "@/lib/api/noaa-tides";
import {
  generateAlerts,
  parseSessionConditions,
  parseForecastConditions,
  computeSimilarity,
  checkExclusionVeto,
  getForecastConfidence,
  getRatingBoost,
  isDaylightHour,
  isWithinSeasonalWindow,
  type SessionForMatching,
  type ForecastHour,
} from "@/lib/matching/condition-matcher";
import { buildProfileForMatching, getReinforcementConfidence, isProfileActiveForMonth } from "@/lib/matching/profile-utils";
import { calculateDirectionAttenuation } from "@/lib/wave-energy";
import { ConditionWeights, DEFAULT_CONDITION_WEIGHTS, HourlyForecast, MarineConditions, MatchDetails, TimeWindow, ProfileForMatching } from "@/types";

const FORECAST_CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

interface DayScore {
  date: string; // YYYY-MM-DD
  label: string;
  windows: WindowScore[];
}

interface WindowScore {
  window: TimeWindow;
  bestScore: number;
  matchScore: number;
  forecastConfidence: number;
  ratingBoost: number;
  matchedSessionRating: number | null;
  matchDetails: MatchDetails | null;
  forecastSnapshot: MarineConditions | null;
  blocked: "exposure" | "coverage" | null;
}

/**
 * GET: Return best match scores per time-window per day for the next 5 days.
 * This gives users visibility into why alerts are or aren't firing.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const spot = await db.query.surfSpots.findFirst({
      where: and(eq(surfSpots.id, id), eq(surfSpots.userId, userId)),
      with: {
        surfSessions: {
          where: gte(surfSessions.rating, 3),
          with: {
            conditions: true,
            photos: {
              limit: 1,
              orderBy: (photos, { asc }) => [asc(photos.sortOrder)],
            },
          },
        },
      },
    });

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    const sessionsWithConditions = spot.surfSessions.filter(s => s.conditions && !s.ignored);
    const ignoredCount = spot.surfSessions.filter(s => s.ignored).length;

    // Load active profiles
    const activeProfiles = await db.query.conditionProfiles.findMany({
      where: and(
        eq(conditionProfiles.spotId, id),
        eq(conditionProfiles.isActive, true)
      ),
    });

    if (sessionsWithConditions.length === 0 && activeProfiles.length === 0) {
      return NextResponse.json({
        days: [],
        sessionCount: 0,
        ignoredCount,
        threshold: 70,
        message: "No rated sessions or profiles with conditions data",
      });
    }

    // Use cached forecast or fetch fresh
    const lat = parseFloat(spot.latitude);
    const lng = parseFloat(spot.longitude);
    const forecast = await getOrFetchForecast(id, lat, lng);

    if (!forecast || forecast.hourly.length === 0) {
      return NextResponse.json({
        days: [],
        sessionCount: sessionsWithConditions.length,
        ignoredCount,
        threshold: 70,
        message: "No forecast data available",
      });
    }

    const weights: ConditionWeights = (spot.conditionWeights as ConditionWeights) ?? DEFAULT_CONDITION_WEIGHTS;
    const now = new Date();
    const nowLocalMs = now.getTime() + forecast.utcOffsetSeconds * 1000;
    const swellExposure = weights.swellExposure;

    // Filter sessions by seasonal window
    let filteredSessions = sessionsWithConditions.filter(s =>
      isWithinSeasonalWindow(s.date, now, 60)
    );
    if (filteredSessions.length === 0) {
      filteredSessions = sessionsWithConditions.filter(s =>
        isWithinSeasonalWindow(s.date, now, 90)
      );
    }
    if (filteredSessions.length === 0) {
      filteredSessions = sessionsWithConditions;
    }

    const sessionsForMatching: SessionForMatching[] = filteredSessions.map(s => ({
      id: s.id,
      date: s.date,
      rating: s.rating,
      notes: s.notes,
      photoUrl: s.photos?.[0]?.photoUrl || s.photoUrl,
      conditions: parseSessionConditions(s.conditions!),
    }));

    // Build profiles for matching (filter by active months)
    const currentMonth = new Date(nowLocalMs).getMonth() + 1;
    const profilesForMatching: ProfileForMatching[] = activeProfiles
      .filter(p => isProfileActiveForMonth(p.activeMonths as number[] | null, currentMonth))
      .map(p => buildProfileForMatching(p));

    const forecastHours: ForecastHour[] = forecast.hourly.map(fh => ({
      time: fh.time,
      timestamp: new Date(fh.timestamp),
      conditions: parseForecastConditions(fh),
      fullConditions: fh as MarineConditions,
    }));

    // Score every daylight forecast hour against all sessions AND profiles
    // Group by date + time window, keeping the best score
    const dayWindowMap = new Map<string, WindowScore>();

    for (const fh of forecastHours) {
      const localHour = getLocalHourFromTimeString(fh.time);
      if (!isDaylightHour(localHour)) continue;

      // Skip past hours
      if (fh.timestamp.getTime() + 3600000 <= nowLocalMs) continue;

      const localDate = fh.time.slice(0, 10);
      const timeWindow = getTimeWindow(localHour);
      const key = `${localDate}:${timeWindow}`;

      // Check exposure
      const swellDir = fh.conditions.swellDirection;
      const attenuation = calculateDirectionAttenuation(swellDir, swellExposure);

      if (attenuation < 0.25) {
        if (!dayWindowMap.has(key)) {
          dayWindowMap.set(key, {
            window: timeWindow,
            bestScore: 0,
            matchScore: 0,
            forecastConfidence: 0,
            ratingBoost: 0,
            matchedSessionRating: null,
            matchDetails: null,
            forecastSnapshot: fh.fullConditions,
            blocked: "exposure",
          });
        }
        continue;
      }

      const daysOut = (fh.timestamp.getTime() - nowLocalMs) / (1000 * 60 * 60 * 24);
      const forecastConfidence = getForecastConfidence(daysOut);

      // Score against sessions
      for (const sess of sessionsForMatching) {
        const { score, details, coverage } = computeSimilarity(
          fh.conditions,
          sess.conditions,
          weights
        );

        if (coverage < 0.5) {
          const existing = dayWindowMap.get(key);
          if (!existing) {
            dayWindowMap.set(key, {
              window: timeWindow,
              bestScore: 0,
              matchScore: 0,
              forecastConfidence,
              ratingBoost: 0,
              matchedSessionRating: null,
              matchDetails: null,
              forecastSnapshot: fh.fullConditions,
              blocked: "coverage",
            });
          }
          continue;
        }

        const ratingBoost = getRatingBoost(sess.rating);
        const exposurePenalty = attenuation < 1.0 ? Math.sqrt(attenuation) : 1.0;
        const effectiveScore = score * forecastConfidence * ratingBoost * exposurePenalty;

        details.ratingBoost = ratingBoost;
        details.forecastConfidence = forecastConfidence;

        const existing = dayWindowMap.get(key);
        if (!existing || effectiveScore > existing.bestScore) {
          dayWindowMap.set(key, {
            window: timeWindow,
            bestScore: effectiveScore,
            matchScore: score,
            forecastConfidence,
            ratingBoost,
            matchedSessionRating: sess.rating,
            matchDetails: details,
            forecastSnapshot: fh.fullConditions,
            blocked: null,
          });
        }
      }

      // Score against profiles
      for (const profile of profilesForMatching) {
        // Exclusion zone hard veto
        if (checkExclusionVeto(fh.conditions, profile.exclusions)) continue;

        const { score, details, coverage } = computeSimilarity(
          fh.conditions,
          profile.conditions,
          profile.weights,
          profile.specifiedVars,
          profile.selections
        );

        if (coverage < 0.5) continue;

        const reinforcementConfidence = getReinforcementConfidence(profile.reinforcementCount);
        const exposurePenalty = attenuation < 1.0 ? Math.sqrt(attenuation) : 1.0;
        const effectiveScore = score * forecastConfidence * reinforcementConfidence * exposurePenalty;

        details.ratingBoost = reinforcementConfidence;
        details.forecastConfidence = forecastConfidence;

        const existing = dayWindowMap.get(key);
        if (!existing || effectiveScore > existing.bestScore) {
          dayWindowMap.set(key, {
            window: timeWindow,
            bestScore: effectiveScore,
            matchScore: score,
            forecastConfidence,
            ratingBoost: reinforcementConfidence,
            matchedSessionRating: null,
            matchDetails: details,
            forecastSnapshot: fh.fullConditions,
            blocked: null,
          });
        }
      }
    }

    // Group by date, limit to 5 days
    const dateMap = new Map<string, WindowScore[]>();
    for (const [key, windowScore] of dayWindowMap) {
      const date = key.split(":")[0];
      if (!dateMap.has(date)) dateMap.set(date, []);
      dateMap.get(date)!.push(windowScore);
    }

    const sortedDates = [...dateMap.keys()].sort().slice(0, 5);
    const today = new Date(now.getTime() + forecast.utcOffsetSeconds * 1000);
    const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;

    const days: DayScore[] = sortedDates.map(date => {
      const windows = dateMap.get(date)!;
      // Sort: dawn, midday, afternoon
      const order: Record<string, number> = { dawn: 0, midday: 1, afternoon: 2 };
      windows.sort((a, b) => (order[a.window] ?? 3) - (order[b.window] ?? 3));

      return {
        date,
        label: getDayLabel(date, todayStr),
        windows,
      };
    });

    return NextResponse.json({
      days,
      sessionCount: sessionsWithConditions.length,
      seasonalSessionCount: filteredSessions.length,
      profileCount: profilesForMatching.length,
      ignoredCount,
      threshold: 70,
    });
  } catch (error) {
    console.error("Error computing forecast scores:", error);
    return NextResponse.json(
      { error: "Failed to compute forecast scores" },
      { status: 500 }
    );
  }
}

function getLocalHourFromTimeString(timeStr: string): number {
  const match = timeStr.match(/T(\d{2}):/);
  return match ? parseInt(match[1], 10) : new Date(timeStr).getUTCHours();
}

function getTimeWindow(hour: number): TimeWindow {
  if (hour >= 5 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 14) return "midday";
  return "afternoon";
}

function getDayLabel(dateStr: string, todayStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(ty, tm - 1, td);
  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  const date = new Date(target);
  return date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

async function getOrFetchForecast(
  spotId: string,
  latitude: number,
  longitude: number
): Promise<{ hourly: HourlyForecast[]; utcOffsetSeconds: number } | null> {
  const cached = await db.query.spotForecasts.findFirst({
    where: eq(spotForecasts.spotId, spotId),
  });

  if (cached && (Date.now() - cached.fetchedAt.getTime()) < FORECAST_CACHE_TTL) {
    const data = cached.forecastData as { hourly?: HourlyForecast[]; utcOffsetSeconds?: number };
    if (!data.hourly) return null;
    return { hourly: data.hourly, utcOffsetSeconds: data.utcOffsetSeconds ?? 0 };
  }

  try {
    const forecast = await fetchMarineForecast(latitude, longitude);

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 16);
    const tideData = await fetchTideTimeline(latitude, longitude, startDate, endDate);

    if (tideData) {
      const tideByHour = new Map<string, number>();
      for (const t of tideData) {
        const d = new Date(t.time);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`;
        tideByHour.set(key, t.height);
      }
      for (const hour of forecast.hourly) {
        if (hour.tideHeight === null) {
          hour.tideHeight = tideByHour.get(hour.time) ?? null;
        }
      }
    }

    await db.insert(spotForecasts).values({
      spotId,
      forecastData: forecast,
      fetchedAt: new Date(),
    }).onConflictDoUpdate({
      target: [spotForecasts.spotId],
      set: { forecastData: forecast, fetchedAt: new Date() },
    });

    return { hourly: forecast.hourly, utcOffsetSeconds: forecast.utcOffsetSeconds };
  } catch (error) {
    console.error(`Error fetching forecast for spot ${spotId}:`, error);
    if (cached) {
      const data = cached.forecastData as { hourly?: HourlyForecast[]; utcOffsetSeconds?: number };
      if (!data.hourly) return null;
      return { hourly: data.hourly, utcOffsetSeconds: data.utcOffsetSeconds ?? 0 };
    }
    return null;
  }
}
