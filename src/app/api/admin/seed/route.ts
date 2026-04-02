import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { resolveUser } from "@/lib/auth";
import { isAdmin, getOrCreateTestUser, getOrCreateFakeShareUsers, FAKE_SHARE_USERS } from "@/lib/admin";
import { db, surfSpots, spotShares, surfSessions, sessionConditions } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";
import { generateInviteCode } from "@/lib/sharing/invite-code";

type SurfSpot = typeof surfSpots.$inferSelect;

async function findUserSpot(userId: string, spotId: string | undefined): Promise<SurfSpot> {
  const spot = await db.query.surfSpots.findFirst({
    where: spotId
      ? and(eq(surfSpots.id, spotId), eq(surfSpots.userId, userId))
      : eq(surfSpots.userId, userId),
  });
  if (!spot) throw new Error("No spots found — create a spot first");
  return spot;
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin via Clerk directly (bypass test-mode impersonation)
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const realUserId = await resolveUser(clerkUserId);
    if (!(await isAdmin(realUserId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Always seed against the test user's data
    const testUserId = await getOrCreateTestUser();
    const { action, spotId } = await request.json();

    if (action === "alerts" || action === "all") {
      const computed = await computeAlerts(testUserId, spotId, request);
      if (action === "alerts") {
        return NextResponse.json({ message: `Computed alerts for ${computed} spot${computed === 1 ? "" : "s"}` });
      }
    }

    if (action === "share" || action === "all") {
      const result = await createShareLink(testUserId, spotId, request);
      if (action === "share") {
        return NextResponse.json({ message: "Share link created", inviteUrl: result });
      }
    }

    // For "all", create accepted shares once and pass IDs through to friend-session
    let fakeUserIds: string[] | undefined;

    if (action === "accepted-share" || action === "all") {
      const result = await createAcceptedShares(testUserId, spotId);
      fakeUserIds = result.fakeUserIds;
      if (action === "accepted-share") {
        return NextResponse.json({ message: result.message });
      }
    }

    if (action === "friend-session" || action === "all") {
      const result = await createFriendSession(testUserId, spotId, fakeUserIds);
      if (action === "friend-session") {
        return NextResponse.json({ message: result });
      }
    }

    if (action === "all") {
      return NextResponse.json({ message: "Computed alerts, created share link, seeded accepted shares, and created friend session" });
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
  const spot = await findUserSpot(userId, spotId);

  const inviteCode = generateInviteCode();
  const origin = new URL(request.url).origin;

  await db.insert(spotShares).values({
    spotId: spot.id,
    sharedByUserId: userId,
    inviteCode,
  });

  return `${origin}/invite/${inviteCode}`;
}

async function createAcceptedShares(userId: string, spotId: string | undefined): Promise<{ message: string; fakeUserIds: string[] }> {
  const spot = await findUserSpot(userId, spotId);
  const fakeUserIds = await getOrCreateFakeShareUsers();
  let created = 0;

  for (const fakeUserId of fakeUserIds) {
    const existing = await db.query.spotShares.findFirst({
      where: and(
        eq(spotShares.spotId, spot.id),
        eq(spotShares.sharedWithUserId, fakeUserId),
      ),
    });
    if (existing) continue;

    await db.insert(spotShares).values({
      spotId: spot.id,
      sharedByUserId: userId,
      sharedWithUserId: fakeUserId,
      status: "accepted",
      inviteCode: generateInviteCode(),
      respondedAt: new Date(),
    });
    created++;
  }

  const message = created > 0
    ? `Created ${created} accepted share(s) on "${spot.name}"`
    : `Accepted shares already exist on "${spot.name}"`;

  return { message, fakeUserIds };
}

async function createFriendSession(userId: string, spotId: string | undefined, existingFakeUserIds?: string[]): Promise<string> {
  const spot = await findUserSpot(userId, spotId);

  // Ensure accepted shares exist if called standalone
  const fakeUserIds = existingFakeUserIds ?? (await createAcceptedShares(userId, spotId)).fakeUserIds;
  const friendUserId = fakeUserIds[0];
  const friendName = FAKE_SHARE_USERS[0].name;

  // Check if friend already has a session on this spot
  const existingFriendSession = await db.query.surfSessions.findFirst({
    where: and(
      eq(surfSessions.spotId, spot.id),
      eq(surfSessions.userId, friendUserId),
    ),
  });
  if (existingFriendSession) {
    return `Friend session already exists on "${spot.name}"`;
  }

  // Find the most recent session from the test user on this spot to duplicate
  const sourceSession = await db.query.surfSessions.findFirst({
    where: and(
      eq(surfSessions.spotId, spot.id),
      eq(surfSessions.userId, userId),
    ),
    orderBy: [desc(surfSessions.date)],
    with: { conditions: true },
  });

  if (!sourceSession) {
    throw new Error(`No sessions found on "${spot.name}" — log a session first`);
  }

  // Create a duplicate session for the friend, shifted back 2 days
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  const friendDate = new Date(new Date(sourceSession.date).getTime() - twoDaysMs);
  const friendStartTime = new Date(new Date(sourceSession.startTime).getTime() - twoDaysMs);
  const friendEndTime = sourceSession.endTime
    ? new Date(new Date(sourceSession.endTime).getTime() - twoDaysMs)
    : null;

  const [newSession] = await db.insert(surfSessions).values({
    spotId: spot.id,
    userId: friendUserId,
    date: friendDate,
    startTime: friendStartTime,
    endTime: friendEndTime,
    rating: Math.min(sourceSession.rating + 1, 5),
    notes: "Epic morning session, caught some great sets!",
    photoUrl: sourceSession.photoUrl,
  }).returning();

  // Duplicate conditions if the source had them
  if (sourceSession.conditions) {
    const { id, sessionId, createdAt, ...conditionValues } = sourceSession.conditions;
    await db.insert(sessionConditions).values({
      sessionId: newSession.id,
      ...conditionValues,
      timestamp: friendDate,
    });
  }

  return `Created friend session on "${spot.name}" for ${friendName}`;
}
