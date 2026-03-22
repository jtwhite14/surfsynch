import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSessions } from "@/lib/db";
import { eq } from "drizzle-orm";
import { metersToFeet, kmhToMph } from "@/lib/api/open-meteo";

// ── Types ──

type InsightType = "swell" | "wind" | "tide" | "time" | "equipment" | "general";

interface Insight {
  text: string;
  type: InsightType;
  confidence: number;
}

interface BucketDef {
  label: string;
  min: number;
  max: number;
}

interface BucketResult {
  label: string;
  avgRating: number;
  count: number;
}

interface ConditionCorrelation {
  variable: string;
  buckets: BucketResult[];
}

interface TimeOfDayStat {
  window: string;
  avgRating: number;
  count: number;
}

interface EquipmentStat {
  id: string;
  name: string;
  avgRating: number;
  sessionCount: number;
}

// ── Bucket definitions ──

const SWELL_HEIGHT_BUCKETS: BucketDef[] = [
  { label: "0-2ft", min: 0, max: 0.6 },
  { label: "2-4ft", min: 0.6, max: 1.2 },
  { label: "4-6ft", min: 1.2, max: 1.8 },
  { label: "6-8ft", min: 1.8, max: 2.4 },
  { label: "8-10ft", min: 2.4, max: 3.0 },
  { label: "10ft+", min: 3.0, max: Infinity },
];

const SWELL_PERIOD_BUCKETS: BucketDef[] = [
  { label: "short (0-8s)", min: 0, max: 8 },
  { label: "medium (8-12s)", min: 8, max: 12 },
  { label: "long (12-16s)", min: 12, max: 16 },
  { label: "extra long (16s+)", min: 16, max: Infinity },
];

const WIND_SPEED_BUCKETS: BucketDef[] = [
  { label: "glassy (0-6mph)", min: 0, max: 10 },
  { label: "light (6-12mph)", min: 10, max: 20 },
  { label: "moderate (12-19mph)", min: 20, max: 30 },
  { label: "strong (19mph+)", min: 30, max: Infinity },
];

const TIDE_HEIGHT_BUCKETS: BucketDef[] = [
  { label: "very low (<-0.5ft)", min: -Infinity, max: -0.5 },
  { label: "mid (-0.5-0.5ft)", min: -0.5, max: 0.5 },
  { label: "high (0.5-2.0ft)", min: 0.5, max: 2.0 },
  { label: "very high (2.0ft+)", min: 2.0, max: Infinity },
];

// ── Helpers ──

