import { NextRequest, NextResponse } from "next/server";
import { db, surfSpots, surfSessions, sessionConditions, spotForecasts, spotAlerts } from "@/lib/db";
import { eq, gte, and, inArray } from "drizzle-orm";
import { fetchMarineForecast } from "@/lib/api/open-meteo";
import { fetchTideTimeline } from "@/lib/api/noaa-tides";
import {
  generateAlerts,
  parseSessionConditions,
  parseForecastConditions,
  type SessionForMatching,
  type ForecastHour,
} from "@/lib/matching/condition-matcher";
import { ConditionWeights, DEFAULT_CONDITION_WEIGHTS, HourlyForecast, MarineConditions } from "@/types";

export const maxDuration = 300; // 5 minutes for cron processing

const FORECAST_CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

/**
 * Cron job: compute alerts for all spots.
 * Runs every 6 hours via Vercel Cron.
 */
export async function GET(request: NextRequest) {
  // Fail closed: require CRON_SECRET to be set and match
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all spots with rated sessions
    const allSpots = await db.query.surfSpots.findMany({
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

    let totalAlerts = 0;

    // Process spots in batches of 5 for bounded concurrency
    const BATCH_SIZE = 5;
    for (let i = 0; i < allSpots.length; i += BATCH_SIZE) {
      const batch = allSpots.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(spot => processSpot(spot))
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalAlerts += result.value;
        }
      }
    }

    return NextResponse.json({
      success: true,
      spotsProcessed: allSpots.length,
      alertsGenerated: totalAlerts,
    });
  } catch (error) {
    console.error("Error computing alerts:", error);
    return NextResponse.json(
      { error: "Failed to compute alerts" },
      { status: 500 }
    );
  }
}

/**
 * Process a single spot: fetch forecast, compute matches, upsert alerts.
 */
async function processSpot(spot: {
  id: string;
  userId: string;
  latitude: string;
  longitude: string;
  conditionWeights: unknown;
  surfSessions: Array<{
    id: string;
    date: Date;
    rating: number;
    notes: string | null;
    photoUrl: string | null;
    photos?: Array<{ photoUrl: string }>;
    conditions: {
      primarySwellHeight: string | null;
      primarySwellPeriod: string | null;
      primarySwellDirection: string | null;
      windSpeed: string | null;
      windDirection: string | null;
      tideHeight: string | null;
    } | null;
  }>;
}): Promise<number> {
  const sessionsWithConditions = spot.surfSessions.filter(s => s.conditions);
  if (sessionsWithConditions.length === 0) return 0;

  // Fetch or use cached forecast
  const forecast = await getOrFetchForecast(
    spot.id,
    parseFloat(spot.latitude),
    parseFloat(spot.longitude)
  );
  if (!forecast || forecast.length === 0) return 0;

  // Parse sessions for matching
  const sessionsForMatching: SessionForMatching[] = sessionsWithConditions.map(s => ({
    id: s.id,
    date: s.date,
    rating: s.rating,
    notes: s.notes,
    photoUrl: s.photos?.[0]?.photoUrl || s.photoUrl,
    conditions: parseSessionConditions(s.conditions!),
  }));

  // Parse forecast hours
  const forecastHours: ForecastHour[] = forecast.map(fh => ({
    time: fh.time,
    timestamp: fh.timestamp,
    conditions: parseForecastConditions(fh),
    fullConditions: fh as MarineConditions,
  }));

  const weights: ConditionWeights = (spot.conditionWeights as ConditionWeights) ?? DEFAULT_CONDITION_WEIGHTS;
  const alerts = generateAlerts(forecastHours, sessionsForMatching, weights);

  // Expire old alerts that are no longer relevant
  const existingAlerts = await db.query.spotAlerts.findMany({
    where: and(eq(spotAlerts.spotId, spot.id), eq(spotAlerts.status, "active")),
  });

  // Use full timestamp for dedup key (matches the unique index)
  const newKeys = new Set(alerts.map(a =>
    `${a.forecastHour.toISOString()}:${a.timeWindow}`
  ));

  const toExpire = existingAlerts.filter(a => {
    const key = `${a.forecastHour.toISOString()}:${a.timeWindow}`;
    return !newKeys.has(key) || a.forecastHour < new Date();
  });

  if (toExpire.length > 0) {
    await db.update(spotAlerts)
      .set({ status: "expired", updatedAt: new Date() })
      .where(inArray(spotAlerts.id, toExpire.map(a => a.id)));
  }

  // Batch upsert all alerts
  if (alerts.length > 0) {
    const values = alerts.map(alert => ({
      spotId: spot.id,
      userId: spot.userId,
      forecastHour: alert.forecastHour,
      timeWindow: alert.timeWindow,
      matchScore: alert.matchScore.toFixed(2),
      confidenceScore: alert.confidenceScore.toFixed(2),
      effectiveScore: alert.effectiveScore.toFixed(2),
      matchedSessionId: alert.matchedSession.id,
      matchDetails: alert.matchDetails,
      forecastSnapshot: alert.forecastSnapshot,
      status: "active" as const,
      expiresAt: alert.forecastHour,
    }));

    await db.insert(spotAlerts).values(values).onConflictDoUpdate({
      target: [spotAlerts.spotId, spotAlerts.userId, spotAlerts.forecastHour, spotAlerts.timeWindow],
      set: {
        matchScore: values[0].matchScore, // placeholder — Drizzle uses excluded row
        confidenceScore: values[0].confidenceScore,
        effectiveScore: values[0].effectiveScore,
        matchedSessionId: values[0].matchedSessionId,
        matchDetails: values[0].matchDetails,
        forecastSnapshot: values[0].forecastSnapshot,
        status: "active",
        updatedAt: new Date(),
      },
    });
  }

  return alerts.length;
}

/**
 * Get forecast from cache or fetch fresh. Always uses onConflictDoUpdate
 * to avoid TOCTOU races.
 */
async function getOrFetchForecast(
  spotId: string,
  latitude: number,
  longitude: number
): Promise<HourlyForecast[] | null> {
  // Check cache
  const cached = await db.query.spotForecasts.findFirst({
    where: eq(spotForecasts.spotId, spotId),
  });

  if (cached && (Date.now() - cached.fetchedAt.getTime()) < FORECAST_CACHE_TTL) {
    const data = cached.forecastData as { hourly?: HourlyForecast[] };
    return data.hourly ?? null;
  }

  try {
    const forecast = await fetchMarineForecast(latitude, longitude);

    // Merge tide data
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

    // Always upsert — avoids TOCTOU race
    await db.insert(spotForecasts).values({
      spotId,
      forecastData: forecast,
      fetchedAt: new Date(),
    }).onConflictDoUpdate({
      target: [spotForecasts.spotId],
      set: {
        forecastData: forecast,
        fetchedAt: new Date(),
      },
    });

    return forecast.hourly;
  } catch (error) {
    console.error(`Error fetching forecast for spot ${spotId}:`, error);
    if (cached) {
      const data = cached.forecastData as { hourly?: HourlyForecast[] };
      return data.hourly ?? null;
    }
    return null;
  }
}
