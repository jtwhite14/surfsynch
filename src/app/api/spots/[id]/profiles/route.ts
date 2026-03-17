import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSpots, conditionProfiles } from "@/lib/db";
import { eq, and, asc } from "drizzle-orm";
import { formatProfile } from "@/lib/profiles/format";

const MAX_PROFILES_PER_SPOT = 10;

function clampWeight(v: number): number {
  return Math.max(0, Math.min(2, v));
}

/**
 * GET: List all profiles for a spot.
 */
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

    const profiles = await db.query.conditionProfiles.findMany({
      where: eq(conditionProfiles.spotId, id),
      orderBy: [asc(conditionProfiles.sortOrder)],
    });

    return NextResponse.json({
      profiles: profiles.map(formatProfile),
    });
  } catch (error) {
    console.error("Error fetching profiles:", error);
    return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
  }
}

/**
 * POST: Create a new profile for a spot.
 */
export async function POST(
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

    // Enforce 10-profile limit
    const existing = await db.query.conditionProfiles.findMany({
      where: eq(conditionProfiles.spotId, id),
    });
    if (existing.length >= MAX_PROFILES_PER_SPOT) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_PROFILES_PER_SPOT} profiles per spot` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      name,
      targetSwellHeight,
      targetSwellPeriod,
      targetSwellDirection,
      targetWindSpeed,
      targetWindDirection,
      targetTideHeight,
      activeMonths,
      consistency,
      qualityCeiling,
      source,
      weightSwellHeight,
      weightSwellPeriod,
      weightSwellDirection,
      weightTideHeight,
      weightWindSpeed,
      weightWindDirection,
      weightWaveEnergy,
      selections,
      exclusions,
    } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate at least 2 target variables are specified
    const specifiedCount = [
      targetSwellHeight, targetSwellPeriod, targetSwellDirection,
      targetWindSpeed, targetWindDirection, targetTideHeight,
    ].filter(v => v != null).length;

    if (specifiedCount < 2) {
      return NextResponse.json(
        { error: "At least 2 target conditions must be specified" },
        { status: 400 }
      );
    }

    const [profile] = await db.insert(conditionProfiles).values({
      spotId: id,
      userId: userId,
      name: name.trim(),
      sortOrder: existing.length,
      targetSwellHeight: targetSwellHeight?.toString() ?? null,
      targetSwellPeriod: targetSwellPeriod?.toString() ?? null,
      targetSwellDirection: targetSwellDirection?.toString() ?? null,
      targetWindSpeed: targetWindSpeed?.toString() ?? null,
      targetWindDirection: targetWindDirection?.toString() ?? null,
      targetTideHeight: targetTideHeight?.toString() ?? null,
      activeMonths: activeMonths ?? null,
      consistency: ["low", "medium", "high"].includes(consistency) ? consistency : "medium",
      qualityCeiling: typeof qualityCeiling === "number" && qualityCeiling >= 1 && qualityCeiling <= 5 ? qualityCeiling : 3,
      source: source === "auto_generated" ? "auto_generated" : "manual",
      ...(typeof weightSwellHeight === "number" && { weightSwellHeight: clampWeight(weightSwellHeight).toString() }),
      ...(typeof weightSwellPeriod === "number" && { weightSwellPeriod: clampWeight(weightSwellPeriod).toString() }),
      ...(typeof weightSwellDirection === "number" && { weightSwellDirection: clampWeight(weightSwellDirection).toString() }),
      ...(typeof weightTideHeight === "number" && { weightTideHeight: clampWeight(weightTideHeight).toString() }),
      ...(typeof weightWindSpeed === "number" && { weightWindSpeed: clampWeight(weightWindSpeed).toString() }),
      ...(typeof weightWindDirection === "number" && { weightWindDirection: clampWeight(weightWindDirection).toString() }),
      ...(typeof weightWaveEnergy === "number" && { weightWaveEnergy: clampWeight(weightWaveEnergy).toString() }),
      ...(selections && { selections }),
      ...(exclusions && { exclusions }),
    }).returning();

    // Fire-and-forget: recompute alerts for this spot with the new profile
    const origin = request.nextUrl.origin;
    fetch(`${origin}/api/spots/${id}/compute-alerts`, {
      method: "POST",
      headers: { cookie: request.headers.get("cookie") ?? "" },
    }).catch(err => console.error("Background alert recompute failed:", err));

    return NextResponse.json({ profile: formatProfile(profile) }, { status: 201 });
  } catch (error) {
    console.error("Error creating profile:", error);
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }
}

