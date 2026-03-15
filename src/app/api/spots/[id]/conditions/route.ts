import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, surfSpots } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { fetchHourlyTimeline } from "@/lib/api/open-meteo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const spot = await db.query.surfSpots.findFirst({
      where: and(
        eq(surfSpots.id, id),
        eq(surfSpots.userId, session.user.id)
      ),
    });

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    const { timeline, sessionHourIndex: currentHourIndex } = await fetchHourlyTimeline(
      parseFloat(spot.latitude),
      parseFloat(spot.longitude),
      new Date()
    );

    return NextResponse.json({ timeline, currentHourIndex });
  } catch (error) {
    console.error("Error fetching spot conditions:", error);
    return NextResponse.json(
      { error: "Failed to fetch conditions" },
      { status: 500 }
    );
  }
}