function parseNum(val: string | null | undefined): number | null {
  if (val == null) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function bucketSessions(
  sessions: { value: number; rating: number }[],
  buckets: BucketDef[]
): BucketResult[] {
  return buckets.map((b) => {
    const matching = sessions.filter((s) => s.value >= b.min && s.value < b.max);
    const count = matching.length;
    const avgRating =
      count > 0 ? matching.reduce((sum, s) => sum + s.rating, 0) / count : 0;
    return { label: b.label, avgRating: Math.round(avgRating * 100) / 100, count };
  });
}

function getTimeWindow(hour: number): string | null {
  if (hour >= 5 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 14) return "midday";
  if (hour >= 14 && hour < 19) return "afternoon";
  return null;
}

// ── Route handler ──

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Query all user sessions with relations
    const allSessions = await db.query.surfSessions.findMany({
      where: eq(surfSessions.userId, userId),
      with: {
        conditions: true,
        spot: true,
        surfboard: true,
        wetsuit: true,
      },
    });

    // Filter: not ignored, has conditions
    const sessions = allSessions.filter(
      (s) => !s.ignored && s.conditions != null
    );

    const totalSessions = allSessions.filter((s) => !s.ignored).length;

    if (sessions.length < 5) {
      return NextResponse.json({
        insights: [],
        totalSessions,
        minSessionsRequired: 5,
      });
    }

    // ── Compute overall stats ──

    const overallAvg =
      sessions.reduce((sum, s) => sum + s.rating, 0) / sessions.length;

    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const s of sessions) {
      ratingDistribution[s.rating] = (ratingDistribution[s.rating] || 0) + 1;
    }

    const spotSet = new Set(sessions.map((s) => s.spot?.id).filter(Boolean));

    // ── Extract condition values per session ──

    type SessionWithValues = {
      rating: number;
      swellHeight: number | null;
      swellPeriod: number | null;
      windSpeed: number | null;
      tideHeight: number | null;
      startHour: number;
      surfboardId: string | null;
      surfboardName: string | null;
      spotId: string | null;
      spotName: string | null;
    };

    const enriched: SessionWithValues[] = sessions.map((s) => {
      const c = s.conditions!;
      return {
        rating: s.rating,
        swellHeight: parseNum(c.primarySwellHeight),
        swellPeriod: parseNum(c.primarySwellPeriod),
        windSpeed: parseNum(c.windSpeed),
        tideHeight: parseNum(c.tideHeight),
        startHour: new Date(s.startTime).getHours(),
        surfboardId: s.surfboard?.id ?? null,
        surfboardName: s.surfboard?.name ?? null,
        spotId: s.spot?.id ?? null,
        spotName: s.spot?.name ?? null,
      };
    });

    // ── Condition correlations ──

    const swellHeightData = enriched
      .filter((s) => s.swellHeight != null)
      .map((s) => ({ value: s.swellHeight!, rating: s.rating }));

    const swellPeriodData = enriched
      .filter((s) => s.swellPeriod != null)
      .map((s) => ({ value: s.swellPeriod!, rating: s.rating }));

    const windSpeedData = enriched
      .filter((s) => s.windSpeed != null)
      .map((s) => ({ value: s.windSpeed!, rating: s.rating }));

    const tideHeightData = enriched
      .filter((s) => s.tideHeight != null)
      .map((s) => ({ value: s.tideHeight!, rating: s.rating }));

    const conditionCorrelations: ConditionCorrelation[] = [
      { variable: "swellHeight", buckets: bucketSessions(swellHeightData, SWELL_HEIGHT_BUCKETS) },
      { variable: "swellPeriod", buckets: bucketSessions(swellPeriodData, SWELL_PERIOD_BUCKETS) },
      { variable: "windSpeed", buckets: bucketSessions(windSpeedData, WIND_SPEED_BUCKETS) },
      { variable: "tideHeight", buckets: bucketSessions(tideHeightData, TIDE_HEIGHT_BUCKETS) },
    ];

    // ── Time of day stats ──

    const timeGroups: Record<string, { total: number; count: number }> = {
      dawn: { total: 0, count: 0 },
      midday: { total: 0, count: 0 },
      afternoon: { total: 0, count: 0 },
    };

    for (const s of enriched) {
      const w = getTimeWindow(s.startHour);
      if (w && timeGroups[w]) {
        timeGroups[w].total += s.rating;
        timeGroups[w].count += 1;
      }
    }

    const timeOfDayStats: TimeOfDayStat[] = Object.entries(timeGroups).map(
      ([window, { total, count }]) => ({
        window,
        avgRating: count > 0 ? Math.round((total / count) * 100) / 100 : 0,
        count,
      })
    );

    // ── Equipment stats ──

    const boardMap = new Map<
      string,
      { name: string; total: number; count: number }
    >();
    for (const s of enriched) {
      if (s.surfboardId && s.surfboardName) {
        const existing = boardMap.get(s.surfboardId) || {
          name: s.surfboardName,
          total: 0,
          count: 0,
        };
        existing.total += s.rating;
        existing.count += 1;
        boardMap.set(s.surfboardId, existing);
      }
    }

    const equipmentStats: EquipmentStat[] = [...boardMap.entries()].map(
      ([id, { name, total, count }]) => ({
        id,
        name,
        avgRating: Math.round((total / count) * 100) / 100,
        sessionCount: count,
      })
    );

    // ── Generate insights ──

    const insights: Insight[] = [];

    // (g) General — always first
    insights.push({
      text: `You've logged ${totalSessions} sessions across ${spotSet.size} spot${spotSet.size === 1 ? "" : "s"} with an average rating of \u2605${overallAvg.toFixed(1)}`,
      type: "general",
      confidence: Infinity, // always first
    });

    // (a) Best swell height range
    const swellHeightBuckets = conditionCorrelations[0].buckets;
    const bestSwellBucket = swellHeightBuckets
      .filter((b) => b.count >= 3)
      .sort((a, b) => b.avgRating - a.avgRating)[0];
    if (bestSwellBucket && bestSwellBucket.avgRating - overallAvg >= 0.5) {
      const effectSize = bestSwellBucket.avgRating - overallAvg;
      insights.push({
        text: `You rate sessions highest (\u2605${bestSwellBucket.avgRating.toFixed(1)} avg) when waves are ${bestSwellBucket.label}`,
        type: "swell",
        confidence: effectSize * Math.sqrt(bestSwellBucket.count),
      });
    }

    // (b) Best swell period
    const swellPeriodBuckets = conditionCorrelations[1].buckets;
    const bestPeriodBucket = swellPeriodBuckets
      .filter((b) => b.count >= 3)
      .sort((a, b) => b.avgRating - a.avgRating)[0];
    if (bestPeriodBucket && bestPeriodBucket.avgRating - overallAvg >= 0.5) {
      const effectSize = bestPeriodBucket.avgRating - overallAvg;
      // Extract the period descriptor (e.g. "medium") from the label
      const periodLabel = bestPeriodBucket.label.split(" (")[0];
      const rangeLabel = bestPeriodBucket.label.match(/\((.+)\)/)?.[1] ?? bestPeriodBucket.label;
      insights.push({
        text: `Your best sessions come with ${periodLabel} period swells (${rangeLabel})`,
        type: "swell",
        confidence: effectSize * Math.sqrt(bestPeriodBucket.count),
      });
    }

    // (c) Wind threshold — find max wind speed where avg rating >= 3.5
    const windBuckets = conditionCorrelations[2].buckets;
    // Wind speed buckets are in km/h internally; find threshold in display units
    const windThresholds = [
      { kmh: 10, mph: kmhToMph(10)! },
      { kmh: 20, mph: kmhToMph(20)! },
      { kmh: 30, mph: kmhToMph(30)! },
    ];
    let windThresholdInsight: Insight | null = null;
    for (const threshold of windThresholds) {
      const sessionsBelow = windSpeedData.filter((s) => s.value <= threshold.kmh);
      const sessionsAbove = windSpeedData.filter((s) => s.value > threshold.kmh);
      if (sessionsBelow.length >= 3 && sessionsAbove.length >= 3) {
        const avgBelow =
          sessionsBelow.reduce((sum, s) => sum + s.rating, 0) / sessionsBelow.length;
        const avgAbove =
          sessionsAbove.reduce((sum, s) => sum + s.rating, 0) / sessionsAbove.length;
        if (avgBelow >= 3.5 && avgAbove < 3.5) {
          const effectSize = avgBelow - avgAbove;
          windThresholdInsight = {
            text: `Sessions drop below \u26053.5 when wind exceeds ${Math.round(threshold.mph)}mph`,
            type: "wind",
            confidence: effectSize * Math.sqrt(sessionsAbove.length),
          };
          break;
        }
      }
    }
    if (windThresholdInsight) {
      insights.push(windThresholdInsight);
    }

    // (d) Best time of day
    const bestTime = timeOfDayStats
      .filter((t) => t.count >= 3 && t.avgRating - overallAvg >= 0.3)
      .sort((a, b) => b.avgRating - a.avgRating)[0];
    if (bestTime) {
      const effectSize = bestTime.avgRating - overallAvg;
      insights.push({
        text: `You surf best in the ${bestTime.window} \u2014 \u2605${bestTime.avgRating.toFixed(1)} average across ${bestTime.count} sessions`,
        type: "time",
        confidence: effectSize * Math.sqrt(bestTime.count),
      });
    }

    // (e) Equipment insights — best surfboard
    const boardsWithEnough = equipmentStats.filter((b) => b.sessionCount >= 3);
    if (boardsWithEnough.length > 0) {
      const bestBoard = boardsWithEnough.sort(
        (a, b) => b.avgRating - a.avgRating
      )[0];
      if (bestBoard.avgRating - overallAvg >= 0.5) {
        const effectSize = bestBoard.avgRating - overallAvg;
        insights.push({
          text: `Your ${bestBoard.name} averages \u2605${bestBoard.avgRating.toFixed(1)} \u2014 your highest-rated board`,
          type: "equipment",
          confidence: effectSize * Math.sqrt(bestBoard.sessionCount),
        });
      }
    }

    // (f) Spot-specific sweet spot
    const spotGroups = new Map<
      string,
      { name: string; sessions: SessionWithValues[] }
    >();
    for (const s of enriched) {
      if (!s.spotId || !s.spotName) continue;
      const group = spotGroups.get(s.spotId) || { name: s.spotName, sessions: [] };
      group.sessions.push(s);
      spotGroups.set(s.spotId, group);
    }

    for (const [, group] of spotGroups) {
      if (group.sessions.length < 5) continue;

      const topSessions = group.sessions.filter((s) => s.rating >= 4);
      if (topSessions.length < 3) continue;

      // Describe the common conditions of top-rated sessions
      const condParts: string[] = [];

      const topSwellHeights = topSessions
        .map((s) => s.swellHeight)
        .filter((v): v is number => v != null);
      if (topSwellHeights.length >= 2) {
        const avgFt = metersToFeet(
          topSwellHeights.reduce((a, b) => a + b, 0) / topSwellHeights.length
        )!;
        condParts.push(`~${Math.round(avgFt)}ft swell`);
      }

      const topPeriods = topSessions
        .map((s) => s.swellPeriod)
        .filter((v): v is number => v != null);
      if (topPeriods.length >= 2) {
        const avgPeriod =
          topPeriods.reduce((a, b) => a + b, 0) / topPeriods.length;
        condParts.push(`${Math.round(avgPeriod)}s period`);
      }

      const topWinds = topSessions
        .map((s) => s.windSpeed)
        .filter((v): v is number => v != null);
      if (topWinds.length >= 2) {
        const avgMph = kmhToMph(
          topWinds.reduce((a, b) => a + b, 0) / topWinds.length
        )!;
        condParts.push(`${Math.round(avgMph)}mph wind`);
      }

      if (condParts.length >= 2) {
        const effectSize = 1.0; // top-rated subset
        insights.push({
          text: `At ${group.name}, your best sessions have ${condParts.join(", ")}`,
          type: "swell",
          confidence: effectSize * Math.sqrt(topSessions.length),
        });
      }
    }

    // ── Sort and cap insights ──

    // General always first, then sort remaining by confidence descending
    const generalInsight = insights.find((i) => i.type === "general")!;
    const otherInsights = insights
      .filter((i) => i.type !== "general")
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 6);

    const finalInsights = [generalInsight, ...otherInsights];

    return NextResponse.json({
      insights: finalInsights,
      totalSessions,
      ratingDistribution,
      conditionCorrelations,
      timeOfDayStats,
      equipmentStats,
    });
  } catch (error) {
    console.error("Error computing insights:", error);
    return NextResponse.json(
      { error: "Failed to compute insights" },
      { status: 500 }
    );
  }
}
