import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, surfSpots, surfSessions, sessionConditions, spotForecasts, spotAlerts } from "@/lib/db";
import { eq, and, gte, inArray } from "drizzle-orm";
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

    const sessionsWithConditions = spot.surfSessions.filter(s => s.conditions);
    if (sessionsWithConditions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No rated sessions with conditions data",
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
    const cachedForecast = await db.query.spotForecasts.findFirst({
      where: eq(spotForecasts.spotId, id),
    });

    if (cachedForecast) {
      await db.update(spotForecasts)
        .set({ forecastData: forecast, fetchedAt: new Date() })
        .where(eq(spotForecasts.id, cachedForecast.id));
    } else {
      await db.insert(spotForecasts).values({
        spotId: id,
        forecastData: forecast,
      }).onConflictDoUpdate({
        target: [spotForecasts.spotId],
        set: { forecastData: forecast, fetchedAt: new Date() },
      });
    }

    // Parse sessions
    const sessionsForMatching: SessionForMatching[] = sessionsWithConditions.map(s => ({
      id: s.id,
      date: s.date,
      rating: s.rating,
      notes: s.notes,
      photoUrl: s.photos?.[0]?.photoUrl || s.photoUrl,
      conditions: parseSessionConditions(s.conditions!),
    }));

    // Parse forecast hours
    const forecastHours: ForecastHour[] = forecast.hourly.map(fh => ({
      time: fh.time,
      timestamp: fh.timestamp,
      conditions: parseForecastConditions(fh),
      fullConditions: fh as MarineConditions,
    }));

    const weights: ConditionWeights = (spot.conditionWeights as ConditionWeights) ?? DEFAULT_CONDITION_WEIGHTS;
    const alerts = generateAlerts(forecastHours, sessionsForMatching, weights, 50, new Date(), forecast.utcOffsetSeconds, weights.swellExposure);

    // Expire old alerts
    const existing = await db.query.spotAlerts.findMany({
      where: and(eq(spotAlerts.spotId, id), eq(spotAlerts.status, "active")),
    });
    if (existing.length > 0) {
      await db.update(spotAlerts)
        .set({ status: "expired", updatedAt: new Date() })
        .where(inArray(spotAlerts.id, existing.map(a => a.id)));
    }

    // Insert new alerts
    for (const alert of alerts) {
      await db.insert(spotAlerts).values({
        spotId: id,
        userId: session.user.id,
        forecastHour: alert.forecastHour,
        timeWindow: alert.timeWindow,
        matchScore: alert.matchScore.toFixed(2),
        confidenceScore: alert.confidenceScore.toFixed(2),
        effectiveScore: alert.effectiveScore.toFixed(2),
        matchedSessionId: alert.matchedSession.id,
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
          matchedSessionId: alert.matchedSession.id,
          matchDetails: alert.matchDetails,
          forecastSnapshot: alert.forecastSnapshot,
          status: "active",
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      sessionsAnalyzed: sessionsForMatching.length,
      forecastHoursScored: forecastHours.length,
      alertsGenerated: alerts.length,
      alerts: alerts.map(a => ({
        forecastHour: a.forecastHour,
        timeWindow: a.timeWindow,
        effectiveScore: Math.round(a.effectiveScore),
        matchScore: Math.round(a.matchScore),
        matchedSessionDate: a.matchedSession.date,
        matchedSessionRating: a.matchedSession.rating,
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
