import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, spotShares, surfSpots, users } from "@/lib/db";
import { eq, and, count } from "drizzle-orm";
import { z } from "zod";
import { generateInviteCode } from "@/lib/sharing/invite-code";

const createShareSchema = z.object({
  email: z.string().email(),
});

export async function POST(
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
    const { email } = createShareSchema.parse(body);

    // Verify the user has access to this spot (owner or accepted share recipient)
    const spot = await db.query.surfSpots.findFirst({
      where: eq(surfSpots.id, spotId),
    });

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    // Allow sharing if user owns the spot OR has an accepted share
    const isOwner = spot.userId === userId;
    if (!isOwner) {
      const existingShare = await db.query.spotShares.findFirst({
        where: and(
          eq(spotShares.spotId, spotId),
          eq(spotShares.sharedWithUserId, userId),
          eq(spotShares.status, "accepted")
        ),
      });
      if (!existingShare) {
        return NextResponse.json({ error: "Spot not found" }, { status: 404 });
      }
    }

    // Look up target user
    const targetUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!targetUser) {
      return NextResponse.json({ error: "No Wavebook user found with that email" }, { status: 404 });
    }

    // Can't share with self
    if (targetUser.id === userId) {
      return NextResponse.json({ error: "You can't share a spot with yourself" }, { status: 400 });
    }

    // Check 5-share limit (shares sent by this user for this spot)
    const [shareCount] = await db
      .select({ count: count() })
      .from(spotShares)
      .where(and(
        eq(spotShares.spotId, spotId),
        eq(spotShares.sharedByUserId, userId)
      ));

    if (shareCount.count >= 5) {
      return NextResponse.json({ error: "Maximum 5 shares per spot reached" }, { status: 400 });
    }

    // Check for duplicate
    const existing = await db.query.spotShares.findFirst({
      where: and(
        eq(spotShares.spotId, spotId),
        eq(spotShares.sharedByUserId, userId),
        eq(spotShares.sharedWithUserId, targetUser.id)
      ),
    });

    if (existing) {
      return NextResponse.json({ error: "Already shared with this user" }, { status: 400 });
    }

    const inviteCode = generateInviteCode();

    const [share] = await db
      .insert(spotShares)
      .values({
        spotId,
        sharedByUserId: userId,
        sharedWithUserId: targetUser.id,
        inviteCode,
      })
      .returning();

    return NextResponse.json({
      share: {
        ...share,
        sharedWith: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
        },
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating share:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create share" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: spotId } = await params;

    // Verify spot ownership
    const spot = await db.query.surfSpots.findFirst({
      where: and(
        eq(surfSpots.id, spotId),
        eq(surfSpots.userId, userId)
      ),
    });

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

    const shares = await db.query.spotShares.findMany({
      where: and(
        eq(spotShares.spotId, spotId),
        eq(spotShares.sharedByUserId, userId)
      ),
      with: {
        sharedWith: {
          columns: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({ shares });
  } catch (error) {
    console.error("Error fetching shares:", error);
    return NextResponse.json({ error: "Failed to fetch shares" }, { status: 500 });
  }
}
