import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, surfSessions, spotShares, loggedFriendSessions } from "@/lib/db";
import { eq, and, or } from "drizzle-orm";

/**
 * POST: Add a friend's session to the user's log (for matching).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;

    // Fetch the session
    const session = await db.query.surfSessions.findFirst({
      where: eq(surfSessions.id, sessionId),
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Cannot add own session
    if (session.userId === userId) {
      return NextResponse.json({ error: "Cannot add your own session to log" }, { status: 400 });
    }

    // Verify user has an accepted share for this spot
    const share = await db.query.spotShares.findFirst({
      where: and(
        eq(spotShares.spotId, session.spotId),
        eq(spotShares.status, "accepted"),
        or(
          and(eq(spotShares.sharedByUserId, userId), eq(spotShares.sharedWithUserId, session.userId)),
          and(eq(spotShares.sharedByUserId, session.userId), eq(spotShares.sharedWithUserId, userId))
        )
      ),
    });

    if (!share) {
      return NextResponse.json({ error: "No share found for this spot" }, { status: 403 });
    }

    // Upsert (ignore conflict on unique index)
    await db
      .insert(loggedFriendSessions)
      .values({ userId, sessionId })
      .onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding session to log:", error);
    return NextResponse.json({ error: "Failed to add session to log" }, { status: 500 });
  }
}

/**
 * DELETE: Remove a friend's session from the user's log.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;

    await db
      .delete(loggedFriendSessions)
      .where(
        and(
          eq(loggedFriendSessions.userId, userId),
          eq(loggedFriendSessions.sessionId, sessionId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing session from log:", error);
    return NextResponse.json({ error: "Failed to remove session from log" }, { status: 500 });
  }
}
