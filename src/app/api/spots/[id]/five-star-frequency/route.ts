import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId, getAccessibleSpot } from "@/lib/auth";
import { db, surfSpots, surfSessions } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { fetchHistoricalMarineTimeline } from "@/lib/api/open-meteo";
import {
  parseSessionConditions,
  parseForecastConditions,
  computeSimilarity,
} from "@/lib/matching/condition-matcher";
import { ConditionWeights, DEFAULT_CONDITION_WEIGHTS } from "@/types";

/**
 * GET: Return daily condition similarity scores for the last 12 months,
 * comparing each day against ALL 5-star sessions at this spot.
 * For each day, the best match across all 5-star sessions is used.
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

    // Fetch spot (for lat/lng and weights)
    const spot = await getAccessibleSpot(spotId, userId);

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    // Fetch all 5-star, non-ignored sessions with conditions
    const fiveStarSessions = await db.query.surfSessions.findMany({
      where: and(
        eq(surfSessions.spotId, spotId),
        eq(surfSessions.rating, 5),
        eq(surfSessions.ignored, false)
      ),
      with: { conditions: true },
    });

    // Filter to sessions that actually have conditions
    const sessionsWithConditions = fiveStarSessions.filter((s) => s.conditions);

    if (sessionsWithConditions.length === 0) {
      return NextResponse.json({
        scores: [],
        sessionCount: 0,
        sessionDates: [],
      });
    }

    const weights: ConditionWeights =
      (spot.conditionWeights as ConditionWeights) || DEFAULT_CONDITION_WEIGHTS;

    // Parse all session conditions and compute a union time window
    const parsedSessions = sessionsWithConditions.map((s) => {
      const startHour = new Date(s.startTime).getUTCHours();
      const endHour = s.endTime
        ? new Date(s.endTime).getUTCHours()
        : startHour + 2;
      return {
        parsed: parseSessionConditions(s.conditions!),
        windowStart: Math.max(0, startHour - 1),
        windowEnd: Math.min(23, endHour + 1),
        dateStr: new Date(s.date).toISOString().split("T")[0],
      };
    });

    // Use the broadest time window across all sessions
    const windowStart = Math.min(...parsedSessions.map((s) => s.windowStart));
    const windowEnd = Math.max(...parsedSessions.map((s) => s.windowEnd));

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

    // Group hourly data by date
    const dailyHours = new Map<string, typeof historicalData>();
    for (const hour of historicalData) {
      const dateStr = hour.time.split("T")[0];
      if (!dailyHours.has(dateStr)) dailyHours.set(dateStr, []);
      dailyHours.get(dateStr)!.push(hour);
    }

    const scores: { date: string; score: number }[] = [];

    for (const [dateStr, hours] of dailyHours) {
      // Filter to hours within the broadest session time window
      const windowHours = hours.filter((h) => {
        const hourNum = parseInt(h.time.split("T")[1].split(":")[0], 10);
        return hourNum >= windowStart && hourNum <= windowEnd;
      });

      if (windowHours.length === 0) {
        scores.push({ date: dateStr, score: 0 });
        continue;
      }

      // Best score across all 5-star sessions and all window hours
      let bestScore = 0;
      for (const hour of windowHours) {
        const forecastParsed = parseForecastConditions(hour);
        for (const session of parsedSessions) {
          const { score, coverage } = computeSimilarity(
            forecastParsed,
            session.parsed,
            weights
          );
          if (coverage >= 0.5 && score > bestScore) {
            bestScore = score;
          }
        }
      }

      scores.push({ date: dateStr, score: Math.round(bestScore) });
    }

    // Sort by date
    scores.sort((a, b) => a.date.localeCompare(b.date));

    // Collect session dates for highlighting
    const sessionDates = parsedSessions.map((s) => s.dateStr);

    return NextResponse.json({
      scores,
      sessionCount: sessionsWithConditions.length,
      sessionDates,
    });
  } catch (error) {
    console.error("Error computing five-star frequency:", error);
    return NextResponse.json(
      { error: "Failed to compute five-star frequency" },
      { status: 500 }
    );
  }
}
