import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { db, sessionConditions } from "@/lib/db";
import { eq, isNull } from "drizzle-orm";
import { calculateWaveEnergy } from "@/lib/wave-energy";

/**
 * Backfill wave_energy for all session conditions that have swell data
 * but no energy value yet. Pure math — no external API calls.
 */
export async function POST() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all conditions rows missing wave_energy
    const rows = await db
      .select({
        id: sessionConditions.id,
        primarySwellHeight: sessionConditions.primarySwellHeight,
        primarySwellPeriod: sessionConditions.primarySwellPeriod,
      })
      .from(sessionConditions)
      .where(isNull(sessionConditions.waveEnergy));

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const height = row.primarySwellHeight ? parseFloat(row.primarySwellHeight) : null;
      const period = row.primarySwellPeriod ? parseFloat(row.primarySwellPeriod) : null;
      const energy = calculateWaveEnergy(height, period);

      if (energy == null) {
        skipped++;
        continue;
      }

      await db
        .update(sessionConditions)
        .set({ waveEnergy: energy.toString() })
        .where(eq(sessionConditions.id, row.id));

      updated++;
    }

    return NextResponse.json({
      total: rows.length,
      updated,
      skipped,
    });
  } catch (error) {
    console.error("Wave energy backfill error:", error);
    return NextResponse.json(
      { error: "Backfill failed", details: String(error) },
      { status: 500 }
    );
  }
}
