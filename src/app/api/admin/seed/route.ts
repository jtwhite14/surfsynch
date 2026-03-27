import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { db, surfSpots, spotShares } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { generateInviteCode } from "@/lib/sharing/invite-code";

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { action, spotId } = await request.json();

    if (action === "alerts" || action === "all") {
      const computed = await computeAlerts(userId, spotId, request);
      if (action === "alerts") {
        return NextResponse.json({ message: `Computed alerts for ${computed} spot${computed === 1 ? "" : "s"}` });
      }
    }

    if (action === "share" || action === "all") {
      const result = await createShareLink(userId, spotId, request);
      if (action === "share") {
        return NextResponse.json({ message: "Share link created", inviteUrl: result });
      }
    }

    if (action === "all") {
      return NextResponse.json({ message: "Computed alerts and created share link" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Admin seed error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Seed failed" },
      { status: 500 },
    );
  }
}

async function computeAlerts(userId: string, spotId: string | undefined, request: NextRequest): Promise<number> {
  const spots = spotId
    ? await db.query.surfSpots.findMany({
        where: and(eq(surfSpots.id, spotId), eq(surfSpots.userId, userId)),
      })
    : await db.query.surfSpots.findMany({
        where: eq(surfSpots.userId, userId),
      });

  const origin = new URL(request.url).origin;
  let computed = 0;

  for (const spot of spots) {
    try {
      const res = await fetch(`${origin}/api/spots/${spot.id}/compute-alerts`, {
        method: "POST",
        headers: { cookie: request.headers.get("cookie") || "" },
      });
      if (res.ok) computed++;
    } catch (err) {
      console.error(`Alert computation failed for ${spot.name}:`, err);
    }
  }
  return computed;
}

async function createShareLink(userId: string, spotId: string | undefined, request: NextRequest): Promise<string> {
  let spot;
  if (spotId) {
    spot = await db.query.surfSpots.findFirst({
      where: and(eq(surfSpots.id, spotId), eq(surfSpots.userId, userId)),
    });
  } else {
    spot = await db.query.surfSpots.findFirst({
      where: eq(surfSpots.userId, userId),
    });
  }

  if (!spot) {
    throw new Error("No spots found — create a spot first");
  }

  const inviteCode = generateInviteCode();
  const origin = new URL(request.url).origin;

  await db.insert(spotShares).values({
    spotId: spot.id,
    sharedByUserId: userId,
    inviteCode,
  });

  return `${origin}/invite/${inviteCode}`;
}
