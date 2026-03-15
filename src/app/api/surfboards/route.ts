import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, surfboards } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const surfboardSchema = z.object({
  name: z.string().min(1).max(255),
  brand: z.string().max(255).optional().nullable(),
  model: z.string().max(255).optional().nullable(),
  boardType: z.enum(["shortboard", "longboard", "fish", "funboard", "midlength", "gun", "foamie", "SUP"]).optional().nullable(),
  lengthInches: z.number().min(36).max(240).optional().nullable(),
  width: z.number().min(14).max(35).optional().nullable(),
  thickness: z.number().min(1).max(6).optional().nullable(),
  volume: z.number().min(10).max(300).optional().nullable(),
  finSetup: z.enum(["thruster", "quad", "twin", "single", "2+1", "five", "none"]).optional().nullable(),
  tailShape: z.enum(["squash", "round", "pin", "swallow", "fish", "diamond"]).optional().nullable(),
  notes: z.string().optional().nullable(),
  retired: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const boards = await db.query.surfboards.findMany({
      where: eq(surfboards.userId, session.user.id),
      orderBy: (surfboards, { desc }) => [desc(surfboards.createdAt)],
    });

    return NextResponse.json({ surfboards: boards });
  } catch (error) {
    console.error("Error fetching surfboards:", error);
    return NextResponse.json({ error: "Failed to fetch surfboards" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = surfboardSchema.parse(body);

    const [board] = await db
      .insert(surfboards)
      .values({
        userId: session.user.id,
        name: validated.name,
        brand: validated.brand || null,
        model: validated.model || null,
        boardType: validated.boardType || null,
        lengthInches: validated.lengthInches?.toString() || null,
        width: validated.width?.toString() || null,
        thickness: validated.thickness?.toString() || null,
        volume: validated.volume?.toString() || null,
        finSetup: validated.finSetup || null,
        tailShape: validated.tailShape || null,
        notes: validated.notes || null,
        retired: validated.retired ?? false,
      })
      .returning();

    return NextResponse.json({ surfboard: board }, { status: 201 });
  } catch (error) {
    console.error("Error creating surfboard:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create surfboard" }, { status: 500 });
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
      return NextResponse.json({ error: "Valid surfboard ID required" }, { status: 400 });
    }

    const body = await request.json();
    const validated = surfboardSchema.partial().parse(body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (validated.name !== undefined) updates.name = validated.name;
    if (validated.brand !== undefined) updates.brand = validated.brand || null;
    if (validated.model !== undefined) updates.model = validated.model || null;
    if (validated.boardType !== undefined) updates.boardType = validated.boardType || null;
    if (validated.lengthInches !== undefined) updates.lengthInches = validated.lengthInches?.toString() || null;
    if (validated.width !== undefined) updates.width = validated.width?.toString() || null;
    if (validated.thickness !== undefined) updates.thickness = validated.thickness?.toString() || null;
    if (validated.volume !== undefined) updates.volume = validated.volume?.toString() || null;
    if (validated.finSetup !== undefined) updates.finSetup = validated.finSetup || null;
    if (validated.tailShape !== undefined) updates.tailShape = validated.tailShape || null;
    if (validated.notes !== undefined) updates.notes = validated.notes || null;
    if (validated.retired !== undefined) updates.retired = validated.retired;

    const [updated] = await db
      .update(surfboards)
      .set(updates)
      .where(and(eq(surfboards.id, id), eq(surfboards.userId, session.user.id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Surfboard not found" }, { status: 404 });
    }

    return NextResponse.json({ surfboard: updated });
  } catch (error) {
    console.error("Error updating surfboard:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update surfboard" }, { status: 500 });
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
      return NextResponse.json({ error: "Valid surfboard ID required" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(surfboards)
      .where(and(eq(surfboards.id, id), eq(surfboards.userId, session.user.id)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Surfboard not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting surfboard:", error);
    return NextResponse.json({ error: "Failed to delete surfboard" }, { status: 500 });
  }
}
