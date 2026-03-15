import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  db,
  uploadSessions,
  uploadPhotos,
  surfSessions,
  sessionConditions,
  sessionPhotos,
  surfSpots,
} from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { fetchHistoricalConditions, fetchCurrentConditions } from "@/lib/api/open-meteo";

const completeSchema = z.object({
  uploadSessionId: z.string().uuid(),
  sessions: z.array(
    z.object({
      photoUrl: z.string().url(),
      spotId: z.string().uuid(),
      date: z.string().datetime(),
      startTime: z.string().datetime(),
      rating: z.number().min(1).max(5),
      notes: z.string().optional(),
    })
  ),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = completeSchema.parse(body);

    // Verify upload session belongs to user
    const uploadSession = await db.query.uploadSessions.findFirst({
      where: and(
        eq(uploadSessions.id, validated.uploadSessionId),
        eq(uploadSessions.userId, session.user.id)
      ),
    });

    if (!uploadSession) {
      return NextResponse.json(
        { error: "Upload session not found" },
        { status: 404 }
      );
    }

    const sessionIds: string[] = [];

    // Create each surf session
    for (const s of validated.sessions) {
      // Verify spot belongs to user
      const spot = await db.query.surfSpots.findFirst({
        where: and(
          eq(surfSpots.id, s.spotId),
          eq(surfSpots.userId, session.user.id)
        ),
      });

      if (!spot) {
        return NextResponse.json(
          { error: `Spot not found: ${s.spotId}` },
          { status: 404 }
        );
      }

      const [newSession] = await db
        .insert(surfSessions)
        .values({
          spotId: s.spotId,
          userId: session.user.id,
          date: new Date(s.date),
          startTime: new Date(s.startTime),
          rating: s.rating,
          notes: s.notes || null,
          photoUrl: s.photoUrl,
        })
        .returning();

      sessionIds.push(newSession.id);

      // Insert into session_photos table, propagating fileHash from upload_photos
      if (s.photoUrl) {
        const uploadPhoto = await db.query.uploadPhotos.findFirst({
          where: eq(uploadPhotos.photoUrl, s.photoUrl),
        });

        await db.insert(sessionPhotos).values({
          sessionId: newSession.id,
          photoUrl: s.photoUrl,
          sortOrder: 0,
          fileHash: uploadPhoto?.fileHash ?? null,
        });
      }

      // Try to fetch conditions – historical first, then current as fallback
      const sessionDate = new Date(s.startTime);
      let conditions = await fetchHistoricalConditions(
        parseFloat(spot.latitude),
        parseFloat(spot.longitude),
        sessionDate
      );

      // If historical fails (e.g. recent date not yet in archive), try current
      if (!conditions) {
        conditions = await fetchCurrentConditions(
          parseFloat(spot.latitude),
          parseFloat(spot.longitude)
        );
      }

      if (conditions) {
        await db.insert(sessionConditions).values({
          sessionId: newSession.id,
          waveHeight: conditions.waveHeight?.toString() || null,
          wavePeriod: conditions.wavePeriod?.toString() || null,
          waveDirection: conditions.waveDirection?.toString() || null,
          primarySwellHeight:
            conditions.primarySwellHeight?.toString() || null,
          primarySwellPeriod:
            conditions.primarySwellPeriod?.toString() || null,
          primarySwellDirection:
            conditions.primarySwellDirection?.toString() || null,
          secondarySwellHeight:
            conditions.secondarySwellHeight?.toString() || null,
          secondarySwellPeriod:
            conditions.secondarySwellPeriod?.toString() || null,
          secondarySwellDirection:
            conditions.secondarySwellDirection?.toString() || null,
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
        });
      }
    }

    // Mark upload session as completed
    await db
      .update(uploadSessions)
      .set({ status: "completed" })
      .where(eq(uploadSessions.id, validated.uploadSessionId));

    return NextResponse.json(
      {
        created: sessionIds.length,
        sessionIds,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error completing upload session:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to complete upload session" },
      { status: 500 }
    );
  }
}
