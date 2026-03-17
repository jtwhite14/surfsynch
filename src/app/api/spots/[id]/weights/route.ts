import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSpots } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { ConditionWeights, DEFAULT_CONDITION_WEIGHTS, VALID_CARDINAL_DIRECTIONS, CardinalDirection, VALID_PREFERRED_WAVE_SIZES, VALID_PREFERRED_SWELL_PERIODS, VALID_PREFERRED_WINDS, VALID_PREFERRED_TIDES } from "@/types";

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
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const spot = await db.query.surfSpots.findFirst({
      where: and(eq(surfSpots.id, id), eq(surfSpots.userId, userId)),
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
      waveEnergy: clamp(body.waveEnergy ?? 0.8),
      preferredTide: Array.isArray(body.preferredTide)
        ? body.preferredTide.filter((v: string) => VALID_PREFERRED_TIDES.includes(v as any))
        : typeof body.preferredTide === 'string' && VALID_PREFERRED_TIDES.includes(body.preferredTide as any) ? [body.preferredTide]
        : undefined,
      preferredWaveSize: Array.isArray(body.preferredWaveSize)
        ? body.preferredWaveSize.filter((v: string) => VALID_PREFERRED_WAVE_SIZES.includes(v as any))
        : VALID_PREFERRED_WAVE_SIZES.includes(body.preferredWaveSize) ? [body.preferredWaveSize]
        : undefined,
      preferredSwellPeriod: Array.isArray(body.preferredSwellPeriod)
        ? body.preferredSwellPeriod.filter((v: string) => VALID_PREFERRED_SWELL_PERIODS.includes(v as any))
        : VALID_PREFERRED_SWELL_PERIODS.includes(body.preferredSwellPeriod) ? [body.preferredSwellPeriod]
        : undefined,
      preferredWind: Array.isArray(body.preferredWind)
        ? body.preferredWind.filter((v: string) => VALID_PREFERRED_WINDS.includes(v as any))
        : VALID_PREFERRED_WINDS.includes(body.preferredWind) ? [body.preferredWind]
        : undefined,
      swellExposure: Array.isArray(body.swellExposure)
        ? body.swellExposure.filter((d: string) => VALID_CARDINAL_DIRECTIONS.includes(d as CardinalDirection)) as CardinalDirection[]
        : undefined,
      preferredWindDirections: Array.isArray(body.preferredWindDirections)
        ? body.preferredWindDirections.filter((d: string) => VALID_CARDINAL_DIRECTIONS.includes(d as CardinalDirection)) as CardinalDirection[]
        : undefined,
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

function clamp(value: number, min = 0, max = 2): number {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
