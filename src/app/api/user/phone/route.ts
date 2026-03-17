import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const phoneSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+\d{10,15}$/, "Phone number must be in E.164 format (e.g. +15551234567)")
    .or(z.literal("")),
  smsEnabled: z.boolean().optional(),
});

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { phoneNumber: true, smsEnabled: true },
    });

    return NextResponse.json({
      phoneNumber: user?.phoneNumber ?? "",
      smsEnabled: user?.smsEnabled ?? false,
    });
  } catch (error) {
    console.error("Error fetching phone number:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = phoneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid phone number" },
        { status: 400 }
      );
    }

    const phoneNumber = parsed.data.phoneNumber || null;
    const smsEnabled = phoneNumber ? (parsed.data.smsEnabled ?? false) : false;

    await db
      .update(users)
      .set({
        phoneNumber,
        smsEnabled,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating phone number:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
