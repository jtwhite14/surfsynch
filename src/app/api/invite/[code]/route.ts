import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, spotShares, surfSessions, users } from "@/lib/db";
import { eq, and, isNull } from "drizzle-orm";

// Returns invite validity. If authenticated, also returns spot/sharer details.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    const share = await db.query.spotShares.findFirst({
      where: and(
        eq(spotShares.inviteCode, code),
        eq(spotShares.status, "pending"),
        isNull(spotShares.sharedWithUserId)
      ),
      with: {
        spot: { columns: { id: true, name: true, latitude: true, longitude: true } },
        sharedBy: { columns: { id: true, name: true } },
      },
    });

    if (!share) {
      return NextResponse.json({ valid: false });
    }

    // Always include spot location for the map preview (lat/lng is not sensitive)
    const spotData = {
      name: share.spot.name,
      latitude: share.spot.latitude,
      longitude: share.spot.longitude,
    };

    // Check if user is authenticated — if so, include sharer details
    let userId: string | null = null;
    try {
      userId = await getAuthUserId();
    } catch {
      // Not authenticated — that's fine for this endpoint
    }

    if (userId) {
      return NextResponse.json({
        valid: true,
        spot: spotData,
        sharedBy: share.sharedBy,
      });
    }

    // Not authenticated — include spot for map but not sharer identity
    return NextResponse.json({ valid: true, spot: spotData });
  } catch (error) {
    console.error("Error checking invite:", error);
    return NextResponse.json({ valid: false });
  }
}

// Authenticated — claim or decline an invite
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code } = await params;
    const body = await request.json();
    const action = body.action as "accept" | "decline";

    if (action !== "accept" && action !== "decline") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Look up the invite first to check ownership and get spot info
    const share = await db.query.spotShares.findFirst({
      where: and(
        eq(spotShares.inviteCode, code),
        eq(spotShares.status, "pending")
      ),
      with: {
        spot: { columns: { id: true, name: true } },
        sharedBy: { columns: { id: true, name: true } },
      },
    });

    if (!share) {
      return NextResponse.json({ error: "Invite not found or already used" }, { status: 404 });
    }

    // Can't claim your own share
    if (share.sharedByUserId === userId) {
      return NextResponse.json({ error: "You can't accept your own share link" }, { status: 400 });
    }

    // Check if this user already has an accepted share for this spot
    const existingAccepted = await db.query.spotShares.findFirst({
      where: and(
        eq(spotShares.spotId, share.spotId),
        eq(spotShares.sharedWithUserId, userId),
        eq(spotShares.status, "accepted")
      ),
    });

    if (existingAccepted) {
      return NextResponse.json({ error: "You already have access to this spot" }, { status: 400 });
    }

    if (action === "decline") {
      // For decline, just mark it — don't assign the user
      await db
        .update(spotShares)
        .set({ status: "declined", respondedAt: new Date() })
        .where(eq(spotShares.id, share.id));

      return NextResponse.json({ status: "declined" });
    }

    // Atomic claim — only succeeds if sharedWithUserId is still NULL (race-safe)
    const [claimed] = await db
      .update(spotShares)
      .set({
        sharedWithUserId: userId,
        status: "accepted",
        respondedAt: new Date(),
      })
      .where(and(
        eq(spotShares.id, share.id),
        isNull(spotShares.sharedWithUserId)
      ))
      .returning();

    if (!claimed) {
      return NextResponse.json({ error: "This invite has already been claimed" }, { status: 409 });
    }

    // Check if this is a new user (no sessions, no phone) to determine redirect
    const [userSessions, user] = await Promise.all([
      db.query.surfSessions.findMany({
        where: eq(surfSessions.userId, userId),
        columns: { id: true },
        limit: 1,
      }),
      db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { phoneNumber: true },
      }),
    ]);
    const isNewUser = userSessions.length === 0 && !user?.phoneNumber;

    return NextResponse.json({
      status: "accepted",
      spot: share.spot,
      sharedBy: share.sharedBy,
      isNewUser,
      shareId: claimed.id,
    });
  } catch (error) {
    console.error("Error claiming invite:", error);
    return NextResponse.json({ error: "Failed to process invite" }, { status: 500 });
  }
}
