import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const phoneSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+?[\d\s\-()]{7,20}$/, "Invalid phone number")
    .transform((v) => v.replace(/[\s\-()]/g, ""))
    .or(z.literal("")),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { phoneNumber: true },
    });

    return NextResponse.json({ phoneNumber: user?.phoneNumber ?? "" });
  } catch (error) {
    console.error("Error fetching phone number:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = phoneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    await db
      .update(users)
      .set({
        phoneNumber: parsed.data.phoneNumber || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating phone number:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
