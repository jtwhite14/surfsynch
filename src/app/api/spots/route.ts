import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSpots, surfSessions, sessionConditions, spotAlerts, spotShares, users } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

const createSpotSchema = z.object({
  name: z.string().min(1).max(255),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const spotId = searchParams.get("id");

    if (spotId) {
      // Get single spot with sessions
      const spot = await db.query.surfSpots.findFirst({
        where: and(
          eq(surfSpots.id, spotId),
          eq(surfSpots.userId, userId)
        ),
        with: {
          surfSessions: {
            orderBy: [desc(surfSessions.date)],
            with: {
              conditions: true,
            },
          },
        },
      });

      if (!spot) {
        return NextResponse.json({ error: "Spot not found" }, { status: 404 });
      }

      return NextResponse.json({ spot });
    }

    // Get all spots for user
    const spots = await db.query.surfSpots.findMany({
      where: eq(surfSpots.userId, userId),
      orderBy: [desc(surfSpots.createdAt)],
    });

    // Include shared spots if requested (for session form spot picker)
    const includeShared = searchParams.get("includeShared") === "true";
    let sharedSpots: Array<typeof spots[number] & { sharedByName: string | null }> = [];
    if (includeShared) {
      const acceptedShares = await db.query.spotShares.findMany({
        where: and(
          eq(spotShares.sharedWithUserId, userId),
          eq(spotShares.status, "accepted")
        ),
        with: {
          spot: true,
          sharedBy: true,
        },
      });
      sharedSpots = acceptedShares
        .filter((s) => s.spot && !spots.some((own) => own.id === s.spot.id))
        .map((s) => ({ ...s.spot, sharedByName: s.sharedBy?.name ?? null }));
    }

    return NextResponse.json({ spots, sharedSpots });
  } catch (error) {
    console.error("Error fetching spots:", error);
    return NextResponse.json(
      { error: "Failed to fetch spots" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = createSpotSchema.parse(body);

    const [spot] = await db
      .insert(surfSpots)
      .values({
        userId: userId,
        name: validated.name,
        latitude: validated.latitude.toString(),
        longitude: validated.longitude.toString(),
        description: validated.description || null,
      })
      .returning();

    return NextResponse.json({ spot }, { status: 201 });
  } catch (error) {
    console.error("Error creating spot:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create spot" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const spotId = searchParams.get("id");

    if (!spotId) {
      return NextResponse.json({ error: "Spot ID required" }, { status: 400 });
    }

    const body = await request.json();
    const validated = createSpotSchema.partial().parse(body);
    const { alertsSilenced } = body;

    const [spot] = await db
      .update(surfSpots)
      .set({
        ...(validated.name && { name: validated.name }),
        ...(validated.latitude && { latitude: validated.latitude.toString() }),
        ...(validated.longitude && { longitude: validated.longitude.toString() }),
        ...(validated.description !== undefined && { description: validated.description }),
        ...(typeof alertsSilenced === "boolean" && { alertsSilenced }),
        updatedAt: new Date(),
      })
      .where(and(eq(surfSpots.id, spotId), eq(surfSpots.userId, userId)))
      .returning();

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    // When silencing, expire all active alerts for this spot
    if (alertsSilenced === true) {
      await db
        .update(spotAlerts)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(eq(spotAlerts.spotId, spotId), eq(spotAlerts.status, "active"))
        );
    }

    return NextResponse.json({ spot });
  } catch (error) {
    console.error("Error updating spot:", error);
    return NextResponse.json(
      { error: "Failed to update spot" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const spotId = searchParams.get("id");

    if (!spotId) {
      return NextResponse.json({ error: "Spot ID required" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(surfSpots)
      .where(and(eq(surfSpots.id, spotId), eq(surfSpots.userId, userId)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting spot:", error);
    return NextResponse.json(
      { error: "Failed to delete spot" },
      { status: 500 }
    );
  }
}
