import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, surfSpots } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { ConditionWeights, DEFAULT_CONDITION_WEIGHTS } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const spot = await db.query.surfSpots.findFirst({
      where: and(eq(surfSpots.id, id), eq(surfSpots.userId, session.user.id)),
    });

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    const weights = (spot.conditionWeights as ConditionWeights) ?? DEFAULT_CONDITION_WEIGHTS;
    return NextResponse.json({ weights });
  } catch (error) {
    console.error("Error fetching weights:", error);
    return NextResponse.json({ error: "Failed to fetch weights" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const spot = await db.query.surfSpots.findFirst({
      where: and(eq(surfSpots.id, id), eq(surfSpots.userId, session.user.id)),
    });

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    // Validate weights
    const weights: ConditionWeights = {
      swellHeight: clamp(body.swellHeight ?? 0.8),
      swellPeriod: clamp(body.swellPeriod ?? 0.7),
      swellDirection: clamp(body.swellDirection ?? 0.9),
      tideHeight: clamp(body.tideHeight ?? 0.5),
      windSpeed: clamp(body.windSpeed ?? 0.7),
      windDirection: clamp(body.windDirection ?? 0.6),
      preferredTide: ['any', 'low', 'mid', 'high', 'incoming', 'outgoing'].includes(body.preferredTide)
        ? body.preferredTide
        : 'any',
      notes: body.notes ?? undefined,
    };

    await db.update(surfSpots)
      .set({ conditionWeights: weights, updatedAt: new Date() })
      .where(eq(surfSpots.id, id));

    return NextResponse.json({ weights });
  } catch (error) {
    console.error("Error updating weights:", error);
    return NextResponse.json({ error: "Failed to update weights" }, { status: 500 });
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
