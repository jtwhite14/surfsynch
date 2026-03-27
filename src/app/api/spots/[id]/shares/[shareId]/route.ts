import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, spotShares, loggedFriendSessions, surfSessions } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { shareId } = await params;

    const [deleted] = await db
      .delete(spotShares)
      .where(and(
        eq(spotShares.id, shareId),
        eq(spotShares.sharedByUserId, userId)
      ))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    // Clean up logged friend sessions for the revoked share
    // Remove entries where either party logged the other's sessions at this spot
    if (deleted.sharedWithUserId) {
      const { id: spotId } = await params;
      const friendUserId = deleted.sharedWithUserId;

      // Get session IDs for the friend at this spot
      const friendSessionIds = await db.query.surfSessions.findMany({
        where: and(eq(surfSessions.spotId, spotId), eq(surfSessions.userId, friendUserId)),
        columns: { id: true },
      });

      // Get session IDs for the owner at this spot
      const ownerSessionIds = await db.query.surfSessions.findMany({
        where: and(eq(surfSessions.spotId, spotId), eq(surfSessions.userId, userId)),
        columns: { id: true },
      });

      // Remove owner's logged entries for friend's sessions
      if (friendSessionIds.length > 0) {
        await db.delete(loggedFriendSessions).where(
          and(
            eq(loggedFriendSessions.userId, userId),
            inArray(loggedFriendSessions.sessionId, friendSessionIds.map((s) => s.id))
          )
        );
      }

      // Remove friend's logged entries for owner's sessions
      if (ownerSessionIds.length > 0) {
        await db.delete(loggedFriendSessions).where(
          and(
            eq(loggedFriendSessions.userId, friendUserId),
            inArray(loggedFriendSessions.sessionId, ownerSessionIds.map((s) => s.id))
          )
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error revoking share:", error);
    return NextResponse.json({ error: "Failed to revoke share" }, { status: 500 });
  }
}
