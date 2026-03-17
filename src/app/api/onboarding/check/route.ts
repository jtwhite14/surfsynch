import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSessions } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessions = await db.query.surfSessions.findMany({
      where: eq(surfSessions.userId, userId),
    });

    return NextResponse.json({
      needsOnboarding: sessions.length === 0,
      sessionCount: sessions.length,
    });
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return NextResponse.json(
      { error: "Failed to check onboarding status" },
      { status: 500 }
    );
  }
}
