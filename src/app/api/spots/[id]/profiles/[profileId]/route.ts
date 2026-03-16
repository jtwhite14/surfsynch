import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, surfSpots, conditionProfiles } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { formatProfile } from "@/lib/profiles/format";

/**
 * GET: Fetch a single profile.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, profileId } = await params;

    const profile = await db.query.conditionProfiles.findFirst({
      where: and(
        eq(conditionProfiles.id, profileId),
        eq(conditionProfiles.spotId, id),
        eq(conditionProfiles.userId, session.user.id)
      ),
    });

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ profile: formatProfile(profile) });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

/**
 * PUT: Update a profile.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, profileId } = await params;

    const existing = await db.query.conditionProfiles.findFirst({
      where: and(
        eq(conditionProfiles.id, profileId),
        eq(conditionProfiles.spotId, id),
        eq(conditionProfiles.userId, session.user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    if (body.activeMonths !== undefined) updates.activeMonths = body.activeMonths;

    // Track whether targets changed (for reinforcement reset)
    let targetsChanged = false;

    const targetFields = [
      "targetSwellHeight", "targetSwellPeriod", "targetSwellDirection",
      "targetWindSpeed", "targetWindDirection", "targetTideHeight",
    ] as const;

    for (const field of targetFields) {
      if (body[field] !== undefined) {
        const newVal = body[field] === null ? null : body[field].toString();
        const oldVal = existing[field];
        if (newVal !== oldVal) {
          targetsChanged = true;
        }
        updates[field] = newVal;
      }
    }

    // Reset reinforcementCount if user manually edited targets
    if (targetsChanged) {
      updates.reinforcementCount = 0;
      updates.lastReinforcedAt = null;
    }

    // Validate at least 2 targets remain specified after update
    const merged = { ...existing };
    for (const field of targetFields) {
      if (body[field] !== undefined) {
        (merged as Record<string, unknown>)[field] = body[field] === null ? null : body[field].toString();
      }
    }
    const specifiedCount = targetFields.filter(f => merged[f] != null).length;
    if (specifiedCount < 2) {
      return NextResponse.json(
        { error: "At least 2 target conditions must be specified" },
        { status: 400 }
      );
    }

    const [updated] = await db.update(conditionProfiles)
      .set(updates)
      .where(eq(conditionProfiles.id, profileId))
      .returning();

    return NextResponse.json({ profile: formatProfile(updated) });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

/**
 * DELETE: Delete a profile.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, profileId } = await params;

    const existing = await db.query.conditionProfiles.findFirst({
      where: and(
        eq(conditionProfiles.id, profileId),
        eq(conditionProfiles.spotId, id),
        eq(conditionProfiles.userId, session.user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    await db.delete(conditionProfiles).where(eq(conditionProfiles.id, profileId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting profile:", error);
    return NextResponse.json({ error: "Failed to delete profile" }, { status: 500 });
  }
}

