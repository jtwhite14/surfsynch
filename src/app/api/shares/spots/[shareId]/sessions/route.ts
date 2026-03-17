import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, spotShares, surfSessions } from "@/lib/db";
import { eq, and, gte, desc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { shareId } = await params;

    // Verify this share belongs to the current user and is accepted
    const share = await db.query.spotShares.findFirst({
      where: and(
        eq(spotShares.id, shareId),
        eq(spotShares.sharedWithUserId, userId),
        eq(spotShares.status, "accepted")
      ),
    });

    if (!share) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    // Get the sharer's 3-5 star sessions at this spot
    const sessions = await db.query.surfSessions.findMany({
      where: and(
        eq(surfSessions.spotId, share.spotId),
        eq(surfSessions.userId, share.sharedByUserId),
        gte(surfSessions.rating, 3)
      ),
      orderBy: [desc(surfSessions.date)],
      with: {
        conditions: true,
        photos: {
          orderBy: (photos, { asc }) => [asc(photos.sortOrder)],
        },
      },
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Error fetching shared sessions:", error);
    return NextResponse.json({ error: "Failed to fetch shared sessions" }, { status: 500 });
  }
}
