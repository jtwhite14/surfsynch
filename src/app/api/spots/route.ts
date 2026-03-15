import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, surfSpots, surfSessions, sessionConditions } from "@/lib/db";
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const spotId = searchParams.get("id");

    if (spotId) {
      // Get single spot with sessions
      const spot = await db.query.surfSpots.findFirst({
        where: and(
          eq(surfSpots.id, spotId),
          eq(surfSpots.userId, session.user.id)
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
      where: eq(surfSpots.userId, session.user.id),
      orderBy: [desc(surfSpots.createdAt)],
    });

    return NextResponse.json({ spots });
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = createSpotSchema.parse(body);

    const [spot] = await db
      .insert(surfSpots)
      .values({
        userId: session.user.id,
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
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
      .where(and(eq(surfSpots.id, spotId), eq(surfSpots.userId, session.user.id)))
      .returning();

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const spotId = searchParams.get("id");

    if (!spotId) {
      return NextResponse.json({ error: "Spot ID required" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(surfSpots)
      .where(and(eq(surfSpots.id, spotId), eq(surfSpots.userId, session.user.id)))
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
