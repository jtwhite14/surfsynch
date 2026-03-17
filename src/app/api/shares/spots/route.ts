import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, spotShares, surfSessions } from "@/lib/db";
import { eq, and, gte, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const shares = await db.query.spotShares.findMany({
      where: and(
        eq(spotShares.sharedWithUserId, userId),
        eq(spotShares.status, "accepted")
      ),
      with: {
        spot: {
          columns: { id: true, name: true, latitude: true, longitude: true, description: true },
        },
        sharedBy: {
          columns: { id: true, name: true },
        },
      },
    });

    // Get high-rated session counts for each share
    const results = await Promise.all(
      shares.map(async (share) => {
        const [sessionCount] = await db
          .select({ count: count() })
          .from(surfSessions)
          .where(and(
            eq(surfSessions.spotId, share.spotId),
            eq(surfSessions.userId, share.sharedByUserId),
            gte(surfSessions.rating, 3)
          ));

        return {
          shareId: share.id,
          spot: share.spot,
          sharedBy: share.sharedBy,
          highRatedSessionCount: sessionCount.count,
        };
      })
    );

    return NextResponse.json({ sharedSpots: results });
  } catch (error) {
    console.error("Error fetching shared spots:", error);
    return NextResponse.json({ error: "Failed to fetch shared spots" }, { status: 500 });
  }
}
