import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const TEST_USER_EMAIL = "demo@wavebook.test";

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Small jitter around a base value */
function jitter(base: number, range: number): number {
  return parseFloat((base + randomFloat(-range, range)).toFixed(2));
}

/** Build a forecast snapshot with small variations from a base swell event */
function buildForecastSnapshot(base: {
  swellHeight: number; swellPeriod: number; swellDir: number;
  windSpeed: number; windDir: number; airTemp: number; tideHeight: number;
}) {
  const swellHeight = jitter(base.swellHeight, 0.15);
  const swellPeriod = jitter(base.swellPeriod, 0.8);
  const waveEnergy = 0.5 * 1025 * 9.81 * swellHeight * swellHeight * swellPeriod;

  return {
    waveHeight: jitter(swellHeight + 0.2, 0.1),
    wavePeriod: jitter(swellPeriod - 1, 0.5),
    waveDirection: jitter(base.swellDir, 10),
    primarySwellHeight: swellHeight,
    primarySwellPeriod: swellPeriod,
    primarySwellDirection: jitter(base.swellDir, 8),
    secondarySwellHeight: jitter(0.4, 0.1),
    secondarySwellPeriod: jitter(7, 0.5),
    secondarySwellDirection: jitter(base.swellDir + 40, 10),
    windWaveHeight: jitter(0.25, 0.1),
    windWavePeriod: jitter(4, 0.5),
    windWaveDirection: jitter(base.windDir, 15),
    windSpeed: jitter(base.windSpeed, 2),
    windDirection: jitter(base.windDir, 12),
    windGust: jitter(base.windSpeed + 5, 3),
    airTemp: jitter(base.airTemp, 1),
    seaSurfaceTemp: jitter(base.airTemp + 3, 0.5),
    humidity: jitter(72, 8),
    precipitation: 0,
    pressureMsl: jitter(1018, 3),
    cloudCover: jitter(30, 15),
    visibility: jitter(35, 5),
    tideHeight: jitter(base.tideHeight, 0.3),
    waveEnergy: parseFloat(waveEnergy.toFixed(1)),
    weatherCode: pick([0, 1, 2]),
    isDay: true,
    timestamp: new Date().toISOString(),
  };
}

