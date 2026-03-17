import { auth } from "@clerk/nextjs/server";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * Maps a Clerk user ID to an internal UUID.
 * 1. Fast path: lookup by clerkId (indexed)
 * 2. Existing user migration: lookup by email, set clerkId
 * 3. New user: insert with both id + clerkId
 * 4. Race condition safety: catch unique constraint violation, re-select
 */
export async function resolveUser(
  clerkUserId: string,
  email?: string,
  name?: string,
  imageUrl?: string
): Promise<string> {
  // 1. Fast path — lookup by clerkId
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkUserId),
    columns: { id: true },
  });
  if (existing) return existing.id;

  // 2. Existing user migration — lookup by email, link clerkId
  if (email) {
    const byEmail = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    });
    if (byEmail) {
      await db
        .update(users)
        .set({ clerkId: clerkUserId, ...(name && { name }), ...(imageUrl && { image: imageUrl }) })
        .where(eq(users.id, byEmail.id));
      return byEmail.id;
    }
  }

  // 3. New user — insert
  const newId = randomUUID();
  try {
    await db.insert(users).values({
      id: newId,
      clerkId: clerkUserId,
      email: email ?? `${clerkUserId}@clerk.placeholder`,
      name: name ?? null,
      image: imageUrl ?? null,
    });
    return newId;
  } catch (err: unknown) {
    // 4. Race condition — another request inserted first
    if (
      err instanceof Error &&
      err.message.includes("unique")
    ) {
      const retry = await db.query.users.findFirst({
        where: eq(users.clerkId, clerkUserId),
        columns: { id: true },
      });
      if (retry) return retry.id;
    }
    throw err;
  }
}

/**
 * Get the authenticated user's internal UUID.
 * Drop-in replacement for the old `getServerSession(authOptions)` pattern.
 */
export async function getAuthUserId(): Promise<string | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  return resolveUser(clerkUserId);
}
