import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getAuthUserId } from "@/lib/auth";
import { db, sessionPhotos, surfSessions } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

// Lazy initialization to avoid build-time errors
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase configuration missing");
  }

  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, and WebP are allowed." },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Compute SHA-256 hash
    const fileHash = createHash("sha256").update(buffer).digest("hex");

    // Check for duplicate in existing sessions
    const existingDupe = await db
      .select({
        photoUrl: sessionPhotos.photoUrl,
        sessionId: surfSessions.id,
        sessionDate: surfSessions.date,
      })
      .from(sessionPhotos)
      .innerJoin(surfSessions, eq(sessionPhotos.sessionId, surfSessions.id))
      .where(
        and(
          eq(sessionPhotos.fileHash, fileHash),
          eq(surfSessions.userId, userId)
        )
      )
      .limit(1);

    if (existingDupe.length > 0) {
      // Duplicate found — return existing URL without re-uploading
      return NextResponse.json({
        url: existingDupe[0].photoUrl,
        fileHash,
        isDuplicate: true,
        existingSession: {
          id: existingDupe[0].sessionId,
          date: existingDupe[0].sessionDate,
        },
      });
    }

    // No duplicate — upload to Supabase
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${userId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from("session-photos")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error("Upload error:", error);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("session-photos").getPublicUrl(data.path);

    return NextResponse.json({ url: publicUrl, fileHash, isDuplicate: false });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
