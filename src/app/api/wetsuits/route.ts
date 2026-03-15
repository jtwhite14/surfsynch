import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, wetsuits } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const wetsuitSchema = z.object({
  name: z.string().min(1).max(255),
  brand: z.string().max(255).optional().nullable(),
  thickness: z.string().max(20).optional().nullable(),
  style: z.enum(["fullsuit", "springsuit", "shorty", "top", "shorts"]).optional().nullable(),
  entry: z.enum(["chest_zip", "back_zip", "zipperless"]).optional().nullable(),
  size: z.enum(["XS", "S", "MS", "M", "MT", "L", "LS", "LT", "XL", "XXL"]).optional().nullable(),
  notes: z.string().optional().nullable(),
  retired: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const suits = await db.query.wetsuits.findMany({
      where: eq(wetsuits.userId, session.user.id),
      orderBy: (wetsuits, { desc }) => [desc(wetsuits.createdAt)],
    });

    return NextResponse.json({ wetsuits: suits });
  } catch (error) {
    console.error("Error fetching wetsuits:", error);
    return NextResponse.json({ error: "Failed to fetch wetsuits" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = wetsuitSchema.parse(body);

    const [suit] = await db
      .insert(wetsuits)
      .values({
        userId: session.user.id,
        name: validated.name,
        brand: validated.brand || null,
        thickness: validated.thickness || null,
        style: validated.style || null,
        entry: validated.entry || null,
        size: validated.size || null,
        notes: validated.notes || null,
        retired: validated.retired ?? false,
      })
      .returning();

    return NextResponse.json({ wetsuit: suit }, { status: 201 });
  } catch (error) {
    console.error("Error creating wetsuit:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create wetsuit" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Valid wetsuit ID required" }, { status: 400 });
    }

    const body = await request.json();
    const validated = wetsuitSchema.partial().parse(body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (validated.name !== undefined) updates.name = validated.name;
    if (validated.brand !== undefined) updates.brand = validated.brand || null;
    if (validated.thickness !== undefined) updates.thickness = validated.thickness || null;
    if (validated.style !== undefined) updates.style = validated.style || null;
    if (validated.entry !== undefined) updates.entry = validated.entry || null;
    if (validated.size !== undefined) updates.size = validated.size || null;
    if (validated.notes !== undefined) updates.notes = validated.notes || null;
    if (validated.retired !== undefined) updates.retired = validated.retired;

    const [updated] = await db
      .update(wetsuits)
      .set(updates)
      .where(and(eq(wetsuits.id, id), eq(wetsuits.userId, session.user.id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Wetsuit not found" }, { status: 404 });
    }

    return NextResponse.json({ wetsuit: updated });
  } catch (error) {
    console.error("Error updating wetsuit:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update wetsuit" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Valid wetsuit ID required" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(wetsuits)
      .where(and(eq(wetsuits.id, id), eq(wetsuits.userId, session.user.id)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Wetsuit not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting wetsuit:", error);
    return NextResponse.json({ error: "Failed to delete wetsuit" }, { status: 500 });
  }
}
