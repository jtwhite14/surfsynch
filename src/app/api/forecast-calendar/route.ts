import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, spotAlerts, surfSpots } from "@/lib/db";
import { and, eq, gte } from "drizzle-orm";
import type { MatchDetails, MarineConditions } from "@/types";

// ---------- Response shapes ----------

interface CalendarWindow {
  window: "dawn" | "midday" | "afternoon";
  effectiveScore: number;
  matchScore: number;
  confidenceScore: number;
  matchedProfileName: string | null;
  matchedSessionRating: number | null;
  matchDetails: MatchDetails | null;
  forecastSnapshot: MarineConditions | null;
}

interface CalendarSpot {
  spotId: string;
  spotName: string;
  windows: CalendarWindow[];
  bestScore: number;
}

interface CalendarDay {
  date: string; // YYYY-MM-DD
  label: string; // "Today", "Tomorrow", "Wed", etc.
  spots: CalendarSpot[];
  bestScore: number;
}

// ---------- Helpers ----------

const WINDOW_ORDER: Record<string, number> = { dawn: 0, midday: 1, afternoon: 2 };

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(dateStr: string, todayStr: string, tomorrowStr: string): string {
  if (dateStr === todayStr) return "Today";
  if (dateStr === tomorrowStr) return "Tomorrow";
  const d = new Date(dateStr + "T00:00:00");
  return SHORT_DAYS[d.getUTCDay()];
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------- Route ----------

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const spotId = request.nextUrl.searchParams.get("spotId");

    // Build where conditions
    const conditions = [
      eq(spotAlerts.userId, userId),
      eq(spotAlerts.status, "active"),
      gte(spotAlerts.expiresAt, new Date()),
    ];
    if (spotId) {
      conditions.push(eq(spotAlerts.spotId, spotId));
    }

    // Query with relations
    const allAlerts = await db.query.spotAlerts.findMany({
      where: and(...conditions),
      with: {
        spot: { columns: { id: true, name: true, alertsSilenced: true } },
        matchedProfile: { columns: { id: true, name: true } },
        matchedSession: { columns: { id: true, rating: true } },
      },
    });

    // Filter out alerts for silenced spots
    const alerts = allAlerts.filter((a) => !a.spot?.alertsSilenced);

    // Group: date -> spotId -> windows
    const now = new Date();
    const todayStr = toDateStr(now);
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = toDateStr(tomorrow);

    const dayMap = new Map<
      string,
      Map<string, { spotName: string; windows: CalendarWindow[] }>
    >();

    for (const alert of alerts) {
      const dateStr = toDateStr(new Date(alert.forecastHour));
      const sid = alert.spotId;
      const spotName = alert.spot?.name ?? "Unknown";

      if (!dayMap.has(dateStr)) dayMap.set(dateStr, new Map());
      const spotMap = dayMap.get(dateStr)!;
      if (!spotMap.has(sid)) spotMap.set(sid, { spotName, windows: [] });

      spotMap.get(sid)!.windows.push({
        window: alert.timeWindow as "dawn" | "midday" | "afternoon",
        effectiveScore: Number(alert.effectiveScore),
        matchScore: Number(alert.matchScore),
        confidenceScore: Number(alert.confidenceScore),
        matchedProfileName: alert.matchedProfile?.name ?? null,
        matchedSessionRating: alert.matchedSession?.rating ?? null,
        matchDetails: (alert.matchDetails as MatchDetails) ?? null,
        forecastSnapshot: (alert.forecastSnapshot as MarineConditions) ?? null,
      });
    }

    // Assemble days
    const days: CalendarDay[] = [];

    for (const [dateStr, spotMap] of dayMap) {
      const spots: CalendarSpot[] = [];

      for (const [sid, data] of spotMap) {
        // Sort windows: dawn, midday, afternoon
        data.windows.sort(
          (a, b) => (WINDOW_ORDER[a.window] ?? 9) - (WINDOW_ORDER[b.window] ?? 9)
        );
        const bestScore = Math.max(...data.windows.map((w) => w.effectiveScore));
        spots.push({
          spotId: sid,
          spotName: data.spotName,
          windows: data.windows,
          bestScore,
        });
      }

      // Sort spots by bestScore descending
      spots.sort((a, b) => b.bestScore - a.bestScore);

      days.push({
        date: dateStr,
        label: dayLabel(dateStr, todayStr, tomorrowStr),
        spots,
        bestScore: spots.length > 0 ? spots[0].bestScore : 0,
      });
    }

    // Sort days chronologically and limit to 7
    days.sort((a, b) => a.date.localeCompare(b.date));
    const limitedDays = days.slice(0, 7);

    // Count unique spots
    const uniqueSpots = new Set<string>();
    for (const day of limitedDays) {
      for (const spot of day.spots) {
        uniqueSpots.add(spot.spotId);
      }
    }

    return NextResponse.json({
      days: limitedDays,
      spotCount: uniqueSpots.size,
    });
  } catch (error) {
    console.error("[forecast-calendar] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch forecast calendar" },
      { status: 500 }
    );
  }
}
