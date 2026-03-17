import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, spotShares } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const invites = await db.query.spotShares.findMany({
      where: and(
        eq(spotShares.sharedWithUserId, userId),
        eq(spotShares.status, "pending")
      ),
      with: {
        spot: {
          columns: { id: true, name: true, latitude: true, longitude: true },
        },
        sharedBy: {
          columns: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({ invites });
  } catch (error) {
    console.error("Error fetching incoming invites:", error);
    return NextResponse.json({ error: "Failed to fetch invites" }, { status: 500 });
  }
}
