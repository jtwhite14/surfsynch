import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSpots, spotForecasts } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { fetchMarineForecast } from "@/lib/api/open-meteo";
import { fetchTideTimeline } from "@/lib/api/noaa-tides";
import { HourlyForecast } from "@/types";

const FORECAST_CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

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
    });

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    const cached = await db.query.spotForecasts.findFirst({
      where: eq(spotForecasts.spotId, id),
    });

    if (cached && (Date.now() - cached.fetchedAt.getTime()) < FORECAST_CACHE_TTL) {
      const data = cached.forecastData as { hourly?: HourlyForecast[]; utcOffsetSeconds?: number };
      if (data.hourly) {
        return NextResponse.json({ hourly: data.hourly, utcOffsetSeconds: data.utcOffsetSeconds ?? 0 });
      }
    }

    // Fetch fresh
    const lat = parseFloat(spot.latitude);
    const lng = parseFloat(spot.longitude);

    try {
      const forecast = await fetchMarineForecast(lat, lng);

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

      await db.insert(spotForecasts).values({
        spotId: id,
        forecastData: forecast,
        fetchedAt: new Date(),
      }).onConflictDoUpdate({
        target: [spotForecasts.spotId],
        set: { forecastData: forecast, fetchedAt: new Date() },
      });

      return NextResponse.json({ hourly: forecast.hourly, utcOffsetSeconds: forecast.utcOffsetSeconds });
    } catch (error) {
      console.error(`Error fetching forecast for spot ${id}:`, error);
      // Fall back to stale cache
      if (cached) {
        const data = cached.forecastData as { hourly?: HourlyForecast[]; utcOffsetSeconds?: number };
        if (data.hourly) {
          return NextResponse.json({ hourly: data.hourly, utcOffsetSeconds: data.utcOffsetSeconds ?? 0 });
        }
      }
      return NextResponse.json({ error: "Failed to fetch forecast" }, { status: 500 });
    }
  } catch (error) {
    console.error("Error in forecast route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
