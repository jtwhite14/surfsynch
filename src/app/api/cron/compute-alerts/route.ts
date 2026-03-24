import { NextRequest, NextResponse } from "next/server";
import { db, surfSpots, surfSessions, sessionConditions, spotForecasts, spotAlerts, users, conditionProfiles } from "@/lib/db";
import { eq, gte, and, inArray, isNull, sql } from "drizzle-orm";
import { sendAlertSMS } from "@/lib/sms/send-alert-sms";
import { haversineDistance, getDistancePenalty, getRarityBoost } from "@/lib/utils/geo";
import { fetchMarineForecast } from "@/lib/api/open-meteo";
import { fetchTideTimeline, warmStationCache } from "@/lib/api/noaa-tides";
import {
  generateAlerts,
  generateProfileAlerts,
  parseSessionConditions,
  parseForecastConditions,
  type SessionForMatching,
  type ForecastHour,
  type ComputedProfileAlert,
} from "@/lib/matching/condition-matcher";
import { buildProfileForMatching, isProfileActiveForMonth } from "@/lib/matching/profile-utils";
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

  const cronStart = Date.now();

  try {
    // Pre-warm the NOAA station cache (2.6MB) before processing spots,
    // so it doesn't compete for bandwidth with Open-Meteo forecast fetches
    await warmStationCache();

    // Get all spots with rated sessions (skip silenced spots)
    const allSpots = await db.query.surfSpots.findMany({
      where: eq(surfSpots.alertsSilenced, false),
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

    // Process spots in batches of 3 — each spot makes multiple Open-Meteo
    // calls, and batches of 5 caused ConnectTimeoutError on the free tier
    const BATCH_SIZE = 3;
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

    // --- SMS notifications ---
    let smsSent = 0;
    try {
      const elapsed = Date.now() - cronStart;
      // Skip SMS if cron has been running >4 minutes (safety margin for 5min timeout)
      if (elapsed < 4 * 60 * 1000) {
        smsSent = await sendPendingSMSAlerts();
      } else {
        console.log("[sms] Skipping SMS — cron nearing timeout");
      }
    } catch (error) {
      console.error("[sms] SMS block failed (non-fatal):", error);
    }

    return NextResponse.json({
      success: true,
      spotsProcessed: allSpots.length,
      alertsGenerated: totalAlerts,
      smsSent,
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
    ignored: boolean;
    photos?: Array<{ photoUrl: string }>;
    conditions: {
      primarySwellHeight: string | null;
      primarySwellPeriod: string | null;
      primarySwellDirection: string | null;
      windSpeed: string | null;
      windDirection: string | null;
      tideHeight: string | null;
      waveEnergy: string | null;
    } | null;
  }>;
}): Promise<number> {
  const sessionsWithConditions = spot.surfSessions.filter(s => s.conditions && !s.ignored);

  // Load active profiles for this spot
  const activeProfiles = await db.query.conditionProfiles.findMany({
    where: and(
      eq(conditionProfiles.spotId, spot.id),
      eq(conditionProfiles.isActive, true)
    ),
  });

  // Need either sessions or profiles to generate alerts
  if (sessionsWithConditions.length === 0 && activeProfiles.length === 0) {
    console.log(`[alerts] Spot "${spot.id}": skipped — no sessions or profiles`);
    return 0;
  }

  // Fetch or use cached forecast
  const forecastResult = await getOrFetchForecast(
    spot.id,
    parseFloat(spot.latitude),
    parseFloat(spot.longitude)
  );
  if (!forecastResult || forecastResult.hourly.length === 0) {
    console.log(`[alerts] Spot "${spot.id}": skipped — no forecast data`);
    return 0;
  }
  const { hourly: forecast, utcOffsetSeconds } = forecastResult;

  // Parse forecast hours
  const forecastHours: ForecastHour[] = forecast.map(fh => ({
    time: fh.time,
    timestamp: new Date(fh.timestamp),
    conditions: parseForecastConditions(fh),
    fullConditions: fh as MarineConditions,
  }));

  const weights: ConditionWeights = (spot.conditionWeights as ConditionWeights) ?? DEFAULT_CONDITION_WEIGHTS;
  const now = new Date();

  // --- Session-based alerts ---
  let sessionAlerts: ReturnType<typeof generateAlerts> = [];
  if (sessionsWithConditions.length > 0) {
    const sessionsForMatching: SessionForMatching[] = sessionsWithConditions.map(s => ({
      id: s.id,
      date: s.date,
      rating: s.rating,
      notes: s.notes,
      photoUrl: s.photos?.[0]?.photoUrl || s.photoUrl,
      conditions: parseSessionConditions(s.conditions!),
    }));

    console.log(`[alerts] Spot "${spot.id}": ${sessionsWithConditions.length} sessions (ratings: ${sessionsWithConditions.map(s => s.rating).join(',')}), ${forecastHours.length} forecast hours, utcOffset=${utcOffsetSeconds}`);
    sessionAlerts = generateAlerts(forecastHours, sessionsForMatching, weights, 70, now, utcOffsetSeconds, weights.swellExposure);
  }

  // --- Profile-based alerts ---
  let profileAlerts: ComputedProfileAlert[] = [];
  if (activeProfiles.length > 0) {
    // Filter profiles by active months
    const currentMonth = new Date(now.getTime() + utcOffsetSeconds * 1000).getMonth() + 1;
    const monthFilteredProfiles = activeProfiles.filter(p =>
      isProfileActiveForMonth(p.activeMonths as number[] | null, currentMonth)
    );

    if (monthFilteredProfiles.length > 0) {
      const profilesForMatching = monthFilteredProfiles.map(p => buildProfileForMatching(p));
      console.log(`[alerts] Spot "${spot.id}": ${profilesForMatching.length} active profiles`);
      profileAlerts = generateProfileAlerts(forecastHours, profilesForMatching, weights, 70, now, utcOffsetSeconds, weights.swellExposure);
    }
  }

  // --- Merge: keep the best score per (forecastHour, timeWindow) key ---
  type MergedAlert = {
    forecastHour: Date;
    timeWindow: string;
    matchScore: number;
    confidenceScore: number;
    effectiveScore: number;
    matchedSessionId: string | null;
    matchedProfileId: string | null;
    matchDetails: unknown;
    forecastSnapshot: unknown;
  };

  const mergedMap = new Map<string, MergedAlert>();

  for (const alert of sessionAlerts) {
    const key = `${alert.forecastHour.toISOString()}:${alert.timeWindow}`;
    const existing = mergedMap.get(key);
    if (!existing || alert.effectiveScore > existing.effectiveScore) {
      mergedMap.set(key, {
        forecastHour: alert.forecastHour,
        timeWindow: alert.timeWindow,
        matchScore: alert.matchScore,
        confidenceScore: alert.confidenceScore,
        effectiveScore: alert.effectiveScore,
        matchedSessionId: alert.matchedSession.id,
        matchedProfileId: null,
        matchDetails: alert.matchDetails,
        forecastSnapshot: alert.forecastSnapshot,
      });
    }
  }

  for (const alert of profileAlerts) {
    const key = `${alert.forecastHour.toISOString()}:${alert.timeWindow}`;
    const existing = mergedMap.get(key);
    if (!existing || alert.effectiveScore > existing.effectiveScore) {
      mergedMap.set(key, {
        forecastHour: alert.forecastHour,
        timeWindow: alert.timeWindow,
        matchScore: alert.matchScore,
        confidenceScore: alert.confidenceScore,
        effectiveScore: alert.effectiveScore,
        matchedSessionId: null,
        matchedProfileId: alert.matchedProfile.id,
        matchDetails: alert.matchDetails,
        forecastSnapshot: alert.forecastSnapshot,
      });
    }
  }

  const mergedAlerts = Array.from(mergedMap.values());
  const totalCount = mergedAlerts.length;

  if (totalCount > 0) {
    const topScore = Math.max(...mergedAlerts.map(a => a.effectiveScore));
    console.log(`[alerts] Spot "${spot.id}": generated ${totalCount} alerts (${sessionAlerts.length} session, ${profileAlerts.length} profile), top score=${topScore.toFixed(1)}`);
  } else {
    console.log(`[alerts] Spot "${spot.id}": 0 alerts`);
  }

  // Expire old alerts that are no longer relevant
  const existingAlerts = await db.query.spotAlerts.findMany({
    where: and(eq(spotAlerts.spotId, spot.id), eq(spotAlerts.status, "active")),
  });

  const newKeys = new Set(mergedAlerts.map(a =>
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

  // Batch upsert all merged alerts
  if (mergedAlerts.length > 0) {
    const values = mergedAlerts.map(alert => ({
      spotId: spot.id,
      userId: spot.userId,
      forecastHour: alert.forecastHour,
      timeWindow: alert.timeWindow,
      matchScore: alert.matchScore.toFixed(2),
      confidenceScore: alert.confidenceScore.toFixed(2),
      effectiveScore: alert.effectiveScore.toFixed(2),
      matchedSessionId: alert.matchedSessionId,
      matchedProfileId: alert.matchedProfileId,
      matchDetails: alert.matchDetails,
      forecastSnapshot: alert.forecastSnapshot,
      status: "active" as const,
      expiresAt: alert.forecastHour,
    }));

    await db.insert(spotAlerts).values(values).onConflictDoUpdate({
      target: [spotAlerts.spotId, spotAlerts.userId, spotAlerts.forecastHour, spotAlerts.timeWindow],
      set: {
        matchScore: sql`excluded.match_score`,
        confidenceScore: sql`excluded.confidence_score`,
        effectiveScore: sql`excluded.effective_score`,
        matchedSessionId: sql`excluded.matched_session_id`,
        matchedProfileId: sql`excluded.matched_profile_id`,
        matchDetails: sql`excluded.match_details`,
        forecastSnapshot: sql`excluded.forecast_snapshot`,
        status: sql`excluded.status`,
        updatedAt: new Date(),
      },
    });
  }

  return totalCount;
}

/**
 * Get forecast from cache or fetch fresh. Always uses onConflictDoUpdate
 * to avoid TOCTOU races.
 */
async function getOrFetchForecast(
  spotId: string,
  latitude: number,
  longitude: number
): Promise<{ hourly: HourlyForecast[]; utcOffsetSeconds: number } | null> {
  // Check cache
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

/**
 * Send SMS for unsent active alerts whose forecast hour is still in the future.
 * Groups alerts by user, sends one text per user, then marks them as sent.
 */
async function sendPendingSMSAlerts(): Promise<number> {
  const now = new Date();

  // Get unsent, active, future alerts with spot names, locations, and profile rarity data
  const pendingAlerts = await db
    .select({
      alertId: spotAlerts.id,
      userId: spotAlerts.userId,
      spotName: surfSpots.name,
      spotLatitude: surfSpots.latitude,
      spotLongitude: surfSpots.longitude,
      timeWindow: spotAlerts.timeWindow,
      forecastHour: spotAlerts.forecastHour,
      effectiveScore: spotAlerts.effectiveScore,
      profileConsistency: conditionProfiles.consistency,
      profileQualityCeiling: conditionProfiles.qualityCeiling,
    })
    .from(spotAlerts)
    .innerJoin(surfSpots, eq(spotAlerts.spotId, surfSpots.id))
    .leftJoin(conditionProfiles, eq(spotAlerts.matchedProfileId, conditionProfiles.id))
    .where(
      and(
        eq(spotAlerts.status, "active"),
        eq(surfSpots.alertsSilenced, false),
        isNull(spotAlerts.smsSentAt),
        gte(spotAlerts.forecastHour, now)
      )
    );

  if (pendingAlerts.length === 0) return 0;

  // Group by user
  const byUser = new Map<string, typeof pendingAlerts>();
  for (const alert of pendingAlerts) {
    const existing = byUser.get(alert.userId) || [];
    existing.push(alert);
    byUser.set(alert.userId, existing);
  }

  let totalSent = 0;

  for (const [userId, userAlerts] of byUser) {
    // Fetch user's phone, smsEnabled, and home location
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { phoneNumber: true, smsEnabled: true, homeLatitude: true, homeLongitude: true },
    });

    if (!user?.smsEnabled || !user.phoneNumber) continue;

    const homeLat = user.homeLatitude ? parseFloat(user.homeLatitude) : null;
    const homeLng = user.homeLongitude ? parseFloat(user.homeLongitude) : null;

    // Sort by distance + rarity adjusted score
    const sorted = userAlerts.sort((a, b) => {
      const scoreA = parseFloat(a.effectiveScore);
      const scoreB = parseFloat(b.effectiveScore);
      const rarityA = a.profileConsistency
        ? getRarityBoost(a.profileConsistency as 'low' | 'medium' | 'high', a.profileQualityCeiling ?? 3)
        : 1.0;
      const rarityB = b.profileConsistency
        ? getRarityBoost(b.profileConsistency as 'low' | 'medium' | 'high', b.profileQualityCeiling ?? 3)
        : 1.0;
      if (homeLat != null && homeLng != null) {
        const distA = haversineDistance(homeLat, homeLng, parseFloat(a.spotLatitude), parseFloat(a.spotLongitude));
        const distB = haversineDistance(homeLat, homeLng, parseFloat(b.spotLatitude), parseFloat(b.spotLongitude));
        return (scoreB * getDistancePenalty(distB) * rarityB) - (scoreA * getDistancePenalty(distA) * rarityA);
      }
      return (scoreB * rarityB) - (scoreA * rarityA);
    });

    const success = await sendAlertSMS(
      user.phoneNumber,
      sorted.map((a) => ({
        spotName: a.spotName,
        timeWindow: a.timeWindow,
        forecastHour: a.forecastHour,
        effectiveScore: parseFloat(a.effectiveScore),
      }))
    );

    if (success) {
      const alertIds = userAlerts.map((a) => a.alertId);
      await db
        .update(spotAlerts)
        .set({ smsSentAt: now })
        .where(inArray(spotAlerts.id, alertIds));
      totalSent += alertIds.length;
    }
  }

  if (totalSent > 0) {
    console.log(`[sms] Marked ${totalSent} alerts as sent`);
  }

  return totalSent;
}
