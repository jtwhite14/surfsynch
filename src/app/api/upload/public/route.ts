import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db, uploadSessions, uploadPhotos, sessionPhotos, surfSessions } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
];

// Lazy initialization to avoid build-time errors
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration missing");
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const token = formData.get("token") as string;
    const exifDataRaw = formData.get("exifData") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ error: "No token provided" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.",
        },
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

    // Validate token - find upload session
    const uploadSession = await db.query.uploadSessions.findFirst({
      where: eq(uploadSessions.token, token),
    });

    if (!uploadSession) {
      return NextResponse.json(
        { error: "Invalid upload token" },
        { status: 401 }
      );
    }

    // Check expiration
    if (new Date() > uploadSession.expiresAt) {
      return NextResponse.json(
        { error: "Upload session has expired" },
        { status: 410 }
      );
    }

    // Check status
    if (uploadSession.status === "completed") {
      return NextResponse.json(
        { error: "Upload session is already completed" },
        { status: 400 }
      );
    }

    // Update status to 'uploading' if currently 'pending'
    if (uploadSession.status === "pending") {
      await db
        .update(uploadSessions)
        .set({ status: "uploading" })
        .where(eq(uploadSessions.id, uploadSession.id));
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Compute SHA-256 hash of the file content
    const fileHash = createHash("sha256").update(buffer).digest("hex");

    // Parse exif data if provided
    let parsedExifData = null;
    if (exifDataRaw) {
      try {
        parsedExifData = JSON.parse(exifDataRaw);
      } catch {
        // Ignore invalid JSON for exif data
      }
    }

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
          eq(surfSessions.userId, uploadSession.userId)
        )
      )
      .limit(1);

    // Check for duplicate in current upload batch
    const batchDupe = await db.query.uploadPhotos.findFirst({
      where: and(
        eq(uploadPhotos.fileHash, fileHash),
        eq(uploadPhotos.uploadSessionId, uploadSession.id)
      ),
    });

    const isDuplicate = existingDupe.length > 0 || !!batchDupe;
    let publicUrl: string;

    if (existingDupe.length > 0) {
      // Duplicate exists in a previous session — skip Supabase upload
      publicUrl = existingDupe[0].photoUrl;
    } else if (batchDupe) {
      // Duplicate exists in current upload batch — skip Supabase upload
      publicUrl = batchDupe.photoUrl;
    } else {
      // No duplicate — upload to Supabase
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `${uploadSession.userId}/${Date.now()}-${Math.random()
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
        data: { publicUrl: url },
      } = supabase.storage.from("session-photos").getPublicUrl(data.path);
      publicUrl = url;
    }

    // Insert upload photo record with hash + duplicate metadata
    const [photo] = await db
      .insert(uploadPhotos)
      .values({
        uploadSessionId: uploadSession.id,
        photoUrl: publicUrl,
        exifData: parsedExifData,
        fileHash,
        isDuplicate,
        existingSessionId: existingDupe[0]?.sessionId ?? null,
        existingSessionDate: existingDupe[0]?.sessionDate ?? null,
      })
      .returning();

    return NextResponse.json(
      {
        photo: {
          id: photo.id,
          photoUrl: photo.photoUrl,
          isDuplicate,
          existingSession: existingDupe[0]
            ? { id: existingDupe[0].sessionId, date: existingDupe[0].sessionDate }
            : null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error uploading photo:", error);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 }
    );
  }
}