/** Build realistic matchDetails for a session-based alert */
function buildMatchDetails(effectiveScore: number, daysOut: number, sessionRating: number) {
  // Higher effective scores need higher individual similarities
  const baseLevel = effectiveScore / 100;

  const forecastConfidence =
    daysOut <= 1 ? 1.0 :
    daysOut <= 2 ? 0.95 :
    daysOut <= 3 ? 0.9 :
    daysOut <= 4 ? 0.8 :
    daysOut <= 5 ? 0.7 : 0.5;

  const ratingBoost =
    sessionRating === 5 ? 1.0 :
    sessionRating === 4 ? 0.95 : 0.85;

  // Generate individual variable similarities that produce the right weighted score
  const genSim = () => parseFloat(Math.min(1, Math.max(0.2, baseLevel + randomFloat(-0.15, 0.15))).toFixed(2));

  return {
    swellHeight: genSim(),
    swellPeriod: genSim(),
    swellDirection: genSim(),
    tideHeight: genSim(),
    windSpeed: genSim(),
    windDirection: genSim(),
    waveEnergy: genSim(),
    coverage: parseFloat(randomFloat(0.71, 1.0).toFixed(3)),
    ratingBoost,
    forecastConfidence,
  };
}

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("No DATABASE_URL or DIRECT_URL set");
    process.exit(1);
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  // Find test user
  const testUser = await db.query.users.findFirst({
    where: eq(schema.users.email, TEST_USER_EMAIL),
    columns: { id: true },
  });

  if (!testUser) {
    console.error("Test user not found");
    await client.end();
    process.exit(1);
  }

  console.log(`Test user ID: ${testUser.id}`);

  // Get test user's spots
  const spots = await db.query.surfSpots.findMany({
    where: eq(schema.surfSpots.userId, testUser.id),
  });

  console.log(`Found ${spots.length} spots\n`);

  if (spots.length === 0) {
    console.log("No spots found for test user. Nothing to do.");
    await client.end();
    return;
  }

  // Get test user's sessions (to reference as matchedSessionId)
  const sessions = await db.query.surfSessions.findMany({
    where: eq(schema.surfSessions.userId, testUser.id),
  });

  console.log(`Found ${sessions.length} sessions to reference\n`);

  // Clear existing alerts for test user
  await db.delete(schema.spotAlerts).where(eq(schema.spotAlerts.userId, testUser.id));
  console.log("Cleared existing test alerts\n");

  const now = new Date();

  // Base swell event — all 5 alerts share similar conditions (same swell hitting the coast)
  const baseConditions = {
    swellHeight: 1.4,
    swellPeriod: 12,
    swellDir: 210,
    windSpeed: 8,
    windDir: 340,
    airTemp: 5,
    tideHeight: 0.6,
  };

  // 5 alerts: spread across a few spots, different days/windows
  const alertDefs = [
    { daysOut: 0, timeWindow: "dawn"      as const, hour: 6  },
    { daysOut: 1, timeWindow: "dawn"      as const, hour: 7  },
    { daysOut: 1, timeWindow: "midday"    as const, hour: 11 },
    { daysOut: 2, timeWindow: "dawn"      as const, hour: 6  },
    { daysOut: 3, timeWindow: "afternoon" as const, hour: 15 },
  ];

  // Distribute alerts across spots (round-robin)
  let alertCount = 0;

  for (let i = 0; i < alertDefs.length; i++) {
    const def = alertDefs[i];
    const spot = spots[i % spots.length];
    const spotSessions = sessions.filter(s => s.spotId === spot.id);

    const forecastDate = new Date(now);
    forecastDate.setDate(forecastDate.getDate() + def.daysOut);
    forecastDate.setHours(def.hour, 0, 0, 0);

    const matchedSession = spotSessions.length > 0 ? pick(spotSessions) : null;
    const sessionRating = matchedSession?.rating ?? 4;

    const matchScore = randomFloat(78, 94);
    const forecastConfidence =
      def.daysOut <= 1 ? 1.0 :
      def.daysOut <= 2 ? 0.95 :
      def.daysOut <= 3 ? 0.9 : 0.8;
    const ratingBoost = sessionRating === 5 ? 1.0 : sessionRating === 4 ? 0.95 : 0.85;
    const confidenceScore = matchScore * forecastConfidence;
    const effectiveScore = matchScore * forecastConfidence * ratingBoost;

    const forecastSnapshot = buildForecastSnapshot(baseConditions);
    const matchDetails = buildMatchDetails(effectiveScore, def.daysOut, sessionRating);

    await db.insert(schema.spotAlerts).values({
      spotId: spot.id,
      userId: testUser.id,
      forecastHour: forecastDate,
      timeWindow: def.timeWindow,
      matchScore: matchScore.toFixed(2),
      confidenceScore: confidenceScore.toFixed(2),
      effectiveScore: effectiveScore.toFixed(2),
      matchedSessionId: matchedSession?.id ?? null,
      matchedProfileId: null,
      matchDetails,
      forecastSnapshot,
      status: "active",
      expiresAt: forecastDate,
    });

    alertCount++;
    const scoreStr = effectiveScore.toFixed(0);
    const wave = forecastSnapshot.primarySwellHeight;
    const wind = forecastSnapshot.windSpeed;
    console.log(`  ${spot.name} +${def.daysOut}d ${def.timeWindow.padEnd(9)} → ${scoreStr}% (swell: ${wave}m @ ${forecastSnapshot.primarySwellPeriod}s, wind: ${wind}km/h)`);
  }

  console.log(`\nDone: created ${alertCount} alerts`);
  await client.end();
}

main().catch(console.error);
