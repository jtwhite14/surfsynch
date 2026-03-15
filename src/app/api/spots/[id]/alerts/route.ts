import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, surfSpots, spotAlerts, surfSessions } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";
import type { SpotAlertResponse } from "@/types";

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

    // Verify spot belongs to user
    const spot = await db.query.surfSpots.findFirst({
      where: and(
        eq(surfSpots.id, id),
        eq(surfSpots.userId, session.user.id)
      ),
    });

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    // Fetch active alerts for this spot
    const alerts = await db.query.spotAlerts.findMany({
      where: and(
        eq(spotAlerts.spotId, id),
        eq(spotAlerts.userId, session.user.id),
        eq(spotAlerts.status, "active")
      ),
      orderBy: [desc(spotAlerts.effectiveScore)],
      with: {
        matchedSession: {
          with: {
            photos: {
              limit: 1,
              orderBy: (photos, { asc }) => [asc(photos.sortOrder)],
            },
          },
        },
      },
    });

    // Filter out expired alerts (forecast hour has passed)
    const now = new Date();
    const activeAlerts: SpotAlertResponse[] = alerts
      .filter(a => new Date(a.forecastHour) > now)
      .map(a => ({
        id: a.id,
        spotId: a.spotId,
        spotName: spot.name,
        forecastHour: a.forecastHour,
        timeWindow: a.timeWindow as SpotAlertResponse['timeWindow'],
        matchScore: parseFloat(a.matchScore),
        confidenceScore: parseFloat(a.confidenceScore),
        effectiveScore: parseFloat(a.effectiveScore),
        matchedSession: {
          id: a.matchedSession.id,
          date: a.matchedSession.date,
          rating: a.matchedSession.rating,
          notes: a.matchedSession.notes,
          photoUrl: a.matchedSession.photos?.[0]?.photoUrl || a.matchedSession.photoUrl,
        },
        matchDetails: a.matchDetails as SpotAlertResponse['matchDetails'],
        forecastSnapshot: a.forecastSnapshot as SpotAlertResponse['forecastSnapshot'],
        status: a.status as SpotAlertResponse['status'],
      }));

    return NextResponse.json({ alerts: activeAlerts });
  } catch (error) {
    console.error("Error fetching alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

/**
 * PATCH: dismiss or confirm an alert
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: spotId } = await params;
    const body = await request.json();
    const { alertId, status } = body;

    if (!alertId || !['dismissed', 'confirmed'].includes(status)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    await db.update(spotAlerts)
      .set({ status, updatedAt: new Date() })
      .where(and(
        eq(spotAlerts.id, alertId),
        eq(spotAlerts.userId, session.user.id),
        eq(spotAlerts.spotId, spotId)
      ));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating alert:", error);
    return NextResponse.json(
      { error: "Failed to update alert" },
      { status: 500 }
    );
  }
}
