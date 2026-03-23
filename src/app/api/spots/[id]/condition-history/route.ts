import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSpots, surfSessions, conditionHistoryCache } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { fetchHistoricalMarineTimeline } from "@/lib/api/open-meteo";
import {
  parseSessionConditions,
  parseForecastConditions,
  computeSimilarity,
} from "@/lib/matching/condition-matcher";
import { ConditionWeights, DEFAULT_CONDITION_WEIGHTS } from "@/types";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * GET: Return daily condition similarity scores for the last 12 months.
 * Compares each day's conditions (around the session's time window) to the session's conditions.
 * Results are cached in the database and recomputed weekly.
 *
 * Query params:
 *   sessionId - the session to compare against
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

    const { id: spotId } = await params;
    const sessionId = request.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    // Fetch spot (for lat/lng and weights)
    const spot = await db.query.surfSpots.findFirst({
      where: and(eq(surfSpots.id, spotId), eq(surfSpots.userId, userId)),
    });

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    // Fetch session with conditions
    const session = await db.query.surfSessions.findFirst({
      where: and(eq(surfSessions.id, sessionId), eq(surfSessions.spotId, spotId)),
      with: { conditions: true },
    });

    if (!session?.conditions) {
      return NextResponse.json({ error: "Session conditions not found" }, { status: 404 });
    }

    // Check cache
    const cached = await db.query.conditionHistoryCache.findFirst({
      where: and(
        eq(conditionHistoryCache.spotId, spotId),
        eq(conditionHistoryCache.sessionId, sessionId)
      ),
    });

    if (cached && Date.now() - cached.computedAt.getTime() < CACHE_TTL_MS) {
      return NextResponse.json({
        scores: cached.scores,
        sessionDate: session.date,
        cached: true,
      });
    }

    // Compute fresh scores
    const sessionParsed = parseSessionConditions(session.conditions);
    const weights: ConditionWeights = (spot.conditionWeights as ConditionWeights) || DEFAULT_CONDITION_WEIGHTS;

    // Determine session time window (hours to compare against each day)
    const sessionStartHour = new Date(session.startTime).getUTCHours();
    const sessionEndHour = session.endTime
      ? new Date(session.endTime).getUTCHours()
      : sessionStartHour + 2;
    // Expand the window by ±1 hour for better matching
    const windowStart = Math.max(0, sessionStartHour - 1);
    const windowEnd = Math.min(23, sessionEndHour + 1);

    // Fetch 12 months of historical data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const latitude = parseFloat(spot.latitude);
    const longitude = parseFloat(spot.longitude);

    const historicalData = await fetchHistoricalMarineTimeline(
      latitude,
      longitude,
      startDate,
      endDate
    );

    // Group hourly data by date, then score each day
    const dailyHours = new Map<string, typeof historicalData>();
    for (const hour of historicalData) {
      const dateStr = hour.time.split("T")[0];
      if (!dailyHours.has(dateStr)) dailyHours.set(dateStr, []);
      dailyHours.get(dateStr)!.push(hour);
    }

    const scores: { date: string; score: number }[] = [];

    for (const [dateStr, hours] of dailyHours) {
      // Filter to hours within the session time window
      const windowHours = hours.filter((h) => {
        const hourNum = parseInt(h.time.split("T")[1].split(":")[0], 10);
        return hourNum >= windowStart && hourNum <= windowEnd;
      });

      if (windowHours.length === 0) {
        scores.push({ date: dateStr, score: 0 });
        continue;
      }

      // Best score across the window hours
      let bestScore = 0;
      for (const hour of windowHours) {
        const forecastParsed = parseForecastConditions(hour);
        const { score, coverage } = computeSimilarity(forecastParsed, sessionParsed, weights);
        if (coverage >= 0.5 && score > bestScore) {
          bestScore = score;
        }
      }

      scores.push({ date: dateStr, score: Math.round(bestScore) });
    }

    // Sort by date
    scores.sort((a, b) => a.date.localeCompare(b.date));

    // Upsert cache
    if (cached) {
      await db
        .update(conditionHistoryCache)
        .set({ scores, computedAt: new Date() })
        .where(eq(conditionHistoryCache.id, cached.id));
    } else {
      await db.insert(conditionHistoryCache).values({
        spotId,
        sessionId,
        scores,
        computedAt: new Date(),
      });
    }

    return NextResponse.json({
      scores,
      sessionDate: session.date,
      cached: false,
    });
  } catch (error) {
    console.error("Error computing condition history:", error);
    return NextResponse.json(
      { error: "Failed to compute condition history" },
      { status: 500 }
    );
  }
}
