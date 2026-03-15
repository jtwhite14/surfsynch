import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const MARINE_API_BASE = "https://marine-api.open-meteo.com/v1/marine";
const HISTORICAL_API_BASE = "https://archive-api.open-meteo.com/v1/era5";

const MARINE_PARAMS = [
  "wave_height", "wave_period", "wave_direction",
  "swell_wave_height", "swell_wave_period", "swell_wave_direction",
  "secondary_swell_wave_height", "secondary_swell_wave_period", "secondary_swell_wave_direction",
  "wind_wave_height", "wind_wave_period", "wind_wave_direction",
].join(",");

const WEATHER_PARAMS = [
  "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
  "temperature_2m", "relative_humidity_2m", "precipitation",
  "pressure_msl", "cloud_cover", "visibility",
].join(",");

interface Conditions {
  waveHeight: number | null;
  wavePeriod: number | null;
  waveDirection: number | null;
  primarySwellHeight: number | null;
  primarySwellPeriod: number | null;
  primarySwellDirection: number | null;
  secondarySwellHeight: number | null;
  secondarySwellPeriod: number | null;
  secondarySwellDirection: number | null;
  windWaveHeight: number | null;
  windWavePeriod: number | null;
  windWaveDirection: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  airTemp: number | null;
  seaSurfaceTemp: number | null;
  humidity: number | null;
  precipitation: number | null;
  pressureMsl: number | null;
  cloudCover: number | null;
  visibility: number | null;
  timestamp: Date;
}

async function fetchHistorical(lat: number, lng: number, date: Date): Promise<Conditions | null> {
  const dateStr = date.toISOString().split("T")[0];

  // Marine API for wave/swell data (supports historical dates)
  const marineParams = new URLSearchParams({
    latitude: lat.toString(), longitude: lng.toString(),
    start_date: dateStr, end_date: dateStr,
    hourly: MARINE_PARAMS, timezone: "auto",
  });

  // ERA5 for weather data
  const weatherParams = new URLSearchParams({
    latitude: lat.toString(), longitude: lng.toString(),
    start_date: dateStr, end_date: dateStr,
    hourly: [
      "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
      "temperature_2m", "sea_surface_temperature",
      "relative_humidity_2m", "precipitation", "pressure_msl",
      "cloud_cover", "visibility",
    ].join(","),
    timezone: "auto",
  });

  try {
    const [marineRes, weatherRes] = await Promise.all([
      fetch(`${MARINE_API_BASE}?${marineParams}`),
      fetch(`${HISTORICAL_API_BASE}?${weatherParams}`),
    ]);

    if (!marineRes.ok && !weatherRes.ok) return null;

    const marine = marineRes.ok ? await marineRes.json() : null;
    const weather = weatherRes.ok ? await weatherRes.json() : null;

    const times: string[] = marine?.hourly?.time || weather?.hourly?.time || [];
    if (times.length === 0) return null;

    const targetHour = date.getUTCHours();
    let closestIndex = 0;
    let minDiff = Infinity;
    times.forEach((time: string, index: number) => {
      const diff = Math.abs(new Date(time).getUTCHours() - targetHour);
      if (diff < minDiff) { minDiff = diff; closestIndex = index; }
    });

    return {
      waveHeight: marine?.hourly?.wave_height?.[closestIndex] ?? null,
      wavePeriod: marine?.hourly?.wave_period?.[closestIndex] ?? null,
      waveDirection: marine?.hourly?.wave_direction?.[closestIndex] ?? null,
      primarySwellHeight: marine?.hourly?.swell_wave_height?.[closestIndex] ?? null,
      primarySwellPeriod: marine?.hourly?.swell_wave_period?.[closestIndex] ?? null,
      primarySwellDirection: marine?.hourly?.swell_wave_direction?.[closestIndex] ?? null,
      secondarySwellHeight: marine?.hourly?.secondary_swell_wave_height?.[closestIndex] ?? null,
      secondarySwellPeriod: marine?.hourly?.secondary_swell_wave_period?.[closestIndex] ?? null,
      secondarySwellDirection: marine?.hourly?.secondary_swell_wave_direction?.[closestIndex] ?? null,
      windWaveHeight: marine?.hourly?.wind_wave_height?.[closestIndex] ?? null,
      windWavePeriod: marine?.hourly?.wind_wave_period?.[closestIndex] ?? null,
      windWaveDirection: marine?.hourly?.wind_wave_direction?.[closestIndex] ?? null,
      windSpeed: weather?.hourly?.wind_speed_10m?.[closestIndex] ?? null,
      windDirection: weather?.hourly?.wind_direction_10m?.[closestIndex] ?? null,
      windGust: weather?.hourly?.wind_gusts_10m?.[closestIndex] ?? null,
      airTemp: weather?.hourly?.temperature_2m?.[closestIndex] ?? null,
      seaSurfaceTemp: weather?.hourly?.sea_surface_temperature?.[closestIndex] ?? null,
      humidity: weather?.hourly?.relative_humidity_2m?.[closestIndex] ?? null,
      precipitation: weather?.hourly?.precipitation?.[closestIndex] ?? null,
      pressureMsl: weather?.hourly?.pressure_msl?.[closestIndex] ?? null,
      cloudCover: weather?.hourly?.cloud_cover?.[closestIndex] ?? null,
      visibility: weather?.hourly?.visibility?.[closestIndex] ?? null,
      timestamp: new Date(times[closestIndex]),
    };
  } catch {
    return null;
  }
}

