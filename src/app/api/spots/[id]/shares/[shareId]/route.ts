import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, spotShares } from "@/lib/db";
import { eq, and } from "drizzle-orm";

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error revoking share:", error);
    return NextResponse.json({ error: "Failed to revoke share" }, { status: 500 });
  }
}
