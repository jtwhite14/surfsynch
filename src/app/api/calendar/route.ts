import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getAuthUserId } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  refreshAccessToken,
  fetchCalendarEvents,
  calculateAvailability,
} from "@/lib/api/google-calendar";
import { addDays } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Strategy 1: Try Clerk's OAuth token API
    let accessToken: string | null = null;
    try {
      const client = await clerkClient();
      const tokenResponse = await client.users.getUserOauthAccessToken(
        clerkUserId,
        "google"
      );
      const tokens = tokenResponse.data;
      if (tokens.length > 0 && tokens[0].token) {
        accessToken = tokens[0].token;
      }
    } catch {
      // Clerk token not available, fall back to DB
    }

    // Strategy 2: Fall back to stored refresh token
    if (!accessToken) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { googleRefreshToken: true },
      });

      if (!user?.googleRefreshToken) {
        return NextResponse.json({
          connected: false,
          message: "Google Calendar not connected",
        });
      }

      try {
        accessToken = await refreshAccessToken(user.googleRefreshToken);
      } catch {
        return NextResponse.json({
          connected: false,
          message: "Calendar access expired. Please reconnect.",
        });
      }
    }

    try {
      // Fetch events for the next 14 days
      const startDate = new Date();
      const endDate = addDays(new Date(), 14);

      const events = await fetchCalendarEvents(accessToken, startDate, endDate);

      // Calculate availability windows
      const availability = calculateAvailability(
        events,
        startDate,
        endDate,
        6, // Day starts at 6am
        20, // Day ends at 8pm
        60 // Minimum 1 hour window
      );

      return NextResponse.json({
        connected: true,
        events: events.slice(0, 50), // Limit events returned
        availability,
      });
    } catch (error) {
      console.error("Error fetching calendar:", error);

      // Check if it's an auth error
      if (error instanceof Error && error.message === "ACCESS_TOKEN_EXPIRED") {
        return NextResponse.json({
          connected: false,
          message: "Calendar access expired. Please reconnect.",
        });
      }

      return NextResponse.json({
        connected: true,
        events: [],
        availability: [],
        error: "Failed to fetch calendar events",
      });
    }
  } catch (error) {
    console.error("Error in calendar route:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar" },
      { status: 500 }
    );
  }
}
