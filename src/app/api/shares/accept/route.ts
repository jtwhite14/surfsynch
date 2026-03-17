import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, spotShares } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const acceptSchema = z.object({
  inviteCode: z.string().min(1),
  action: z.enum(["accept", "decline"]),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { inviteCode, action } = acceptSchema.parse(body);

    const share = await db.query.spotShares.findFirst({
      where: and(
        eq(spotShares.inviteCode, inviteCode),
        eq(spotShares.sharedWithUserId, userId),
        eq(spotShares.status, "pending")
      ),
    });

    if (!share) {
      return NextResponse.json({ error: "Invite not found or already responded" }, { status: 404 });
    }

    const [updated] = await db
      .update(spotShares)
      .set({
        status: action === "accept" ? "accepted" : "declined",
        respondedAt: new Date(),
      })
      .where(eq(spotShares.id, share.id))
      .returning();

    return NextResponse.json({ share: updated });
  } catch (error) {
    console.error("Error responding to invite:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to respond to invite" }, { status: 500 });
  }
}
