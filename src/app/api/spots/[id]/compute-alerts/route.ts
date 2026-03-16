import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, surfSpots, surfSessions, sessionConditions, spotForecasts, spotAlerts, conditionProfiles } from "@/lib/db";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { fetchMarineForecast } from "@/lib/api/open-meteo";
import { fetchTideTimeline } from "@/lib/api/noaa-tides";
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

/**
 * POST: Manually trigger alert computation for a single spot.
 * Useful for testing and for on-demand refresh.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get spot with sessions
    const spot = await db.query.surfSpots.findFirst({
      where: and(eq(surfSpots.id, id), eq(surfSpots.userId, session.user.id)),
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

    // Load active profiles
    const activeProfiles = await db.query.conditionProfiles.findMany({
      where: and(
        eq(conditionProfiles.spotId, id),
        eq(conditionProfiles.isActive, true)
      ),
    });

    if (sessionsWithConditions.length === 0 && activeProfiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No rated sessions or profiles with conditions data",
        alertsGenerated: 0,
      });
    }

    // Fetch fresh forecast
    const lat = parseFloat(spot.latitude);
    const lng = parseFloat(spot.longitude);
    const forecast = await fetchMarineForecast(lat, lng);

    // Merge tide data
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 16);
    const tideData = await fetchTideTimeline(lat, lng, startDate, endDate);

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

    // Cache forecast
    await db.insert(spotForecasts).values({
      spotId: id,
      forecastData: forecast,
      fetchedAt: new Date(),
    }).onConflictDoUpdate({
      target: [spotForecasts.spotId],
      set: { forecastData: forecast, fetchedAt: new Date() },
    });

    // Parse forecast hours
    const forecastHours: ForecastHour[] = forecast.hourly.map(fh => ({
      time: fh.time,
      timestamp: fh.timestamp,
      conditions: parseForecastConditions(fh),
      fullConditions: fh as MarineConditions,
    }));

    const weights: ConditionWeights = (spot.conditionWeights as ConditionWeights) ?? DEFAULT_CONDITION_WEIGHTS;
    const now = new Date();

    // Session-based alerts
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
      sessionAlerts = generateAlerts(forecastHours, sessionsForMatching, weights, 70, now, forecast.utcOffsetSeconds, weights.swellExposure);
    }

    // Profile-based alerts
    let profileAlerts: ComputedProfileAlert[] = [];
    if (activeProfiles.length > 0) {
      const currentMonth = new Date(now.getTime() + forecast.utcOffsetSeconds * 1000).getMonth() + 1;
      const monthFiltered = activeProfiles.filter(p =>
        isProfileActiveForMonth(p.activeMonths as number[] | null, currentMonth)
      );
      if (monthFiltered.length > 0) {
        const profilesForMatching = monthFiltered.map(p => buildProfileForMatching(p));
        profileAlerts = generateProfileAlerts(forecastHours, profilesForMatching, weights, 70, now, forecast.utcOffsetSeconds, weights.swellExposure);
      }
    }

    // Merge: keep best per (forecastHour, timeWindow)
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

    // Expire old alerts
    const existingDbAlerts = await db.query.spotAlerts.findMany({
      where: and(eq(spotAlerts.spotId, id), eq(spotAlerts.status, "active")),
    });
    if (existingDbAlerts.length > 0) {
      await db.update(spotAlerts)
        .set({ status: "expired", updatedAt: new Date() })
        .where(inArray(spotAlerts.id, existingDbAlerts.map(a => a.id)));
    }

    // Insert merged alerts
    for (const alert of mergedAlerts) {
      await db.insert(spotAlerts).values({
        spotId: id,
        userId: session.user.id,
        forecastHour: alert.forecastHour,
        timeWindow: alert.timeWindow,
        matchScore: alert.matchScore.toFixed(2),
        confidenceScore: alert.confidenceScore.toFixed(2),
        effectiveScore: alert.effectiveScore.toFixed(2),
        matchedSessionId: alert.matchedSessionId,
        matchedProfileId: alert.matchedProfileId,
        matchDetails: alert.matchDetails,
        forecastSnapshot: alert.forecastSnapshot,
        status: "active",
        expiresAt: alert.forecastHour,
      }).onConflictDoUpdate({
        target: [spotAlerts.spotId, spotAlerts.userId, spotAlerts.forecastHour, spotAlerts.timeWindow],
        set: {
          matchScore: alert.matchScore.toFixed(2),
          confidenceScore: alert.confidenceScore.toFixed(2),
          effectiveScore: alert.effectiveScore.toFixed(2),
          matchedSessionId: sql`excluded.matched_session_id`,
          matchedProfileId: sql`excluded.matched_profile_id`,
          matchDetails: alert.matchDetails,
          forecastSnapshot: alert.forecastSnapshot,
          status: "active",
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      sessionsAnalyzed: sessionsWithConditions.length,
      profilesAnalyzed: activeProfiles.length,
      forecastHoursScored: forecastHours.length,
      alertsGenerated: mergedAlerts.length,
      alerts: mergedAlerts.map(a => ({
        forecastHour: a.forecastHour,
        timeWindow: a.timeWindow,
        effectiveScore: Math.round(a.effectiveScore),
        matchScore: Math.round(a.matchScore),
        source: a.matchedProfileId ? "profile" : "session",
      })),
    });
  } catch (error) {
    console.error("Error computing alerts:", error);
    return NextResponse.json(
      { error: "Failed to compute alerts" },
      { status: 500 }
    );
  }
}
