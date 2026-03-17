import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSessions, surfSpots } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { fetchHourlyTimeline } from "@/lib/api/open-meteo";

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

    const surfSession = await db.query.surfSessions.findFirst({
      where: and(
        eq(surfSessions.id, id),
        eq(surfSessions.userId, userId)
      ),
      with: { spot: true },
    });

    if (!surfSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (!surfSession.spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    const { timeline, sessionHourIndex } = await fetchHourlyTimeline(
      parseFloat(surfSession.spot.latitude),
      parseFloat(surfSession.spot.longitude),
      new Date(surfSession.startTime)
    );

    return NextResponse.json({ timeline, sessionHourIndex });
  } catch (error) {
    console.error("Error fetching timeline:", error);
    return NextResponse.json(
      { error: "Failed to fetch timeline" },
      { status: 500 }
    );
  }
}
