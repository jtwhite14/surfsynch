import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, surfSessions, sessionConditions, surfSpots } from "@/lib/db";
import { eq } from "drizzle-orm";
import { fetchHistoricalConditions, fetchCurrentConditions } from "@/lib/api/open-meteo";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all sessions for the user with their conditions and spot
    const sessions = await db.query.surfSessions.findMany({
      where: eq(surfSessions.userId, session.user.id),
      with: {
        conditions: true,
        spot: true,
      },
    });

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const surfSession of sessions) {
      if (!surfSession.spot) {
        errors.push(`Session ${surfSession.id}: no spot found`);
        failed++;
        continue;
      }

      const lat = parseFloat(surfSession.spot.latitude);
      const lng = parseFloat(surfSession.spot.longitude);
      const sessionDate = new Date(surfSession.startTime);
      const now = new Date();

      let conditions = null;

      // Try historical first, then current
      if (sessionDate < now) {
        conditions = await fetchHistoricalConditions(lat, lng, sessionDate);
      }
      if (!conditions) {
        conditions = await fetchCurrentConditions(lat, lng);
      }

      if (!conditions) {
        errors.push(`Session ${surfSession.id}: could not fetch conditions`);
        failed++;
        continue;
      }

      const values = {
        waveHeight: conditions.waveHeight?.toString() || null,
        wavePeriod: conditions.wavePeriod?.toString() || null,
        waveDirection: conditions.waveDirection?.toString() || null,
        primarySwellHeight: conditions.primarySwellHeight?.toString() || null,
        primarySwellPeriod: conditions.primarySwellPeriod?.toString() || null,
        primarySwellDirection: conditions.primarySwellDirection?.toString() || null,
        secondarySwellHeight: conditions.secondarySwellHeight?.toString() || null,
        secondarySwellPeriod: conditions.secondarySwellPeriod?.toString() || null,
        secondarySwellDirection: conditions.secondarySwellDirection?.toString() || null,
        windWaveHeight: conditions.windWaveHeight?.toString() || null,
        windWavePeriod: conditions.windWavePeriod?.toString() || null,
        windWaveDirection: conditions.windWaveDirection?.toString() || null,
        windSpeed: conditions.windSpeed?.toString() || null,
        windDirection: conditions.windDirection?.toString() || null,
        windGust: conditions.windGust?.toString() || null,
        airTemp: conditions.airTemp?.toString() || null,
        seaSurfaceTemp: conditions.seaSurfaceTemp?.toString() || null,
        humidity: conditions.humidity?.toString() || null,
        precipitation: conditions.precipitation?.toString() || null,
        pressureMsl: conditions.pressureMsl?.toString() || null,
        cloudCover: conditions.cloudCover?.toString() || null,
        visibility: conditions.visibility?.toString() || null,
        tideHeight: conditions.tideHeight?.toString() || null,
        waveEnergy: conditions.waveEnergy?.toString() || null,
        timestamp: conditions.timestamp,
      };

      if (surfSession.conditions) {
        // Update existing conditions row
        await db
          .update(sessionConditions)
          .set(values)
          .where(eq(sessionConditions.sessionId, surfSession.id));
      } else {
        // Insert new conditions row
        await db.insert(sessionConditions).values({
          sessionId: surfSession.id,
          ...values,
        });
      }

      updated++;

      // Small delay to avoid rate limiting Open-Meteo
      await new Promise((r) => setTimeout(r, 500));
    }

    return NextResponse.json({
      total: sessions.length,
      updated,
      failed,
      errors,
    });
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      { error: "Backfill failed", details: String(error) },
      { status: 500 }
    );
  }
}
