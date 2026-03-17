import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSessions, conditionProfiles } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { parseSessionConditions } from "@/lib/matching/condition-matcher";
import { circularEma, linearEma, getReinforcementAlpha } from "@/lib/matching/profile-utils";

/**
 * POST: Reinforce a profile with a session's conditions.
 * Body: { sessionId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: spotId, profileId } = await params;
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    // Verify profile ownership
    const profile = await db.query.conditionProfiles.findFirst({
      where: and(
        eq(conditionProfiles.id, profileId),
        eq(conditionProfiles.spotId, spotId),
        eq(conditionProfiles.userId, userId)
      ),
    });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Verify session ownership and minimum rating
    const surfSession = await db.query.surfSessions.findFirst({
      where: and(
        eq(surfSessions.id, sessionId),
        eq(surfSessions.userId, userId),
        eq(surfSessions.spotId, spotId)
      ),
      with: { conditions: true },
    });

    if (!surfSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (surfSession.rating < 4) {
      return NextResponse.json({ error: "Session must be rated 4 or 5 stars" }, { status: 400 });
    }
    if (!surfSession.conditions) {
      return NextResponse.json({ error: "Session has no conditions data" }, { status: 400 });
    }

    const sessionConds = parseSessionConditions(surfSession.conditions);

    // Check if user has manually edited targets since last reinforcement
    // If so, reset reinforcement count
    let reinforcementCount = profile.reinforcementCount;
    if (profile.lastReinforcedAt && profile.updatedAt > profile.lastReinforcedAt) {
      reinforcementCount = 0;
    }

    const alpha = getReinforcementAlpha(reinforcementCount);
    const updates: Record<string, unknown> = {
      reinforcementCount: reinforcementCount + 1,
      lastReinforcedAt: new Date(),
      updatedAt: new Date(),
    };

    // EMA update each target that the profile specifies and session has data for
    if (profile.targetSwellHeight != null && sessionConds.swellHeight != null) {
      updates.targetSwellHeight = linearEma(
        parseFloat(profile.targetSwellHeight), sessionConds.swellHeight, alpha
      ).toFixed(2);
    }
    if (profile.targetSwellPeriod != null && sessionConds.swellPeriod != null) {
      updates.targetSwellPeriod = linearEma(
        parseFloat(profile.targetSwellPeriod), sessionConds.swellPeriod, alpha
      ).toFixed(2);
    }
    if (profile.targetSwellDirection != null && sessionConds.swellDirection != null) {
      updates.targetSwellDirection = circularEma(
        parseFloat(profile.targetSwellDirection), sessionConds.swellDirection, alpha
      ).toFixed(2);
    }
    if (profile.targetWindSpeed != null && sessionConds.windSpeed != null) {
      updates.targetWindSpeed = linearEma(
        parseFloat(profile.targetWindSpeed), sessionConds.windSpeed, alpha
      ).toFixed(2);
    }
    if (profile.targetWindDirection != null && sessionConds.windDirection != null) {
      updates.targetWindDirection = circularEma(
        parseFloat(profile.targetWindDirection), sessionConds.windDirection, alpha
      ).toFixed(2);
    }
    if (profile.targetTideHeight != null && sessionConds.tideHeight != null) {
      updates.targetTideHeight = linearEma(
        parseFloat(profile.targetTideHeight), sessionConds.tideHeight, alpha
      ).toFixed(3);
    }

    const [updated] = await db.update(conditionProfiles)
      .set(updates)
      .where(eq(conditionProfiles.id, profileId))
      .returning();

    return NextResponse.json({
      success: true,
      profile: {
        id: updated.id,
        name: updated.name,
        reinforcementCount: updated.reinforcementCount,
      },
    });
  } catch (error) {
    console.error("Error reinforcing profile:", error);
    return NextResponse.json({ error: "Failed to reinforce profile" }, { status: 500 });
  }
}
