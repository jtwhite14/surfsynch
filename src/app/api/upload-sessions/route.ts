import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, uploadSessions } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export async function POST() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    const [uploadSession] = await db
      .insert(uploadSessions)
      .values({
        userId: userId,
        token,
        status: "pending",
        expiresAt,
      })
      .returning();

    return NextResponse.json(
      {
        id: uploadSession.id,
        token: uploadSession.token,
        expiresAt: uploadSession.expiresAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating upload session:", error);
    return NextResponse.json(
      { error: "Failed to create upload session" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Upload session ID required" },
        { status: 400 }
      );
    }

    const uploadSession = await db.query.uploadSessions.findFirst({
      where: and(
        eq(uploadSessions.id, id),
        eq(uploadSessions.userId, userId)
      ),
      with: {
        photos: true,
      },
    });

    if (!uploadSession) {
      return NextResponse.json(
        { error: "Upload session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ uploadSession });
  } catch (error) {
    console.error("Error fetching upload session:", error);
    return NextResponse.json(
      { error: "Failed to fetch upload session" },
      { status: 500 }
    );
  }
}
