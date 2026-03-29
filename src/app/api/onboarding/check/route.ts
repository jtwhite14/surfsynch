import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSessions, spotShares } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user has any accepted spot shares (invited user)
    const acceptedShare = await db.query.spotShares.findFirst({
      where: and(
        eq(spotShares.sharedWithUserId, userId),
        eq(spotShares.status, "accepted")
      ),
      columns: { id: true },
    });

    // Invited users never see photo onboarding — invite onboarding is
    // handled as a one-shot redirect from the invite accept flow.
    if (acceptedShare) {
      return NextResponse.json({
        needsOnboarding: false,
      });
    }

    // Organic user — check if they have any sessions
    const firstSession = await db.query.surfSessions.findFirst({
      where: eq(surfSessions.userId, userId),
      columns: { id: true },
    });

    if (!firstSession) {
      return NextResponse.json({
        needsOnboarding: true,
        onboardingUrl: "/onboarding",
      });
    }

    return NextResponse.json({
      needsOnboarding: false,
    });
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return NextResponse.json(
      { error: "Failed to check onboarding status" },
      { status: 500 }
    );
  }
}