async function fetchCurrent(lat: number, lng: number): Promise<Conditions | null> {
  try {
    const marineParams = new URLSearchParams({
      latitude: lat.toString(), longitude: lng.toString(),
      hourly: MARINE_PARAMS, forecast_days: "1", timezone: "auto",
    });
    const weatherParams = new URLSearchParams({
      latitude: lat.toString(), longitude: lng.toString(),
      hourly: WEATHER_PARAMS, forecast_days: "1", timezone: "auto",
    });

    const [marineRes, weatherRes] = await Promise.all([
      fetch(`${MARINE_API_BASE}?${marineParams}`),
      fetch(`https://api.open-meteo.com/v1/forecast?${weatherParams}`),
    ]);

    if (!marineRes.ok) return null;
    const marine = await marineRes.json();
    const weather = weatherRes.ok ? await weatherRes.json() : null;

    const now = new Date();
    let idx = 0;
    let minDiff = Infinity;
    (marine.hourly.time as string[]).forEach((t: string, i: number) => {
      const diff = Math.abs(new Date(t).getTime() - now.getTime());
      if (diff < minDiff) { minDiff = diff; idx = i; }
    });

    return {
      waveHeight: marine.hourly.wave_height?.[idx] ?? null,
      wavePeriod: marine.hourly.wave_period?.[idx] ?? null,
      waveDirection: marine.hourly.wave_direction?.[idx] ?? null,
      primarySwellHeight: marine.hourly.swell_wave_height?.[idx] ?? null,
      primarySwellPeriod: marine.hourly.swell_wave_period?.[idx] ?? null,
      primarySwellDirection: marine.hourly.swell_wave_direction?.[idx] ?? null,
      secondarySwellHeight: marine.hourly.secondary_swell_wave_height?.[idx] ?? null,
      secondarySwellPeriod: marine.hourly.secondary_swell_wave_period?.[idx] ?? null,
      secondarySwellDirection: marine.hourly.secondary_swell_wave_direction?.[idx] ?? null,
      windWaveHeight: marine.hourly.wind_wave_height?.[idx] ?? null,
      windWavePeriod: marine.hourly.wind_wave_period?.[idx] ?? null,
      windWaveDirection: marine.hourly.wind_wave_direction?.[idx] ?? null,
      windSpeed: weather?.hourly?.wind_speed_10m?.[idx] ?? null,
      windDirection: weather?.hourly?.wind_direction_10m?.[idx] ?? null,
      windGust: weather?.hourly?.wind_gusts_10m?.[idx] ?? null,
      airTemp: weather?.hourly?.temperature_2m?.[idx] ?? null,
      seaSurfaceTemp: weather?.hourly?.sea_surface_temperature?.[idx] ?? null,
      humidity: weather?.hourly?.relative_humidity_2m?.[idx] ?? null,
      precipitation: weather?.hourly?.precipitation?.[idx] ?? null,
      pressureMsl: weather?.hourly?.pressure_msl?.[idx] ?? null,
      cloudCover: weather?.hourly?.cloud_cover?.[idx] ?? null,
      visibility: weather?.hourly?.visibility?.[idx] ?? null,
      timestamp: new Date(marine.hourly.time[idx]),
    };
  } catch {
    return null;
  }
}

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("No DATABASE_URL or DIRECT_URL set");
    process.exit(1);
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  const allSessions = await db.query.surfSessions.findMany({
    with: { conditions: true, spot: true },
  });

  console.log(`Found ${allSessions.length} sessions to backfill`);

  let updated = 0;
  let failed = 0;

  for (const s of allSessions) {
    if (!s.spot) { console.log(`  Skip ${s.id}: no spot`); failed++; continue; }

    const lat = parseFloat(s.spot.latitude);
    const lng = parseFloat(s.spot.longitude);
    const sessionDate = new Date(s.startTime);

    console.log(`  Processing ${s.id} (${s.spot.name}, ${sessionDate.toISOString().split("T")[0]})...`);

    let conditions = await fetchHistorical(lat, lng, sessionDate);
    if (!conditions) {
      console.log(`    Historical failed, trying current...`);
      conditions = await fetchCurrent(lat, lng);
    }

    if (!conditions) {
      console.log(`    FAILED: no conditions available`);
      failed++;
      continue;
    }

    const values = {
      waveHeight: conditions.waveHeight?.toString() || null,
      wavePeriod: conditions.wavePeriod?.toString() || null,
      waveDirection: conditions.waveDirection?.toString() || null,
      primarySwellHeight: conditions.primarySwellHeight?.toString() || null,
      primarySwellPeriod: conditions.primarySwellPeriod?.toString() || null,
      primarySwellDirection: conditions.primarySwellDirection?.toString() || null,
      secondarySwellHeight: conditions.secondarySwellHeight?.toString() || null,
      secondarySwellPeriod: conditions.secondarySwellPeriod?.toString() || null,
      secondarySwellDirection: conditions.secondarySwellDirection?.toString() || null,
      windWaveHeight: conditions.windWaveHeight?.toString() || null,
      windWavePeriod: conditions.windWavePeriod?.toString() || null,
      windWaveDirection: conditions.windWaveDirection?.toString() || null,
      windSpeed: conditions.windSpeed?.toString() || null,
      windDirection: conditions.windDirection?.toString() || null,
      windGust: conditions.windGust?.toString() || null,
      airTemp: conditions.airTemp?.toString() || null,
      seaSurfaceTemp: conditions.seaSurfaceTemp?.toString() || null,
      humidity: conditions.humidity?.toString() || null,
      precipitation: conditions.precipitation?.toString() || null,
      pressureMsl: conditions.pressureMsl?.toString() || null,
      cloudCover: conditions.cloudCover?.toString() || null,
      visibility: conditions.visibility?.toString() || null,
      timestamp: conditions.timestamp,
    };

    if (s.conditions) {
      await db.update(schema.sessionConditions).set(values)
        .where(eq(schema.sessionConditions.sessionId, s.id));
    } else {
      await db.insert(schema.sessionConditions).values({ sessionId: s.id, ...values });
    }

    updated++;
    console.log(`    OK (wave: ${conditions.waveHeight}m, wind: ${conditions.windSpeed}km/h, gust: ${conditions.windGust}km/h, airTemp: ${conditions.airTemp}°C)`);

    // Rate limit
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone: ${updated} updated, ${failed} failed out of ${allSessions.length}`);
  await client.end();
}

main().catch(console.error);
