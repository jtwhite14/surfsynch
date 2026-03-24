import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, spotShares, surfSpots } from "@/lib/db";
import { eq, and, count, isNotNull } from "drizzle-orm";
import { generateInviteCode } from "@/lib/sharing/invite-code";

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

    // Verify the user has access to this spot (owner or accepted share recipient)
    const spot = await db.query.surfSpots.findFirst({
      where: eq(surfSpots.id, spotId),
    });

    if (!spot) {
      return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    }

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

    // Check 5-share limit — only count claimed shares (sharedWithUserId is not null)
    const [shareCount] = await db
      .select({ count: count() })
      .from(spotShares)
      .where(and(
        eq(spotShares.spotId, spotId),
        eq(spotShares.sharedByUserId, userId),
        isNotNull(spotShares.sharedWithUserId)
      ));

    if (shareCount.count >= 5) {
      return NextResponse.json({ error: "Maximum 5 shares per spot reached" }, { status: 400 });
    }

    const inviteCode = generateInviteCode();
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${inviteCode}`;

    const [share] = await db
      .insert(spotShares)
      .values({
        spotId,
        sharedByUserId: userId,
        inviteCode,
      })
      .returning();

    return NextResponse.json({
      share: {
        ...share,
        inviteUrl,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating share:", error);
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

    const sharesWithUrls = shares.map((share) => ({
      ...share,
      inviteUrl: !share.sharedWithUserId
        ? `${process.env.NEXT_PUBLIC_APP_URL}/invite/${share.inviteCode}`
        : undefined,
    }));

    return NextResponse.json({ shares: sharesWithUrls });
  } catch (error) {
    console.error("Error fetching shares:", error);
    return NextResponse.json({ error: "Failed to fetch shares" }, { status: 500 });
  }
}
