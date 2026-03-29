import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId, isTestMode, getAccessibleSpot } from "@/lib/auth";
import { db, surfSpots, spotAlerts, surfSessions, conditionProfiles } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";
import type { SpotAlertResponse } from "@/types";

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

    // Verify spot belongs to user or is shared with them
    const spot = await getAccessibleSpot(id, userId);

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    // Return empty if alerts are silenced for this spot
    if (spot.alertsSilenced) {
      return NextResponse.json({ alerts: [], silenced: true });
    }

    // Fetch active alerts for this spot
    const alerts = await db.query.spotAlerts.findMany({
      where: and(
        eq(spotAlerts.spotId, id),
        eq(spotAlerts.userId, userId),
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
        matchedProfile: true,
      },
    });

    // Filter out expired alerts (forecast hour has passed) — skip in test mode
    const now = new Date();
    const testMode = await isTestMode();
    const activeAlerts: SpotAlertResponse[] = alerts
      .filter(a => testMode || new Date(a.forecastHour) > now)
      .map(a => ({
        id: a.id,
        spotId: a.spotId,
        spotName: spot.name,
        forecastHour: a.forecastHour,
        timeWindow: a.timeWindow as SpotAlertResponse['timeWindow'],
        matchScore: parseFloat(a.matchScore),
        confidenceScore: parseFloat(a.confidenceScore),
        effectiveScore: parseFloat(a.effectiveScore),
        matchedSession: a.matchedSession ? {
          id: a.matchedSession.id,
          date: a.matchedSession.date,
          rating: a.matchedSession.rating,
          notes: a.matchedSession.notes,
          photoUrl: a.matchedSession.photos?.[0]?.photoUrl || a.matchedSession.photoUrl,
        } : undefined,
        matchedProfile: a.matchedProfile ? {
          id: a.matchedProfile.id,
          name: a.matchedProfile.name,
        } : undefined,
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
    const userId = await getAuthUserId();
    if (!userId) {
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
        eq(spotAlerts.userId, userId),
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
