import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, surfSessions, sessionConditions, surfSpots, sessionPhotos } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { fetchHistoricalConditions, fetchCurrentConditions } from "@/lib/api/open-meteo";

const createSessionSchema = z.object({
  spotId: z.string().uuid(),
  date: z.string().datetime(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional().nullable(),
  rating: z.number().min(1).max(5),
  notes: z.string().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  photoUrls: z.array(z.string().url()).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("id");
    const spotId = searchParams.get("spotId");
    const limit = searchParams.get("limit");

    if (sessionId) {
      // Get single session with details
      const surfSession = await db.query.surfSessions.findFirst({
        where: and(
          eq(surfSessions.id, sessionId),
          eq(surfSessions.userId, session.user.id)
        ),
        with: {
          conditions: true,
          spot: true,
          photos: true,
        },
      });

      if (!surfSession) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      return NextResponse.json({ session: surfSession });
    }

    // Get all sessions for user (optionally filtered by spot)
    const sessions = await db.query.surfSessions.findMany({
      where: spotId
        ? and(eq(surfSessions.userId, session.user.id), eq(surfSessions.spotId, spotId))
        : eq(surfSessions.userId, session.user.id),
      orderBy: [desc(surfSessions.date)],
      limit: limit ? parseInt(limit) : undefined,
      with: {
        conditions: true,
        spot: true,
        photos: true,
      },
    });

    return NextResponse.json({
      sessions,
      total: sessions.length,
    });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = createSessionSchema.parse(body);

    // Verify spot belongs to user
    const spot = await db.query.surfSpots.findFirst({
      where: and(
        eq(surfSpots.id, validated.spotId),
        eq(surfSpots.userId, session.user.id)
      ),
    });

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    // Create session
    const [newSession] = await db
      .insert(surfSessions)
      .values({
        spotId: validated.spotId,
        userId: session.user.id,
        date: new Date(validated.date),
        startTime: new Date(validated.startTime),
        endTime: validated.endTime ? new Date(validated.endTime) : null,
        rating: validated.rating,
        notes: validated.notes || null,
        photoUrl: validated.photoUrl || null,
      })
      .returning();

    // Insert session photos
    const allPhotoUrls: string[] = [];
    if (validated.photoUrls && validated.photoUrls.length > 0) {
      allPhotoUrls.push(...validated.photoUrls);
    } else if (validated.photoUrl) {
      allPhotoUrls.push(validated.photoUrl);
    }

    if (allPhotoUrls.length > 0) {
      await db.insert(sessionPhotos).values(
        allPhotoUrls.map((url, index) => ({
          sessionId: newSession.id,
          photoUrl: url,
          sortOrder: index,
        }))
      );
    }

    // Try to fetch historical conditions for the session time
    const sessionDate = new Date(validated.startTime);
    const now = new Date();

    let conditions = null;

    // If session is in the past (before today), try historical
    if (sessionDate < now) {
      conditions = await fetchHistoricalConditions(
        parseFloat(spot.latitude),
        parseFloat(spot.longitude),
        sessionDate
      );
    }

    // If historical fails or session is today, try current conditions
    if (!conditions) {
      conditions = await fetchCurrentConditions(
        parseFloat(spot.latitude),
        parseFloat(spot.longitude)
      );
    }

    // Store conditions if we got them
    if (conditions) {
      await db.insert(sessionConditions).values({
        sessionId: newSession.id,
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
        timestamp: conditions.timestamp,
      });
    }

    // Fetch the complete session with relations
    const completeSession = await db.query.surfSessions.findFirst({
      where: eq(surfSessions.id, newSession.id),
      with: {
        conditions: true,
        spot: true,
        photos: true,
      },
    });

    return NextResponse.json({ session: completeSession }, { status: 201 });
  } catch (error) {
    console.error("Error creating session:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(surfSessions)
      .where(
        and(
          eq(surfSessions.id, sessionId),
          eq(surfSessions.userId, session.user.id)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting session:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
