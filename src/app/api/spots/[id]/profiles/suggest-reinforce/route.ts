import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, surfSpots, surfSessions, conditionProfiles } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { parseSessionConditions, computeSimilarity } from "@/lib/matching/condition-matcher";
import { buildProfileForMatching } from "@/lib/matching/profile-utils";
import { DEFAULT_CONDITION_WEIGHTS } from "@/types";

/**
 * GET: Suggest which profile to reinforce with a given session.
 * Query: ?sessionId=X
 * Returns the closest matching profile + preview if match > 50.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: spotId } = await params;
    const sessionId = request.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId query parameter required" }, { status: 400 });
    }

    // Verify session
    const surfSession = await db.query.surfSessions.findFirst({
      where: and(
        eq(surfSessions.id, sessionId),
        eq(surfSessions.userId, session.user.id),
        eq(surfSessions.spotId, spotId)
      ),
      with: { conditions: true },
    });

    if (!surfSession || !surfSession.conditions) {
      return NextResponse.json({ suggestion: null });
    }

    // Get active profiles for this spot
    const profiles = await db.query.conditionProfiles.findMany({
      where: and(
        eq(conditionProfiles.spotId, spotId),
        eq(conditionProfiles.isActive, true)
      ),
    });

    if (profiles.length === 0) {
      return NextResponse.json({
        suggestion: null,
        canCreateNew: true,
      });
    }

    const sessionConds = parseSessionConditions(surfSession.conditions);

    // Find closest matching profile
    let bestScore = 0;
    let bestProfile: typeof profiles[0] | null = null;

    const spot = await db.query.surfSpots.findFirst({
      where: eq(surfSpots.id, spotId),
    });
    const weights = (spot?.conditionWeights as typeof DEFAULT_CONDITION_WEIGHTS) ?? DEFAULT_CONDITION_WEIGHTS;

    for (const profile of profiles) {
      const pfm = buildProfileForMatching(profile);
      const { score } = computeSimilarity(sessionConds, pfm.conditions, weights, pfm.specifiedVars);
      if (score > bestScore) {
        bestScore = score;
        bestProfile = profile;
      }
    }

    if (!bestProfile || bestScore < 50) {
      return NextResponse.json({
        suggestion: null,
        canCreateNew: true,
        bestScore: Math.round(bestScore),
      });
    }

    return NextResponse.json({
      suggestion: {
        profileId: bestProfile.id,
        profileName: bestProfile.name,
        matchScore: Math.round(bestScore),
      },
    });
  } catch (error) {
    console.error("Error suggesting reinforcement:", error);
    return NextResponse.json({ error: "Failed to suggest reinforcement" }, { status: 500 });
  }
}
